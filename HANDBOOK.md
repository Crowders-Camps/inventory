# Supply Inventory: handbook

The Supply Inventory tool counts non-food supplies (cleaning, office, program gear, maintenance, first aid) at **Ridge**, **Springs** and **South Mountain**. Each site has its own storage locations and its own counts. One shared index lists every item.

**Link:** https://crowders-camps.github.io/inventory/
**Bookmarks:** add `#inventory.ridge`, `#inventory.springs`, `#inventory.sm` or `#index` to the end of the link to open straight to a site or the Index. The **Copy link** button gives you the link for whatever you're looking at.

---

## Daily use: doing a count

1. Open the tool and pick your site (**Ridge / Springs / South Mtn**).
2. Work through each storage location. Type what's on hand in each box and press **Enter** to jump to the next one.
   - **Blank** means not counted. **0** means none on hand.
   - A yellow box is a count you changed that hasn't been pushed yet.
   - Counts carry over from last time, so you only have to change what's different.
3. Press **Push live** in the bar at the top. When it asks **Who did this inventory?**, type your **first name or initials** (the page is public, so no full names) and press **Push live & log**.
4. The side panel now shows your count as the **Last completed inventory** and adds it to the site's log.

**Nothing changed?** Press Push live anyway. It still logs a completed count with 0 changes.

**Narrowing the list:** the location chips (**All**, each location, **Not assigned**) show one location at a time, each with *counted/total*. **Find an item** searches by name. The **category** menu shows one category. You can combine all three.

**Until you push, your counts are a draft on that device only.** If you close the tab, they're still there when you come back on the same device. **Discard changes** (click twice) throws the draft away.

## Setting up a site's storage

- **Edit locations** (top of the list) lets you add, rename, move up/down, or remove a location. Removing a location never loses anything: its items and counts move to **Not assigned**.
- New sites start with one location, **Main storage**.
- **Put an item in a location:** type it in the "Add an item to…" box at the bottom of that location (the box suggests names from the index), or change the row's **Location** menu.
- **Sort A–Z** puts a location's items in alphabetical order. Otherwise they stay in the order you added them, so you can match the shelf.

## The Index (the list of items)

Open the **Index** tab.

- **Add an item:** name + category, then **Add to index**. Names can't repeat (capitals and extra spaces don't count as different). A new item shows up under **Not assigned** at every site until someone places it.
- **Paste a list:** one item per line. Start a line with a category and a comma (`Cleaning, Bleach 1 gal`) or paste two columns from a spreadsheet (category, then item). Lines without a category go into the one you pick. New category names are created, and names already in the index are skipped.
- **Rename:** edit the name in place. Counts and locations stay with the item.
- **Retired:** takes an item off the inventory lists but keeps its old counts. Uncheck to bring it back.
- **Delete (×, click twice):** removes the item and its counts at every site. Use Retired if you might want it back.
- **Categories** (side panel): add, rename, reorder (this order is used in every menu), or remove. Removing a category makes its items **Uncategorized**; nothing is deleted.

Index changes also need **Push live** before anyone else sees them.

## When two people work at once

The page checks for a newer live version every 15 seconds and whenever you come back to the tab.

- **Different things** (say, you're counting Ridge while someone counts Springs or edits the index): the two are combined automatically when you push. Nothing is lost, and both counts are logged.
- **The same thing** (you both changed Ridge's counts): the bar turns red and gives you a choice. **Load the live version** drops your changes. **Push mine anyway** (click twice) replaces theirs. If you're unsure, talk to the other person first; their version is still in Version history either way.

## Version history (undo)

Every push is saved. **Version history** in the top bar lists them with who pushed and when.

1. Press **Load as draft** on the version you want.
2. Check it.
3. Press **Push live** to make it the live version again.

Going back to an old version **never erases the inventory log**. Every count that was logged stays logged.

---

## Access

- **Using the tool:** no login. Anyone with the link can view, count and push. Version history is the safety net, so share the link with staff only.
- **The code (GitHub):** repo `Crowders-Camps/inventory`. Teammates who maintain it get **Write** through the org team (Org → Teams → the team → Repositories).
- **The save relay (Cloudflare):** Worker `inventory` on Nate's Cloudflare account. To add a maintainer: Cloudflare → Manage account → Members → invite with a Workers admin role.
- **The GitHub key** lives only as the `GITHUB_TOKEN` secret in the Worker. It is a fine-grained token owned by the Crowders-Camps org, limited to this repo, Contents read/write. It isn't saved anywhere else.

## Upkeep

- **Changing the tool:** edit `preview/index.html` first and check it at `…/inventory/preview/`. Copy it over `index.html` only once Nate approves. Run `npm test` before copying.
- **Note:** the preview page uses the same live data as the real tool. Pushing from the preview is a real push.
- **Sites or starter locations:** `SITES`, `SITE_NAME` and `STARTER_LOCS` at the top of the page's script.
- **Never edit `data/live.json` by hand.** It lives on the `live-data` branch and every push is a commit there. To roll back, use Version history.
- **Log size:** the log keeps the last 400 entries.
- **Custom address later** (e.g. `supplies.crowderscamps.com`): add it, comma-separated, to `ALLOWED_ORIGIN` in `wrangler.jsonc`, commit, and confirm Cloudflare redeployed.
- **Privacy:** the repo and data are public. Log names are first names or initials. Never put camper or staff personal details in item names, locations or categories.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Bar says **Preview mode: not connected to a save relay** | The page's `REMOTE_URL` is still the placeholder. Set it to the Worker address. |
| **Couldn't reach the live version** | Check the device's internet. Your counts are safe on the device; push once you're back online. |
| Push fails with **upstream** | The GitHub token lost access or expired. Make a new one (SETUP.md step 2) and replace the `GITHUB_TOKEN` secret. |
| Push fails with **origin_not_allowed** | The page's address isn't in `ALLOWED_ORIGIN`. |
| **Too many pushes in a row** | Wait a minute and push again. |
| Red bar about a newer version | Someone changed the same site's counts. See *When two people work at once*. |
| Staff see an old screen after an update | Reload. GitHub Pages can take a few minutes after a change. |
| An item won't add to a location ("isn't in the index") | Add it on the Index tab first, then push. If it says *retired*, uncheck Retired. |
| Counts look wrong after someone's push | Version history → Load as draft on the version before → Push live. |
