# cyberWriter

A single-name generative graffiti performance for a live venue. One repository contains the audience phone, the artist's phone controller, the projector, and the authoritative backend. Built for Next.js on Vercel with native private Blob storage; also runs entirely on a laptop with durable SQLite storage.

## The three screens

| Route      | Device             | Purpose                                                                      |
| ---------- | ------------------ | ---------------------------------------------------------------------------- |
| `/`        | Audience phone     | Submit a tag and watch its queue position update.                            |
| `/control` | Operator phone     | Approve, order, play, hold, direct, and recover the show. Password required. |
| `/wall`    | Projector computer | Full-screen WebGL performance. Pair once from Control.                       |

The normal sequence is **IDLE → GENERATING → DRAWING → DETAIL → HERO → TRANSITIONING → next name**. There is never a wall of simultaneous names. HOLD pauses the lifecycle while living paint continues. BLACKOUT hides the output and pauses the lifecycle without deleting anything.

New submissions require operator approval by default. You can approve them in Queue, or press PLAY NOW to approve and play one. Turning off “Review every submission” applies to future submissions; existing pending entries still require review.

## Local setup

1. Install **Node.js 24 LTS** (minimum supported: 22.13). SQLite uses Node's built-in `node:sqlite` module; older Node versions will not work.
2. Clone this repository and install dependencies:

   ```sh
   git clone https://github.com/krispatl/graffitifest.git
   cd graffitifest
   npm install
   ```

3. Copy `.env.example` to `.env.local`. On PowerShell: `Copy-Item .env.example .env.local`.
4. Set `CONTROL_PASSWORD` to a unique password of at least 8 characters. Set `SESSION_SECRET` to at least 32 random characters. Generate a suitable value with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Keep `STORAGE_DRIVER=local`. Run:

   ```sh
   npm run dev
   ```

6. Visit `http://localhost:3000`. Sign in at `/control`. The database is created at `.data/graffitifest.sqlite`, and survives application restarts. It is excluded from Git. Do not remove `.data` to restart the renderer.

For phone rehearsals, put all devices on the same Wi-Fi, set `NEXT_PUBLIC_APP_URL=http://YOUR-LAPTOP-LAN-IP:3000`, restart the development server, and use that **same URL** on all devices. Allow Node through your local firewall if needed. `localhost` on a phone refers to the phone, not the laptop. Public variables are embedded in the browser bundle, so restart/rebuild after changing them. Use development mode for plain-HTTP LAN rehearsals; production authentication cookies require HTTPS. Wake lock and clipboard support can be restricted on HTTP.

Local mode uses short polling instead of an external realtime service. There is no local Socket.IO server, no ephemeral in-memory queue, and no cloud account required for a rehearsal.

## Deploy on Vercel

No external database, realtime provider, SQL migration, or separate account is required.

1. Import `krispatl/graffitifest` into Vercel, select the Next.js preset and Node.js 24, and keep the default build command (`npm run build`).
2. In your Vercel project, open **Storage → Create Database/Store → Blob**, create a **private** store, and connect it to Production. Vercel supplies the storage credentials automatically (OIDC/store ID or `BLOB_READ_WRITE_TOKEN`). Never expose these through a `NEXT_PUBLIC_` variable.
3. Add `CONTROL_PASSWORD` (8+ characters), `SESSION_SECRET` (32+ random characters), and `NEXT_PUBLIC_APP_URL` (the final HTTPS audience origin, no trailing slash). Use production secrets distinct from your rehearsal secrets.
4. Deploy/redeploy. Vercel automatically selects Blob storage; `STORAGE_DRIVER=blob` is optional there. Do not upload your local `.env.local`.
5. Sign in at `/control`, pair `/wall`, submit a test name, approve it, and check playback. The first mutation creates the installation document automatically. Redeploy and verify that the queue and settings persist.

Use separate stores for preview deployments, or set a distinct `BLOB_NAMESPACE`. By default, documents live beneath `cyberwriter/production/`, `cyberwriter/preview/`, or `cyberwriter/development/`. Preview deployments sharing a store and namespace share a queue; assign a unique namespace for independent rehearsals. Do not rename a live namespace: that selects a different installation.

### Persistence and synchronization

