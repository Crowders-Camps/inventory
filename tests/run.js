// Playwright checks for preview/index.html against the fake relay. Never touches the real live version.
// Run from the repo root:  node tests/run.js            (needs: npm i playwright && npx playwright install chromium)
//                          node tests/run.js --shots    (also saves screenshots to tests/shots/)
// The page is served from a fake address and its REMOTE_URL placeholder is swapped for a fake relay address.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { fakeRelay, pushAsSomeoneElse } = require('./fake-relay');

const ROOT = path.join(__dirname, '..');
const PAGE_FILE = process.env.PAGE || path.join(ROOT, 'preview', 'index.html');
const SEED = require(path.join(ROOT, 'data', 'sample-live.json'));
const RELAY = 'https://relay.test';
const SITE = 'https://inventory.test/';
const SHOTS = process.argv.includes('--shots') ? path.join(__dirname, 'shots') : null;
// Always point the page at the fake relay, whatever REMOTE_URL is set to, so tests can never push to the real live version.
const RAW = fs.readFileSync(PAGE_FILE, 'utf8');
if (!/const REMOTE_URL = '[^']*';/.test(RAW)) throw new Error('REMOTE_URL line not found in ' + PAGE_FILE + '; refusing to run against an unknown relay.');
const html = RAW.replace(/const REMOTE_URL = '[^']*';/, "const REMOTE_URL = '" + RELAY + "';");

let browser, passed = 0, failed = 0;
const results = [];
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function eq(a, b, msg) { const x = await a; if (JSON.stringify(x) !== JSON.stringify(b)) throw new Error(msg + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(x)); }

