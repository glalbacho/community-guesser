# Community Guesser – private-frame security rollout

The application already keeps the answer and frame-number registry out of the
**built browser assets**. This does **not** protect those files while the GitHub
source repository is public. The public GitHub Pages image collections also
permit perfect byte-hash lookup. A proxy that forwards the original bytes does
not remove that vulnerability.

## Changes already prepared in the repository

- Game, timeline, daily and meme frame selection now use cryptographic random
  values; no `Math.random()` in the server selection code.
- Game API: 300 calls per source IP and 240 calls per session in five minutes;
  game starts: 30 per IP in five minutes.
- Frame API: 180 calls per IP and 100 per session in five minutes.
- Meme API: 12 random-generation calls and 120 image requests per IP in five minutes.
- Private R2 support, shared between normal screenshots and the meme editor.
- When a private bucket is present, the app **will not serve raw private frames**
  if the encoder is missing. A strict mode can require both bindings.
- CI runs `npm test` and `npm run build`.

These limits target bulk harvesting, not determined attackers rotating IPs.
Adjust only after looking at legitimate user traffic, especially school NATs.

## Required Cloudflare setup (NOT performed by a GitHub push)

**Do not privatize or delete the existing image repos first.** GitHub Pages for
those repositories can be unpublished automatically, breaking the game.

1. Create a **private** Cloudflare R2 bucket, e.g. `community-guesser-frames`.
   Do **not** attach a public R2.dev/custom-domain endpoint.
2. Import the WebP images from all three
   `community-guesser-assets/community-images-1..3` repositories into the
   **same** bucket. Preserve object keys like
   `S01E01/S01E01_0004.webp`. The season split between original repositories
   does not matter once their episode folders share the same bucket.
   Download a complete copy before any repository visibility/history changes.
3. Deploy the independent Worker in `worker/frame-encoder/` using
   `npx wrangler deploy --config worker/frame-encoder/wrangler.toml`.
   It uses the **Images** binding and disables its public `workers.dev` URL.
   Cloudflare bills unique image transformations; randomizing every request can
   quickly exhaust the free monthly allowance. Review the Images plan/cost first.
4. In **Cloudflare Pages → your project → Settings → Bindings**, bind:
   - **R2 bucket** named `FRAME_BUCKET` to the private bucket.
   - **Service binding** named `FRAME_ENCODER` to `community-frame-encoder`.
   Pages Functions do not directly support the Workers Images binding.
5. Redeploy Pages, then test a screenshot, Easy Mode's three screenshots,
   Episode Timeline, Daily Challenge recap, the meme editor and image download.
   The initial API still returns opaque `/api/frame/SESSION/TOKEN` URLs.
   Check that screenshots are real decoded WebPs and that repeated requests for
   the same token yield different binary hashes. Visually they should remain
   almost identical. Verify that no new response exposes a GitHub image URL.
6. After **all expected frames are present** and tests pass, set Pages
   environment variables `FRAME_SOURCE=r2` and
   `FRAME_SECURITY_REQUIRED=true` (for production and preview as appropriate),
   redeploy and test once more. This turns missing private bindings into errors
   rather than silently falling back to the old public origin.
7. Only now make the three GitHub asset repositories **private** and remove any
   public Pages sites for them. Confirm the game still functions.
8. Make `glalbacho/community-guesser` private, preserving Cloudflare's
   access to the private GitHub repository. Test automatic build/deploy again.

**Important:** With no R2/encoder bindings, the app currently retains the
legacy public-origin fallback to avoid an accidental outage. The identical-byte
vulnerability is therefore **not resolved** by the Git commit alone.

### Optional upload using AWS CLI

Configure a Cloudflare R2 API token with *write access only to the selected
bucket* on your own machine, never in this repository. For example:

```bash
git clone --depth 1 https://github.com/community-guesser-assets/community-images-1.git
git clone --depth 1 https://github.com/community-guesser-assets/community-images-2.git
git clone --depth 1 https://github.com/community-guesser-assets/community-images-3.git
```

Then, for each directory, run an AWS CLI `s3 sync` with your R2 credentials:

```bash
aws s3 sync community-images-1 s3://community-guesser-frames --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com --exclude "*" --include "*.webp"
aws s3 sync community-images-2 s3://community-guesser-frames --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com --exclude "*" --include "*.webp"
aws s3 sync community-images-3 s3://community-guesser-frames --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com --exclude "*" --include "*.webp"
```

Compare all episode keys and WebP counts to the source repositories before
moving on. Do not leave the R2 API token in shell history or Git.

## Git history cleanup (destructive; postpone until after migration)

`git filter-repo` can remove **old** `js/images.js` revisions, but rewriting
history changes every affected commit SHA and requires force-pushing all
rewritten refs. It does not revoke already cloned data, GitHub caches, or public
forks. Audit the old history for other original URLs and mapping copies first.
Keep an offline backup, coordinate with anyone using the repository and re-clone
every checkout afterward. A deliberate `git filter-repo` operation on a mirror
is appropriate only after migration and backup; it was **not** run automatically.

Given the old public image files, even a private repository and random
re-encoding cannot guarantee resistance to perceptual hashing, scene matching,
or content recognition. The goal is removal of trivial *exact* lookup, plus
cost controls and significantly greater effort for bulk matching.