Private Blob holds one versioned installation document plus 16 small rate-limit shards. Reads bypass the CDN cache (`useCache: false`). Writes use the last read ETag (`ifMatch`), so concurrent functions cannot silently overwrite each other. Conflicts retry against current storage. First writes disallow overwriting, including concurrent initialization. Expired rate counters are pruned when their shard is used. Authoritative state never lives in function memory or `/tmp`.

Clients use same-origin HTTP polling: one second on Control and Wall, four seconds on audience phones. Hidden tabs pause polling and refresh on return. Control commands update the sender immediately. There is no WebSocket service to configure. The browser renders animation locally from the seed, settings, and timestamps; frames are never streamed from the server.

The paired projector heartbeats every two seconds. Requests reconcile persisted phase deadlines, without long-running server timers. Automatic playback stops progressing after ten seconds without a projector heartbeat. After reconnection the current piece can catch up, but the next queued piece starts with a fresh timestamp, so an offline projector does not drain the unseen queue.

Blob is billed and rate-limited by Vercel. This deliberately simple single-installation architecture is for a modest live queue, not an unbounded public traffic stream. Every poll reads storage; simultaneous submissions add conditional writes and retries. Rehearse with your expected audience/device count and monitor Storage usage before a venue show. See [Vercel Blob limits and pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) and [consistent private reads](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage).

## Environment variables

| Name                  | Local                             | Vercel                              | Browser-visible? |
| --------------------- | --------------------------------- | ----------------------------------- | ---------------- |
| `STORAGE_DRIVER`      | `local` (default)                 | Automatic `blob`                    | No               |
| `CONTROL_PASSWORD`    | Rehearsal password, 8+ characters | Separate production password        | No               |
| `SESSION_SECRET`      | Random 32+ characters             | Separate random 32+ characters      | No               |
| `NEXT_PUBLIC_APP_URL` | Laptop origin including port      | Canonical HTTPS audience origin     | Yes              |
| Blob credentials      | Not required for SQLite           | Supplied by connected private store | No               |
| `BLOB_NAMESPACE`      | Optional when testing Blob        | Optional installation namespace     | No               |
| `LOCAL_DB_PATH`       | Optional SQLite path              | Unused                              | No               |

The local SQLite filename and browser receipt/session keys retain their original internal names so existing rehearsals keep their data and sign-ins after the cyberWriter rebrand.

## Projector and QR setup

1. On the operator phone, open **Setup → Pair a projector**. Copy the resulting private link to the projector computer and open it within **five minutes**. It can be consumed once and creates a seven-day HttpOnly projector session. The token is in the URL fragment and is immediately removed from browser history after opening.
2. Alternatively, sign in to Control directly on the projector computer and open `/wall` in the same browser. That uses the 12-hour operator session; pairing is preferable for a whole exhibition.
3. Put the browser on the projector display. Double-click the projection to request fullscreen, or use the browser's fullscreen shortcut (typically F11). A keyboard-focusable fullscreen button is also available near the bottom-right corner, and appears on hover/focus. The cursor is hidden during presentation.
4. Use a recent Chrome or Edge browser with hardware acceleration. The output follows the canvas aspect ratio, including 16:9, ultrawide, and portrait. Long names split into two composed rows. Pixel ratio is capped at 1.5 to limit GPU load.
5. Disable the operating system's display sleep. The app requests a wake lock where supported and visible, but a browser cannot override every OS policy.
6. While idle, the wall displays a QR code for `NEXT_PUBLIC_APP_URL`. Scan it from a phone to verify the actual URL and connectivity. It disappears while a name is playing. No debug information is visible at the normal `/wall` URL.

Use only one active projector output for the installation during a show. Multiple wall windows share the same state and presence, so an accidentally open test wall can keep playback advancing.

### Calibration and diagnostics

- `/wall?calibrate=true`: grid, center circle, and 5% safe frame. Change scale, horizontal/vertical offset, and rotation from **Control → Setup**. This is framing calibration; use the projector's hardware keystone/corner controls for perspective correction.
- `/wall?debug=true`: FPS, GPU description, viewport dimensions, connection, pairing status, phase, performance ID, and queue size.
- `/wall?fps=true`: FPS only.
- Parameters can be combined. Remove them for presentation. Blackout hides the grid and diagnostics too.

## Phone control

