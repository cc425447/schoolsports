// Fetches St Andrew's 14A basketball data from the ISA draw site and writes data.json.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const FIXTURES = 'https://fixtures.clipboard.app/isa/fixtures?associationSeasonId=e94f3fa0-158f-11f0-ac93-6bf44416c9ad&associationActivityGradeIds=%5B%22711aa164-d787-11ef-bde6-6911b959edfa%22%5D&organisationIds=%5B472%5D&competitionGroupIds=%5B%222bc0fd94-8c12-4bad-ad4f-50585f703c0b%22%5D&round=_all';
const LADDER = 'https://fixtures.clipboard.app/isa/ladder?associationSeasonId=e94f3fa0-158f-11f0-ac93-6bf44416c9ad&associationActivityTypeIds=%5B%5D&associationActivityGradeIds=%5B%22711aa164-d787-11ef-bde6-6911b959edfa%22%5D&view=table&competitionGroupId=2bc0fd94-8c12-4bad-ad4f-50585f703c0b';
const SCHOOL = "St Andrew's Cathedral School";
const TEAM = '14A';
const TZ = 'Australia/Sydney';

async function load(browser, url, match) {
  const page = await browser.newPage();
  let body = null;
  page.on('response', async (r) => {
    if (r.url().includes(match) && (r.headers()['content-type'] || '').includes('json')) {
      try { body = await r.json(); } catch {}
    }
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  const text = await page.innerText('body');
  await page.close();
  if (!body) throw new Error('No data received from ' + match);
  return { body, text };
}

const listOf = (b) => Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Object.values(b || {}).find(Array.isArray) || [];
const team = (p) => `${p.organisation.shortName} ${(p.team?.linkedTeamName || p.team?.freeTextTeam || '').replace(/\s+/g, '')}`.trim();
const isUs = (p) => p.organisation?.name === SCHOOL && (p.team?.linkedTeamName || '').replace(/\s+/g, '') === TEAM;

function parts(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const f = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { d, date: `${p.weekday} ${p.day} ${p.month} ${p.year}`, time: `${p.hour}:${p.minute}${(p.dayPeriod || '').toLowerCase()}`, hm: `${p.hour}:${p.minute}` };
}

function addresses(text) {
  const out = {};
  const blocks = text.split(/\n(?=Round \d+\n)/);
  for (const b of blocks) {
    const m = b.match(/^Round (\d+)\n/);
    if (!m) continue;
    const i = b.indexOf('location_on');
    if (i < 0) continue;
    const line = b.slice(i).split('\n').find((l) => /\b(NSW|VIC|QLD|ACT|SA|WA|TAS|NT)\b\s*\d{4}/.test(l));
    if (line) out[m[1]] = line.replace(/,\s*Australia\s*$/, '').trim();
  }
  return out;
}

const tidy = (s) => (s || '').replace(/\s+-\s+/g, ', ').trim();

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const fx = await load(browser, FIXTURES, '/association-api/fixtures?');
  const ld = await load(browser, LADDER, '/association-api/ladders?');
  await browser.close();

  const addr = addresses(fx.text);
  const now = new Date();
  const rounds = listOf(fx.body).map((f) => {
    const homeUs = isUs(f.forParticipant);
    const us = homeUs ? f.forParticipant : f.againstParticipant;
    const them = homeUs ? f.againstParticipant : f.forParticipant;
    if (!isUs(us)) return null;
    const t = parts(f.startDateTime);
    const loc = f.location;
    const court = tidy(loc?.subLocations?.[0]?.name);
    const locName = tidy(loc?.name);
    const rn = String(f.roundName || '').replace(/\D+/g, '');
    const street = addr[rn] || '';
    const suburb = (street.match(/,\s*([^,]+?)\s+(?:NSW|VIC|QLD|ACT|SA|WA|TAS|NT)\s*\d{4}/) || [])[1] || '';
    const tbc = !loc || t.hm === '2:34';
    const sc = f.result?.score || {};
    const pf = sc.for?.Points, pa = sc.against?.Points;
    const has = pf != null && pa != null;
    let mine = has ? (homeUs ? pf : pa) : '';
    let theirs = has ? (homeUs ? pa : pf) : '';
    let outcome = '', note = '';
    if (has) {
      outcome = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
      // The stated result (from forParticipant's view) is official and matches the ladder.
      // If it disagrees with the points, the points were entered the wrong way round: swap them.
      const rt = f.result?.resultType;
      const statedUs = rt === 'W' ? (homeUs ? 'W' : 'L') : rt === 'L' ? (homeUs ? 'L' : 'W') : rt === 'D' ? 'D' : '';
      if (statedUs && statedUs !== outcome) {
        if (statedUs !== 'D') [mine, theirs] = [theirs, mine];
        outcome = statedUs;
      }
    }
    return {
      round: Number(rn) || rn, d: t.d, date: t.date, time: tbc ? 'TBC' : t.time,
      opp: team(them), home: homeUs,
      place: loc ? [court || locName, suburb].filter(Boolean).join(' · ') : '',
      venue: loc ? [court, locName, street].filter(Boolean).join(', ') : '',
      for: mine, against: theirs, outcome, note,
    };
  }).filter(Boolean).sort((a, b) => a.d - b.d);

  const played = rounds.filter((r) => r.for !== '');
  const last = played[played.length - 1];
  const next = rounds.find((r) => r.for === '' && r.d > now);

  const pools = ld.body?.data?.ladderData?.[0]?.competitionPools || [];
  const rows = pools.flatMap((p) => p.rows || []);
  const me = rows.find((r) => r.team?.organisationName === SCHOOL && (r.team?.name || '').replace(/\s+/g, '') === TEAM);
  const c = me?.columns || {};

  const data = {
    updated: new Date().toLocaleDateString('en-CA', { timeZone: TZ }),
    record: { played: c.P ?? played.length, won: c.W ?? 0, lost: c.L ?? 0, drawn: c.D ?? 0, position: me?.rank ?? null, teams: rows.length || null },
    next: next ? { date: next.date, time: next.time, opp: next.opp, venue: next.venue } : { date: '', time: '', opp: '', venue: '' },
    last: last ? { date: last.date, opp: last.opp, for: last.for, against: last.against, outcome: last.outcome, note: last.note } : { date: '', opp: '', for: '', against: '', outcome: '', note: '' },
    rounds: rounds.map(({ d, note, ...r }) => r),
  };
  writeFileSync(new URL('../site/data.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated: ${data.record.played} played, next ${data.next.date || 'none'}, ${rounds.length} rounds`);
})().catch((e) => { console.error(e); process.exit(1); });
