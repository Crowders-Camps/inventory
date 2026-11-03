// Playwright helper: serve a fake save relay so tests never touch the real live version.
// Usage (Node, @playwright/test):
//   const { fakeRelay } = require('./fake-relay');
//   test('push logs a count', async ({ page }) => {
//     const relay = await fakeRelay(page, RELAY_URL, require('../data/sample-live.json'));
//     await page.goto('http://localhost:8080/#inventory.ridge');
//     ... fill counts, click Push live, enter initials, click "Push live & log" ...
//     expect(relay.doc.state.inv.log.at(-1).c).toBe('RIDGE');
//   });

function fakeRelay(page, relayUrl, seed) {
  const relay = {
    doc: JSON.parse(JSON.stringify(seed)),
    versions: [],          // [{sha, doc}] newest first
    pushes: []             // every POST body, for assertions
  };
  relay.versions.unshift({ sha: 'sha' + relay.doc.v, doc: JSON.parse(JSON.stringify(relay.doc)) });

  const base = relayUrl.replace(/\/+$/, '');
  return page.route(base + '/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const send = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

    if (req.method() === 'GET' && url.pathname === '/live') return send(relay.doc);
    if (req.method() === 'GET' && url.pathname === '/history') {
      return send({ versions: relay.versions.map(x => ({ sha: x.sha, v: x.doc.v, by: x.doc.by, at: x.doc.at })) });
    }
    if (req.method() === 'GET' && url.pathname === '/version') {
      const hit = relay.versions.find(x => x.sha === url.searchParams.get('sha'));
      return send(hit ? hit.doc : {});
    }
    if (req.method() === 'POST' && url.pathname === '/live') {
      const body = JSON.parse(req.postData() || '{}');
      relay.pushes.push(body);
      if (relay.doc.v !== Number(body.base || 0) && !body.force) return send({ error: 'conflict', live: relay.doc });
      relay.doc = { v: relay.doc.v + 1, at: new Date().toISOString(), by: body.by || '', state: body.state };
      relay.versions.unshift({ sha: 'sha' + relay.doc.v, doc: JSON.parse(JSON.stringify(relay.doc)) });
      return send({ ok: true, v: relay.doc.v, at: relay.doc.at, by: relay.doc.by });
    }
    return send({ error: 'not_found' }, 404);
  }).then(() => relay);
}

// Simulate someone else pushing while the page has unpublished changes (merge / conflict tests).
function pushAsSomeoneElse(relay, mutate, by = 'XX') {
  const state = JSON.parse(JSON.stringify(relay.doc.state));
  mutate(state);
  relay.doc = { v: relay.doc.v + 1, at: new Date().toISOString(), by, state };
  relay.versions.unshift({ sha: 'sha' + relay.doc.v, doc: JSON.parse(JSON.stringify(relay.doc)) });
}

module.exports = { fakeRelay, pushAsSomeoneElse };