**Live:** NEXT transitions the active piece out and selects the next approved name. SKIP immediately removes the current piece and advances. HOLD freezes the phase timer; RESUME continues it. REPLAY uses the same seed and settings. REGENERATE uses a fresh seed and current settings. RANDOMIZE also selects random style and palette. KILL / CLEAR requires confirmation, clears the artwork, preserves the queue, and disables automatic playback.

**Queue:** Tap a row to preview a possible composition, edit spelling, approve, play immediately, move up/down, remove, or block that spelling. Preview is an art-direction sample; the final performance gets its own seed. Blocking also removes queued duplicates. Unblock from the list beneath the queue. Explicit move buttons work reliably on phones; drag-and-drop is intentionally unnecessary.

**Art:** Random, Wildstyle, Throw-up, Tag, Block, Chrome, Acid, and Experimental composition; intensity 1–5; drips, splatter, overspray, distortion, particles, letter complexity, and paint animation speed. Eight named/custom palette choices plus random. Style, palette, intensity, distortion, construction settings, and transition choice apply to the next piece. Use REGENERATE to apply them to the current name. Drip amount, particle amount, living animation speed, and calibration can update live.

**Timing:** Every phase is configurable. Normal is 1s intro + 8s drawing + 3s detail + 14s hero + 3s transition = **29 seconds**. Fast totals 20.5 seconds; Long totals 40 seconds. MANUAL keeps HERO indefinitely. Auto advance off also preserves HERO until NEXT. Timing edits are snapshotted at generation and apply to the next piece; manual/auto-advance policies apply immediately.

**Transitions:** BUFF rolls textured bands over the piece; DISSOLVE erodes it with fine aerosol noise; MELT moves paint down in uneven runs; OVERSPRAY covers it with noisy paint; WALL SHIFT moves the surface sideways; GLITCH tears horizontal strips apart. Random chooses deterministically from the performance seed.

## Security and retention

- Operator passwords and signing secrets remain server-side. Operator sessions are signed, HttpOnly, SameSite=Strict, Secure over production HTTPS, and expire after 12 hours. Changing either secret invalidates operator and projector sessions. Signing out clears that browser's operator cookie.
- Pairing grants only projector heartbeat access, not queue or art controls. Pairing links expire after five minutes and are single-use.
- Mutations validate Origin and input schemas. Login is limited to eight attempts per IP per 15 minutes, in persistent storage. Submissions are limited to 120 per public IP per minute to allow shared venue Wi-Fi, with a total queue cap of 250. Local rehearsals intentionally share one rate-limit bucket.
- The public API omits pending names, blocked names, and receipt hashes. A random receipt saved in the submitting phone's local storage retrieves only that phone's tag status. The currently projected name is public.
- The last 200 completed/removed submissions and last 200 command IDs are retained. Old receipt status eventually expires. Active queue entries remain until played or moderated. Name blocking applies to normalized spelling, not a person's identity. This is operator moderation, not an automatic profanity classifier.
- Protect `.env.local`, `.data`, database backups, and storage credentials. None belong in Git.

## Three-device acceptance rehearsal

1. **Computer C:** Pair `/wall`, enter fullscreen, and verify idle QR. **Phone B:** Sign in to Control; verify SERVER and PROJECTOR both connected. **Phone A:** Scan the QR.
2. A submits **KRIS**. A sees position 1 and review status; B sees KRIS in Queue. B taps PLAY NOW.
3. C sprays KRIS into existence, adds detail, and enters HERO. A reports “You're on the wall.” Verify the full name is readable from the venue floor.
4. B presses HOLD. Wait longer than the configured hero duration. The artwork stays, with subtle paint movement. Refresh B and C: the same performance ID and seed remain.
5. A second audience device submits **MARIA**. B approves it and presses NEXT. KRIS transitions away; MARIA begins. The queue contains no duplicates.
6. Test BLACKOUT and RESTORE. Check that both the active piece and queue survive. Test renderer reset, reconnect, and temporary projector network loss. Disconnect the projector for more than ten seconds and confirm unseen queued names are not consumed.
7. Test a 3-character tag and a 12–16-character tag. Adjust framing with the calibration grid. Test every transition at the actual projector resolution before the event.

## Troubleshooting and reset