async function open(hash = '#inventory.ridge', opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts));
  const page = await ctx.newPage();
  page.on('pageerror', e => { page._errors = (page._errors || []).concat(String(e)); });
  await page.route(SITE + '**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const relay = await fakeRelay(page, RELAY, opts.seed || SEED);
  await page.goto(SITE + hash);
  await page.waitForSelector('#syncbar[data-state="live"]');
  return { ctx, page, relay };
}
const box = (page, name) => page.locator('tr[data-name="' + name.toLowerCase() + '"] input[data-oh]');
const sec = (page, name) => page.locator('section.invloc', { has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
async function poll(page) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(150); }
async function push(page, who = 'TS', wait = /Pushed live/) {
  await page.click('[data-sa=push]');
  await page.fill('#byIn', who);
  await page.click('#namef button[type=submit]');
  await page.waitForFunction(re => new RegExp(re).test(document.getElementById('status').textContent), wait.source);
}
async function test(name, fn) {
  let env;
  try { env = await fn(); if (env && env.page && env.page._errors) throw new Error('page error: ' + env.page._errors.join('; ')); passed++; results.push('PASS  ' + name); }
  catch (e) { failed++; results.push('FAIL  ' + name + '\n      ' + e.message.split('\n')[0]); }
  finally { if (env && env.ctx) await env.ctx.close(); }
}

(async () => {
  browser = await chromium.launch();

  await test('loads the live version and shows Ridge by location', async () => {
    const env = await open(); const { page } = env;
    await eq(page.locator('.sitename').textContent(), 'Ridge', 'site name');
    await eq(page.locator('section.invloc h3').allTextContents(), ['Main storage', 'Office closet', 'Not assigned to a location'], 'sections');
    await eq(box(page, 'Bleach 1 gal').inputValue(), '0', '0 means none on hand');
    await eq(box(page, 'Printer toner').inputValue(), '', 'blank means not counted');
    ok(await page.locator('text=Old flyers').count() === 0, 'retired item hidden');
    await eq(page.locator('tr[data-name="trash bags 55 gal"] td.item small').textContent(), 'Cleaning', 'category shown on row');
    ok((await page.locator('.lastinv').textContent()).includes('by JM'), 'last completed inventory');
    return env;
  });

  await test('counting highlights changed boxes; counts carry over after reload', async () => {
    const env = await open(); const { page } = env;
    await box(page, 'Trash bags 55 gal').fill('7');
    ok(await page.locator('tr[data-name="trash bags 55 gal"] td.oh.chg').count() === 1, 'changed box highlighted');
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'dirty', 'sync bar dirty');
    await eq(page.locator('.tot.hot b').textContent(), '1', 'not pushed yet = 1');
    await box(page, 'Trash bags 55 gal').fill('4');
    ok(await page.locator('td.oh.chg').count() === 0, 'back to live value clears highlight');
    await box(page, 'Printer toner').fill('3');
    await page.reload(); await page.waitForSelector('#syncbar[data-state="dirty"]');
    await eq(box(page, 'Printer toner').inputValue(), '3', 'draft kept on this device');
    return env;
  });

  await test('Enter jumps to the next item', async () => {
    const env = await open(); const { page } = env;
    await box(page, 'Trash bags 55 gal').focus(); await page.keyboard.press('Enter');
    await eq(page.evaluate(() => document.activeElement.closest('tr').dataset.name), 'bleach 1 gal', 'next row');
    await box(page, 'Paper towels (case)').focus(); await page.keyboard.press('Enter');
    await eq(page.evaluate(() => document.activeElement.closest('tr').dataset.name), 'copy paper (ream)', 'crosses into next location');
    return env;
  });

  await test('locations: add, rename, reorder, remove keeps items and counts', async () => {
    const env = await open(); const { page } = env;
    await page.click('#locEdit');
    await page.fill('#locName', 'Maintenance shed'); await page.click('#locAdd button');
    await eq(page.locator('.lchip').allTextContents(), ['All4/8', 'Main storage3/3', 'Office closet1/2', 'Maintenance shed0/0', 'Not assigned0/3'], 'chips');
    const row = page.locator('.lerow', { has: page.locator('input[value="Maintenance shed"]') });
    await row.locator('input').fill('Shed'); await row.locator('input').press('Tab');
    await page.locator('.lerow', { has: page.locator('input[value="Shed"]') }).locator('[data-lup]').click();
    await eq(page.locator('.lerow input').evaluateAll(xs => xs.map(x => x.value)), ['Main storage', 'Shed', 'Office closet'], 'reordered');
    const office = page.locator('.lerow', { has: page.locator('input[value="Office closet"]') });
    await office.locator('[data-ldel]').click(); await eq(office.locator('[data-ldel]').textContent(), 'Remove?', 'armed');
    await office.locator('[data-ldel]').click();
    ok(await sec(page, 'Office closet').count() === 0, 'location gone');
    await eq(box(page, 'Copy paper (ream)').inputValue(), '10', 'count kept');
    ok(await sec(page, 'Not assigned to a location').locator('tr[data-name="copy paper (ream)"]').count() === 1, 'moved to Not assigned');
    return env;
  });

  await test('move an item with its Location menu; add to a location; sort A-Z', async () => {
    const env = await open(); const { page } = env;
    await page.locator('tr[data-name="trash bags 55 gal"] select[data-mv]').selectOption('l_office');
    ok(await sec(page, 'Office closet').locator('tr[data-name="trash bags 55 gal"]').count() === 1, 'moved');
    await eq(box(page, 'Trash bags 55 gal').inputValue(), '4', 'count follows the item');
    await sec(page, 'Main storage').locator('form[data-add] input').fill('led bulbs');
    await sec(page, 'Main storage').locator('form[data-add] button').click();
    ok(await sec(page, 'Main storage').locator('tr[data-name="led bulbs"]').count() === 1, 'added from Not assigned');
    await sec(page, 'Main storage').locator('form[data-add] input').fill('Unicorn');
    await sec(page, 'Main storage').locator('form[data-add] button').click();
    ok((await page.locator('#status').textContent()).includes('isn’t in the index'), 'unknown item refused');
    await sec(page, 'Office closet').locator('[data-sort]').click();
    await eq(sec(page, 'Office closet').locator('tr').evaluateAll(t => t.slice(1).map(x => x.dataset.name)), ['copy paper (ream)', 'printer toner', 'trash bags 55 gal'], 'sorted');
    return env;
  });

  await test('Find and Category filter combine with location chips', async () => {
    const env = await open(); const { page } = env;
    await page.fill('#invq', 'toner');
    await eq(page.locator('tr[data-key]:visible').count(), 1, 'find');
    await page.fill('#invq', '');
    await page.selectOption('#invcat', 'c_clean');
    await eq(page.locator('tr[data-key]').count(), 3, 'cleaning only');
    await page.locator('.lchip', { hasText: 'Office closet' }).click();
    ok((await sec(page, 'Office closet').textContent()).includes('No Cleaning items here'), 'empty under filter');
    await eq(page.locator('section.invloc').count(), 1, 'one location shown');
    return env;
  });

  await test('Push live & log asks for a name and logs the site shown', async () => {
    const env = await open(); const { page, relay } = env;
    await box(page, 'Trash bags 55 gal').fill('6'); await box(page, 'Printer toner').fill('2');
    await page.click('[data-sa=push]');
    await eq(page.locator('#namef label').textContent(), 'Who did this inventory?', 'name prompt');
    ok((await page.locator('#namef').textContent()).includes('First name or initials only'), 'privacy note');
    await page.click('#namef button[type=submit]');
    ok(relay.pushes.length === 0, 'empty name refused');
    await page.fill('#byIn', 'TS'); await page.click('#namef button[type=submit]');
    await page.waitForFunction(() => /Pushed live/.test(document.getElementById('status').textContent));
    await eq(relay.doc.v, 4, 'new version');
    const e = relay.doc.state.inv.log.at(-1);
    await eq([e.by, e.c, e.n, e.of, e.ch], ['TS', 'RIDGE', 5, 8, 2], 'log entry');
    await eq(relay.doc.state.inv.c.RIDGE.stock.i_toner, 2, 'saved count');
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'live', 'live again');
    ok((await page.locator('.lastinv').textContent()).includes('by TS'), 'panel updated');
    // asks again next time (shared devices), prefilled
    await page.click('[data-sa=push]'); await eq(page.inputValue('#byIn'), 'TS', 'prefilled name');
    return env;
  });

  await test('nothing changed: push still logs a completed count', async () => {
    const env = await open('#inventory.springs'); const { page, relay } = env;
    await push(page, 'AK');
    const e = relay.doc.state.inv.log.at(-1);
    await eq([e.by, e.c, e.ch, relay.doc.v], ['AK', 'SPRINGS', 0, 4], 'logged with 0 changed');
    await eq(relay.doc.state.inv.log.length, 3, 'log grew by one');
    return env;
  });

  await test('merge: someone else pushes another site while I count', async () => {
    const env = await open(); const { page, relay } = env;
    await box(page, 'Trash bags 55 gal').fill('9');
    pushAsSomeoneElse(relay, st => { st.inv.c.SPRINGS.stock.i_balls = 12; st.inv.log.push({ at: '2026-11-03T16:00:00.000Z', by: 'XX', c: 'SPRINGS', n: 2, of: 8, ch: 1 }); });
    await push(page, 'TS', /merged in first/);
    const st = relay.doc.state;
    await eq([st.inv.c.RIDGE.stock.i_bags, st.inv.c.SPRINGS.stock.i_balls, relay.doc.v], [9, 12, 5], 'both changes kept');
    await eq(st.inv.log.map(e => e.by), ['JM', 'AK', 'XX', 'TS'], 'logs combined');
    return env;
  });

  await test('merge on poll: other person’s index edit arrives without a conflict', async () => {
    const env = await open(); const { page } = env; const relay = env.relay;
    await box(page, 'Printer toner').fill('1');
    pushAsSomeoneElse(relay, st => { st.items.push({ id: 'i_mop', name: 'Mop heads', cat: 'c_clean', retired: false }); });
    await poll(page);
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'dirty', 'still my draft, no conflict');
    ok(await page.locator('tr[data-name="mop heads"]').count() === 1, 'new item visible');
    await eq(box(page, 'Printer toner').inputValue(), '1', 'my count kept');
    return env;
  });

  await test('conflict on the same site: choose Push mine anyway (click twice)', async () => {
    const env = await open(); const { page, relay } = env;
    await box(page, 'Trash bags 55 gal').fill('7');
    pushAsSomeoneElse(relay, st => { st.inv.c.RIDGE.stock.i_bags = 9; });
    await poll(page);
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'warn', 'conflict shown');
    await page.click('[data-sa=force]'); await eq(page.locator('[data-sa=force]').textContent(), 'Click again to replace it', 'armed');
    await page.click('[data-sa=force]');
    await page.fill('#byIn', 'TS'); await page.click('#namef button[type=submit]');
    await page.waitForFunction(() => /Pushed live/.test(document.getElementById('status').textContent));
    await eq([relay.doc.state.inv.c.RIDGE.stock.i_bags, relay.pushes.at(-1).force], [7, true], 'mine replaced theirs');
    return env;
  });

  await test('conflict: Load the live version discards mine', async () => {
    const env = await open(); const { page, relay } = env;
    await box(page, 'Trash bags 55 gal').fill('7');
    pushAsSomeoneElse(relay, st => { st.inv.c.RIDGE.stock.i_bags = 9; });
    await push(page, 'TS', /changed the same thing/);
    await page.click('[data-sa=load]');
    await eq(box(page, 'Trash bags 55 gal').inputValue(), '9', 'live value');
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'live', 'clean');
    return env;
  });

  await test('Discard changes (click twice)', async () => {
    const env = await open(); const { page } = env;
    await box(page, 'Trash bags 55 gal').fill('1');
    await page.click('[data-sa=discard]'); await page.click('[data-sa=discard]');
    await eq(box(page, 'Trash bags 55 gal').inputValue(), '4', 'back to live');
    return env;
  });

  await test('version history: load an old version as a draft, log is kept', async () => {
    const env = await open(); const { page, relay } = env;
    await box(page, 'Trash bags 55 gal').fill('20'); await push(page, 'TS');
    await page.click('[data-sa=hist]');
    await page.waitForSelector('.hlist li');
    await eq(page.locator('.hlist .hv').allTextContents(), ['v4', 'v3'], 'versions listed');
    await page.click('[data-hv="sha3"]');
    await page.waitForFunction(() => /Loaded version 3/.test(document.getElementById('status').textContent));
    await eq(box(page, 'Trash bags 55 gal').inputValue(), '4', 'old count loaded');
    ok((await page.locator('.invlog').textContent()).includes('TS'), 'log still shows the newer entry');
    await push(page, 'JM');
    await eq([relay.doc.v, relay.doc.state.inv.c.RIDGE.stock.i_bags], [5, 4], 'restored');
    await eq(relay.doc.state.inv.log.map(e => e.by), ['JM', 'AK', 'TS', 'JM'], 'no log entries lost');
    return env;
  });

  await test('Index: add (duplicates refused), rename keeps counts, retire, delete', async () => {
    const env = await open('#index'); const { page, relay } = env;
    await eq(page.locator('.thead h3').first().textContent(), 'Index', 'index tab from #index');
    await page.fill('#ni_name', 'Mop heads'); await page.selectOption('#ni_cat', 'c_clean'); await page.click('#newitem button');
    ok((await page.textContent('#ni_msg')).startsWith('Added Mop heads'), 'added');
    await page.fill('#ni_name', '  trash BAGS 55 gal '); await page.click('#newitem button');
    ok((await page.textContent('#ni_msg')).includes('already in the index'), 'duplicate refused');
    const bags = page.locator('.irow', { has: page.locator('input[value="Trash bags 55 gal"]') });
    await bags.locator('input[data-f=name]').fill('Trash bags, 55 gallon'); await bags.locator('input[data-f=name]').press('Tab');
    await page.locator('.irow', { has: page.locator('input[value="Printer toner"]') }).locator('input[data-f=retired]').check();
    const bulbs = page.locator('.irow', { has: page.locator('input[value="LED bulbs"]') });
    await bulbs.locator('[data-del]').click(); await eq(bulbs.locator('[data-del]').textContent(), 'Delete?', 'armed');
    await bulbs.locator('[data-del]').click();
    ok(await page.locator('input[value="LED bulbs"]').count() === 0, 'deleted');
    await page.click('[data-tab=inv]');
    await eq(box(page, 'Trash bags, 55 gallon').inputValue(), '4', 'rename kept the count');
    ok(await page.locator('tr[data-name="printer toner"]').count() === 0, 'retired off the list');
    ok(await page.locator('tr[data-name="mop heads"]').count() === 1, 'new item in Not assigned');
    await push(page, 'TS');
    const items = relay.doc.state.items;
    ok(items.find(i => i.id === 'i_toner').retired === true, 'retired saved');
    ok(relay.doc.state.inv.c.RIDGE.stock.i_toner === undefined, 'toner had no count');
    ok(!items.some(i => i.id === 'i_bulbs'), 'delete saved');
    return env;
  });

  await test('Index: categories add, rename, reorder, remove; filter; paste a list', async () => {
    const env = await open('#index'); const { page } = env;
    await page.fill('#catName', 'First aid'); await page.click('#catAdd button');
    const off = page.locator('.crow', { has: page.locator('input[value="Office"]') });
    await off.locator('input').fill('Office supplies'); await off.locator('input').press('Tab');
    await page.locator('.crow', { has: page.locator('input[value="First aid"]') }).locator('[data-cup]').click();
    await eq(page.locator('.crow input').evaluateAll(xs => xs.map(x => x.value)), ['Cleaning', 'Office supplies', 'Program supplies', 'First aid', 'Maintenance'], 'order');
    const m = page.locator('.crow', { has: page.locator('input[value="Maintenance"]') });
    await m.locator('[data-cdel]').click(); await page.locator('.crow', { has: page.locator('input[value="Maintenance"]') }).locator('[data-cdel]').click();
    await eq(page.locator('.irow', { has: page.locator('input[value="LED bulbs"]') }).locator('select').inputValue(), '_none', 'now Uncategorized');
    await page.selectOption('#idxcat', 'c_clean'); await eq(page.locator('.irow').count(), 3, 'filter');
    await page.selectOption('#idxcat', 'all');
    await page.click('#imp summary');
    await page.fill('#impText', 'Cleaning, Sponges\nFirst aid\tBandages\nPaper plates\nNew stuff, Zip ties\nbleach 1 GAL');
    await page.selectOption('#impCat', 'c_office');
    await page.click('#impGo');
    ok(/Added 4 items and 1 new category\. Skipped 1/.test(await page.textContent('#status')), 'import result: ' + await page.textContent('#status'));
    await eq(page.locator('.irow', { has: page.locator('input[value="Paper plates"]') }).locator('select').inputValue(), 'c_office', 'default category');
    await page.fill('#idxq', 'zip'); await eq(page.locator('.irow').count(), 1, 'search');
    await page.click('[data-tab=inv]'); await page.selectOption('#invcat', { label: 'First aid' });
    await eq(page.locator('tr[data-key]').count(), 1, 'inventory category filter sees new category');
    return env;
  });

  await test('bookmark links switch site and tab', async () => {
    const env = await open('#inventory.sm'); const { page } = env;
    await eq(page.locator('.sitename').textContent(), 'South Mountain', 'sm');
    ok(await sec(page, 'Main storage').count() === 1, 'starter location for a new site');
    await page.locator('[data-site=SPRINGS]').click();
    await eq(page.evaluate(() => location.hash), '#inventory.springs', 'hash follows');
    await page.evaluate(() => { location.hash = '#index'; }); await page.waitForTimeout(100);
    await eq(page.locator('.thead h3').first().textContent(), 'Index', 'index via hash');
    return env;
  });

  await test('phone width: no sideways scroll, counting works', async () => {
    const env = await open('#inventory.ridge', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const { page } = env;
    await eq(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll (inventory)');
    await box(page, 'Bleach 1 gal').fill('3');
    await page.click('[data-tab=index]');
    await eq(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll (index)');
    return env;
  });

  await test('dark mode uses the dark tokens', async () => {
    const env = await open('#inventory.ridge', { colorScheme: 'dark' }); const { page } = env;
    await eq(page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(18, 22, 24)', 'dark page');
    return env;
  });

  await test('preview mode with no relay address saves on this device only', async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const raw = RAW.replace(/const REMOTE_URL = '[^']*';/, "const REMOTE_URL = '__RELAY_URL__';");
    await page.route(SITE + '**', r => r.fulfill({ status: 200, contentType: 'text/html', body: raw }));
    await page.goto(SITE + '#index');
    await eq(page.locator('#syncbar').getAttribute('data-state'), 'local', 'local mode');
    ok((await page.textContent('.empty')).includes('index is empty'), 'empty index message');
    await eq(page.locator('.crow').count(), 5, 'starter categories');
    return { ctx, page };
  });

  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const shot = async (name, hash, opts, prep) => { const env = await open(hash, Object.assign({ deviceScaleFactor: 2 }, opts)); if (prep) await prep(env); await env.page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); await env.ctx.close(); };
    await shot('1-inventory-desktop', '#inventory.ridge', {}, async ({ page }) => { await box(page, 'Trash bags 55 gal').fill('6'); await box(page, 'Printer toner').fill('2'); await page.click('[data-sa=push]'); await page.fill('#byIn', 'TS'); });
    await shot('2-index-desktop', '#index', {}, null);
    await shot('3-inventory-phone', '#inventory.ridge', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true }, async ({ page }) => { await box(page, 'Bleach 1 gal').fill('3'); });
    await shot('4-inventory-dark', '#inventory.springs', { colorScheme: 'dark' }, async ({ page }) => { await page.click('#locEdit'); });
    await shot('5-conflict-and-history', '#inventory.ridge', {}, async ({ page, relay }) => { await box(page, 'Trash bags 55 gal').fill('7'); pushAsSomeoneElse(relay, st => { st.inv.c.RIDGE.stock.i_bags = 9; }); await poll(page); await page.click('[data-sa=hist]'); await page.waitForSelector('.hlist li'); });
    await shot('6-index-phone-dark', '#index', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, colorScheme: 'dark' }, null);
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
