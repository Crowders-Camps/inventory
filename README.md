# Supply Inventory

Crowders Camps' inventory tool for non-food supplies: count what's on hand at Ridge, Springs and South Mountain, sorted by storage location, with a shared live version, a count log and version history.

- Live tool: https://crowders-camps.github.io/inventory/
- Next version (preview): https://crowders-camps.github.io/inventory/preview/
- Bookmarks: `#inventory.ridge`, `#inventory.springs`, `#inventory.sm`, `#index`

How it fits together: the page (`index.html`) is a static file on GitHub Pages. Every **Push live** goes to a Cloudflare Worker (`worker/worker.js`), which commits `data/live.json` to the `live-data` branch. The page holds no keys.

See `HANDBOOK.md` for daily use and upkeep, and `CLAUDE.md` for notes on the code. This repo is public: no camper or staff personal information, ever.