| Symptom                         | Check / recovery                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue unavailable / 503         | Private Blob connection, storage credentials, namespace, and Vercel function logs. Local mode needs Node 22.13+ and a writable database path.                                                             |
| Projector offline               | Open its paired wall, check Wi-Fi, create a new pairing link if the session expired, and confirm the canonical hostname matches.                                                                          |
| Queue does not start            | Approve a name; check projector presence, blackout, auto advance, and MANUAL. NEXT explicitly starts an approved piece from idle.                                                                         |
| Updates arrive slowly           | Check connectivity and Vercel storage limits. Visible phones poll every four seconds; Control and Wall poll each second.                                                                                  |
| Wrong QR / phone cannot connect | Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin or laptop LAN origin, then restart/rebuild. Do not use localhost for phones.                                                                         |
| Login fails on local phone      | Use `npm run dev` on a trusted rehearsal LAN; Secure production cookies need HTTPS. After eight attempts, wait 15 minutes.                                                                                |
| Poor frame rate                 | Enable hardware acceleration, lower projector resolution/particles, close other GPU-heavy tabs, and use `/wall?fps=true`.                                                                                 |
| WebGL context fails             | The wall attempts context recovery. A static Canvas2D piece is the fallback, without GPU spray/transition animation. Use RESET RENDERER, then RECONNECT WALL; inspect the browser console if it persists. |
| Name clipped                    | Reset calibration, use the native display aspect ratio, reduce scale, and check projector keystone/overscan.                                                                                              |

Recovery order: **BLACKOUT → RESET RENDERER → RESTORE**. If needed, **RECONNECT WALL** reloads the paired output without touching the queue. KILL / CLEAR is a separate, confirmed action and turns off auto advance. Restarting the server also preserves the database.

For a completely new local event, stop all app processes and **back up** `.data/graffitifest.sqlite` and any `-wal`/`-shm` companions before moving the `.data` directory aside. A fresh directory is initialized on the next start. For production, export/backup the private installation JSON document before clearing it through the Vercel Storage dashboard. Do not delete storage or reset a production queue while the venue is running.

## Development and verification

```sh
npm test                  # state-machine, authentication, validation, SQLite concurrency/persistence
npm run typecheck
npm run build             # production build, also required before integration test
npm run test:integration  # isolated production server on 127.0.0.1:3100; independent API clients
```

The integration test verifies unauthorized access, CSRF, signed cookies, single-use pairing, idempotent submissions, private receipt views, moderation, playback, HOLD, blackout, NEXT, stale commands, and rate limits. It uses a temporary SQLite database and does not touch the rehearsal/show queue. Port 3100 must be free.

An optional Playwright audience smoke test is included: with a **disposable** local server on port 3000, run `npx playwright install chromium` then `npm run test:e2e`. It submits `BROWSER QA` and checks refresh persistence at phone size. Set `E2E_URL` to another disposable test origin if needed. Never point it at a live venue. The CI workflow runs unit tests, build, and the isolated API integration test; it does not claim a live Vercel Blob or physical-projector test.

## Code map

```text
app/                    Three routes and server API handlers
components/audience/    Submission and live receipt
components/control/     Mobile performance desk
components/wall/        Output, pairing, calibration, GPU recovery
lib/queue/              Authoritative state machine and public/operator views
lib/database/           Vercel private Blob ETag CAS and durable local SQLite adapter
lib/auth/               Signed sessions and password checks
lib/realtime/           Same-origin polling, reconnect, clock offset
lib/graffiti/           Composition, styles, palettes, GPU renderer, spray,
                        splatter, particles, drips, and animation director
tests/                  Unit, persistence, API integration, optional browser test
```

The artwork is generated procedurally from a seeded composition and locally bundled typefaces (Anton, Bangers, Permanent Marker under their included SIL Open Font Licenses). Canvas builds textured letter layers; Three.js shaders animate their construction and transitions on the GPU. There are no external image-generation calls, font-CDN dependencies, or paid image-generation APIs per participant. GPU particles are deliberately bounded rather than allocating millions of geometry objects; per-pixel noise supplies the fine aerosol breakup.

Current scope is one installation per database. Venue-scale traffic and the final projection quality should be rehearsed against your actual Vercel plan, network, GPU, and projector. Cloud credentials were not available during repository construction, so production Blob connectivity must be smoke-tested after connecting a store. Local API integration and mocked concurrent Blob transactions are tested; a live cloud deployment is not claimed.
