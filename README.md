# St Andrew's 14A Basketball

A phone-friendly page showing St Andrew's Cathedral School 14A's next game, last result, season record and full ISA draw.

GitHub Actions checks the ISA draw site every 30 minutes on **Saturdays from 8am to 4pm** and at **noon on weekdays** (Sydney time). The data is saved to the repository only when something has changed, and the page shows when it last checked.

## Files

- `site/index.html` – the page
- `site/data.json` – the latest games, results and ladder (updated automatically)
- `scripts/update.mjs` – fetches the data from the ISA draw site
- `.github/workflows/update-and-deploy.yml` – the schedule that runs the update and publishes the site

## One-time setup

1. Upload all these files to the repository's `main` branch (keep the folder structure, including `.github`).
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, choose **Update 14A data and publish site**, and click **Run workflow** once.
4. When it finishes, the site is live at `https://<your-username>.github.io/<repository-name>/`.

## Next season

The season, grade and school codes are at the top of `scripts/update.mjs`. Replace the two links with the new season's filtered draw and ladder links from fixtures.clipboard.app.

## Daylight saving

GitHub schedules run on UTC, so the times above are for daylight saving (October to April). Outside daylight saving every check runs an hour earlier: Saturdays 7am to 3pm, and 11am on weekdays. GitHub can also start scheduled runs a few minutes late when it is busy.
