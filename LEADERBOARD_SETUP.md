# Community Guesser — Cloudflare Pages deployment

The protected screenshot game and verified Top 3 high scores require **Cloudflare Pages Functions and D1**. The **Build output directory must be \`dist\`**, never \`.\`, or server-only files could become public assets. This project cannot run the secure game on GitHub Pages alone: GitHub Pages does not execute \`/functions\`.

## Cloudflare setup (no paid services required at modest traffic)

1. Open Cloudflare Dashboard → **Workers & Pages** and select the Pages project connected to **glalbacho/community-guesser**. Set **Build command** to \`npm run build\` and **Build output directory** to \`dist\`. Keep **Root directory** empty / the repository root. The Cloudflare Pages \`functions/\` folder remains in the repository root (outside \`dist\`).
2. Under **D1 SQL Database**, create a free database, e.g. \`community-guesser-db\`, unless you already have a D1 database for the project.
3. In the Pages project, open **Settings → Bindings → Add → D1 database bindings**. Set the **Variable name** to exactly \`DB\`. Select the D1 database. Configure it for **Production**, and also for **Preview** if testing a preview branch. The correct variable name is essential.
4. Deploy/redeploy the Pages project. Tables and indexes are created automatically by the Pages Functions; **no manual SQL** is needed.
5. Test on the Cloudflare Pages domain:
   - \`/api/leaderboard?mode=classic:normal\` must return a JSON object with \`entries\`.
   - Open the game, inspect the image URL. It should start with \`/api/frame/\`, and contain **no** episode code.
   - Make a wrong guess and verify the answer is shown *only after* the guess.
   - Complete a game and check that Top 3 submissions work with a nickname.

If you are using a custom URL such as \`/community-guesser/\`, verify that the **page and the \`/api/*\` endpoints are served by the same Cloudflare Pages deployment/origin**. A GitHub Pages site with only Cloudflare DNS is not enough.

## Leaderboard rules

- No minimum score: even a finished game with 0 points can qualify if a place is available.
- Store only the three highest verified results per mode; the third place must be strictly beaten once three entries exist. Equal scores preserve the earlier entry.
- A qualifying player chooses a nickname of 1–20 characters (letters, digits, spaces, period, underscore, hyphen). No account is needed.
- Unsolved Community-le rounds show as `Unsolved`, rather than an invented number of guesses.

## Architecture

- The browser receives a randomly generated image token and never receives the solution to an unanswered round.
- D1 stores a server-verified game session, each attempt, the current hidden episode, and the leaderboard.
- \`/api/frame/{session}/{token}\` streams the screenshot from the existing free GitHub Pages image repositories **without revealing the original episode-bearing URL to the visitor**.
- The server chooses and checks images for all challenge modes. Daily Challenge and Community-le share the same puzzle on the same Berlin date (06:00 reset).
- \`/api/leaderboard\` reads only the **verified** \`cg_leaderboard\` entries. Old, unverifiable records in the former \`leaderboard\` table are intentionally not imported.
- \`_routes.json\` invokes the Pages Functions only for \`/api/*\`, keeping normal HTML, CSS, and JavaScript requests outside the Functions quota.
- GitHub repository history still contains the old frame/episode catalogue. Like any image-guessing game, screenshot matching cannot be prevented; this protection removes direct inspection of the episode ID and simple client-side score spoofing.
- No encryption key, passwords, user registration or R2 storage are required.

If the API returns HTTP 503 saying the database is not configured, check the D1 **DB** binding for the relevant Preview or Production environment and redeploy.

## Safe build configuration

In **Settings → Build → Build configuration**, click the pencil icon and set:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: empty (repository root)

The build script includes only `index.html`, `assets/`, `css/`, `js/episodes.js`, `js/game.js`, and `_routes.json` in `dist`. Neither `src/server` nor the `functions` source are public static files. Run `npm run build` locally to verify before deployment.
