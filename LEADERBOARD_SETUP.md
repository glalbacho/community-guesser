# Website-wide Top 3 (Cloudflare Pages)

This repository contains a Cloudflare Pages Function at `functions/api/leaderboard.js` serving `GET/POST /api/leaderboard`.

**Required setup:** In the Cloudflare dashboard, create a **D1 SQL database** for Community Guesser. Open the Cloudflare Pages project that serves this repository, go to **Settings → Bindings** (or **Settings → Functions → D1 database bindings** depending on your dashboard), and bind the database under the variable name **`DB`**. Redeploy the site. The function creates its table and index on the first request.

Without the D1 binding, the API deliberately returns HTTP 503 and **does not pretend browser-local scores are website-wide rankings**.

### Leaderboard rules

- Classic Easy: at least **15** correct in a streak.
- Classic Normal, Hard, Impossible: at least **10** correct in a streak.
- Other challenges: minimum **1** (a solved Community-le scores `7 - guesses`).
- Each game mode has its own separate top three. Season Challenge is separated by season; Custom Game is separated by selected seasons and lives.
- Daily Challenge and Community-le have **date-scoped** leaderboards.
- On completion, if a score qualifies for the top three, the visitor can enter a 2–20 character nickname. Only after submitting their nickname will the top three be revealed. Names and scores are public.
- Results from two equally scoring players are ranked by submission order; to enter a full leaderboard a new score must strictly beat the third score.
- For privacy, no account or email address is requested.

**Integrity caveat:** The browser reports its score to the server. This prevents casual inconsistencies, but it is **not anti-cheat**. Real verified competition would require authenticated users and server-verified challenge state. For small community play this is a lightweight starting point.

### Quick test

After binding the database and redeploying, open `/api/leaderboard?mode=classic:normal` on the deployed origin. It should return `{"entries":[],"minimum":10}` before any submissions.
