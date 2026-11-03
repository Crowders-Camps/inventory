# Inventory Tool — notes for Claude

Crowders Camps' supply inventory tool (non-food). Ported from the Inventory mode of the Kitchen Prep Builder (`Crowders-Camps/kitchen-prep`). Static page on GitHub Pages, saved data in this repo, a Cloudflare Worker in between. No build step.

## Layout
- `index.html` — the live tool. One self-contained file: HTML, CSS, JS.
- `preview/index.html` — next version. Change this first; copy over `index.html` only after the owner approves.
- `worker/worker.js` + `wrangler.jsonc` — the save relay (Cloudflare Worker). Cloudflare builds it from `main`.
- Branch `live-data`, file `data/live.json` — every Push live is a commit here. Never edit by hand; use the site's Version history to roll back.

## Data model (live.json `state`)
- `cats` — categories `[{id, name}]`, in display order.
- `items` — the index `[{id, name, cat (category id|null), retired}]`.
- `inv` — absent until first edited. `c.<SITE> = {locs:[{id,name,items:[itemId]}], stock:{itemId:number}}`, one independent set per site. `log:[{at, by, c, n (items counted), of (items listed), ch (counts changed)}]`, capped at 400. A Push live from the Inventory tab adds a log entry for the site shown.
- Counts are keyed by item id, so renaming an item keeps its counts.
- Pushing: when a newer live version arrives, the page merges it with unpublished changes if they touch different parts (`cats`, `items`, each site's inventory; logs are combined). Only overlapping edits show the conflict choice.

## Rules that must not change
- Blank = not counted; 0 = none on hand.
- Push live always asks who is pushing (first name or initials). From the Inventory tab it always logs a count for the site shown, even when nothing changed; from the Index tab it logs only sites whose counts changed.
- Removing a storage location never loses items or counts (they move to Not assigned). Loading an old version never drops log entries.
- No camper or staff personal information anywhere in this repo (it is public). Log names are first names or initials.
- The page holds no keys; only the relay writes to GitHub.
- Look follows the Crowders Camps Design System, light and dark, phone width.

## Settings in the page
Constants at the top of the script: `SITES`, `SITE_NAME`, `STARTER_LOCS` (one location, Main storage), `STARTER_CATS` (used only until the first push), `REMOTE_URL` (the Worker address, `https://inventory.nate-5ff.workers.dev`; set it to `__RELAY_URL__` to run in preview mode, saving on the device only).

## Testing
`npm install` then `npm test` (or `node tests/run.js --shots` for screenshots in `tests/shots/`). `tests/run.js` serves the page from a fake address, swaps `REMOTE_URL` for a fake relay (`tests/fake-relay.js`) seeded with `data/sample-live.json`, and runs 20 checks: counting, Enter-to-next, locations, moving items, Push live & log, empty push still logs, merge, conflict, discard, version history, index, categories, import, links, phone width, dark mode. It never pushes to the real live version. Set `PAGE=index.html` to test the live file instead of `preview/`.
