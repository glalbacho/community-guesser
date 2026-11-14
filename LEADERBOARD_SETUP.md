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

- A completed, server-verified score of **at least 1 point** is required. Zero-point runs never qualify.
- Store only the three highest verified results per mode; the third place must be strictly beaten once three entries exist. Equal scores preserve the earlier entry.
- A qualifying player chooses a nickname of 1–20 characters (letters, digits, spaces, period, underscore, hyphen). No account is needed.
- Unsolved Community-le rounds show as `Unsolved`, rather than an invented number of guesses.

## Interface and replay behavior

- **Custom Game has no global Top 3**, because players can use different lives, seasons and modifiers. It still tracks its score and personal best locally. Existing Custom leaderboard rows are not publicly listed, and all direct Custom ranking reads/submissions are rejected by the API. No data is deleted.
- **Season Challenge is retired**: its menu, selector, routes, server game mode and public rankings are disabled. Previously stored season scores are not displayed or accepted through the leaderboard API. The independent **Custom Game** season filter remains available.
- In the interface, Daily Challenge is labeled "resets daily", and Daily/Community-le show the date without "Berlin" or a reset-hour caption. The underlying puzzles continue to roll over at 06:00 Europe/Berlin, including daylight-saving adjustments.
- The Hall of Fame shows "Website Top 3" without displaying a minimum-score caption or the confusing count of modes with scores. The existing one-point minimum continues to be **enforced by the server**.
- The game can still resume an **unfinished** session, but a completed regular run is not automatically reopened when the website is visited again. This avoids a Top 3 name prompt for an old score. Daily puzzles retain finished results so they remain shareable; the One Life, 110 completion hall retains verified perfect-run claims.
- After starting a new game with **Enter** on "Play again", the answer field automatically regains keyboard focus once the next screenshot has loaded, regardless of whether the optional general auto-focus setting is enabled.

## One Life, 110 completion hall

- One Life, 110 is **not a Top 3 leaderboard**. It has its own unranked, unlimited **110 Club** on the One Life game screen. Winners are shown newest first, 50 at a time, with `Show more finishers` to browse the complete list.
- A player can register a self-chosen 1–20-character nickname **only after one server-verified game correctly identifies all 110 different episodes without a single mistake**. The backend checks the completed session, all 110 answers and the 110 distinct episodes; it never trusts a browser-supplied score.
- Each completed session may enter once. Registration uses the existing `cg_sessions.submitted` flag and a unique session identifier in `cg_one110_finishers`. Other highscore rankings remain unchanged.
- Previously verified `challenge:one110` score-110 entries from the old leaderboard are automatically included; lower-score historical entries are excluded. The old Top 3 API rejects any new One Life entries and no longer lists that mode.
- `/api/one110` supports reading pages and registering finished runs. It uses the same D1 database and rate-limit protection, so **no Cloudflare configuration changes are required**.

## Episode Timeline

- **Episode Timeline** appears directly below **Timeline Challenge** in the challenge menu. The original Timeline still orders three *different episodes* by their broadcast order.
- In Episode Timeline, the server selects **one episode** and three of its already-uploaded screenshots: randomly chosen, well-separated moments from approximately the first, middle and last part of the episode. It shuffles the cards for drag-and-drop or Alt+arrow keyboard ordering.
- The server checks their **actual frame positions**, awarding one point only for the completely correct beginning → middle → end order. A wrong sequence ends that run, as in the existing Timeline Challenge.
- The correct order is only returned once the round is answered, when the existing card-reorder animation shows the true sequence and the episode title. The browser receives opaque image tokens until then; no new image uploads are needed.
- The mode has its **own verified website Top 3**, separate from the original Timeline, with the same minimum-one-point and strict-tiebreak rules.

## Architecture

- The browser receives a randomly generated image token and never receives the solution to an unanswered round.
- D1 stores a server-verified game session, each attempt, the current hidden episode, and the leaderboard.
- \`/api/frame/{session}/{token}\` streams the screenshot from the existing free GitHub Pages image repositories **without revealing the original episode-bearing URL to the visitor**.
- The server chooses and checks images for all challenge modes. Daily Challenge and Community-le use their own daily puzzles that reset at 06:00 Berlin time.
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

The build script includes only `index.html`, `assets/`, `css/`, `js/episodes.js`, `js/daily-share.js`, `js/game.js`, and `_routes.json` in `dist`. Neither `src/server` nor the `functions` source are public static files. Run `npm run build` locally to verify before deployment.

## Usability and abuse protections

- A qualifying player sees a focus-managed modal for their self-chosen nickname (1–20 characters). Closing the modal leaves a visible claim button. The modal is shown automatically only once per session; an already-submitted session is confirmed by D1 after a reload and cannot submit again.
- When the game API is interrupted, a Retry connection button appears. The retry first checks server state when needed, preventing duplicate round advances or counted answers after a lost response.
- Correct guesses normally advance and select the next screenshot in one authenticated API request, avoiding a second round-trip.
- D1 maintains sliding time-window style fixed buckets with hashed client IP + time period. Limits: 600 game API requests per five minutes, 80 starts per five minutes, 12 high-score submissions and 240 leaderboard reads per five minutes. The API returns 429 with Retry-After on excess. These limits are a low-cost abuse deterrent, not a replacement for Cloudflare edge/WAF protection; very large distributed floods may still exhaust quotas.
- The image proxy remains unrestricted to avoid extra D1 round trips for image loading; randomly generated session and frame tokens make unguided guessing impractical.

## Touch screenshot navigation

- On phones and tablets, **Classic Easy** and **Custom Game with Three screenshots** allow swiping across the screenshot itself: swipe left for the next image, swipe right for the previous image.
- Existing on-screen arrows and keyboard Left/Right navigation remain available, including after a wrong guess. Swiping never goes before the first or beyond the third screenshot.
- Horizontal gestures require at least 45px travel and must dominate vertical motion; taps, pinch gestures and normal vertical page scrolling are unaffected. Other challenge modes, especially both Timeline modes, do not use screenshot swiping.

## Sharing daily results

Daily Challenge is a five-round quiz, not a Wordle puzzle. Its share dialog displays a separate numbered outcome (correct/missed) for each of the five episode screenshots, the overall score out of five, the puzzle date, and Share / Copy buttons. The copied text contains **no episode IDs, titles or images**, only the five binary outcomes, score, date and link to `#/daily`. The dialog automatically appears once per completed session and can always be reopened via its dedicated button. Community-le retains its existing two-number hint share format. Neither daily mode has a public Top 3.
