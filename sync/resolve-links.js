// One-time script — run locally from your Mac (Substack blocks cloud IPs).
// Fetches each writer's Substack profile page, extracts their @handle and all
// publication RSS feeds, then stores both back in the sheet.
//
// Before running:
//   1. Add a "Feeds" column header to the Writers tab in Google Sheets
//   2. Redeploy Script 1 with the latest code
//   3. Run: cd sync && node resolve-links.js

const AS1_URL = 'https://script.google.com/macros/s/AKfycbzvdzFSv5d29zSfe5ddSiD2i2xEwAnYvZbaju5mvwgZUq_8zx76MlFS6zi5aQg1jltz/exec';
const CONCURRENCY = 5;
const DELAY_MS = 400;

async function resolveProfile(writer) {
  const cleanLink = writer.link.split('?')[0];
  try {
    const resp = await fetch(cleanLink, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status}: ${writer.name}`);
      return null;
    }
    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (!match) {
      console.log(`  ✗ No page data: ${writer.name}`);
      return null;
    }
    const data = JSON.parse(match[1]);
    const user = data?.props?.pageProps?.user;
    if (!user) {
      console.log(`  ✗ No user data: ${writer.name}`);
      return null;
    }

    // Clean profile URL using their handle
    const handle = user.handle;
    const profileUrl = handle ? `https://substack.com/@${handle}` : null;

    // Collect all publications this person writes for
    const pubs = user.publicationUsers || [];
    const feeds = pubs
      .map(pu => pu?.publication?.subdomain)
      .filter(Boolean)
      .map(sub => `https://${sub}.substack.com/feed`);

    // Also check primaryPublication in case it's not in publicationUsers
    const primarySub = user.primaryPublication?.subdomain;
    if (primarySub) {
      const primaryFeed = `https://${primarySub}.substack.com/feed`;
      if (!feeds.includes(primaryFeed)) feeds.unshift(primaryFeed);
    }

    if (feeds.length === 0) {
      console.log(`  ✗ No publications found: ${writer.name}`);
      return null;
    }

    return { profileUrl, feeds };
  } catch (err) {
    console.log(`  ✗ Error (${err.message}): ${writer.name}`);
    return null;
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Loading writers from sheet…');
  const resp = await fetch(AS1_URL);
  const writers = await resp.json();
  if (!Array.isArray(writers)) throw new Error('Bad response: ' + JSON.stringify(writers));

  // Only process writers that still have users/ links (skip already-resolved ones)
  const toResolve = writers.filter(w => w.link && w.link.includes('open.substack.com/users/'));
  const alreadyDone = writers.length - toResolve.length;
  console.log(`${writers.length} total writers. ${alreadyDone} already resolved. Processing ${toResolve.length}…\n`);

  const updates = [];
  let resolved = 0, failed = 0;

  for (let i = 0; i < toResolve.length; i += CONCURRENCY) {
    const batch = toResolve.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async w => ({ writer: w, result: await resolveProfile(w) })));

    for (const { writer, result } of results) {
      if (result) {
        const feedList = result.feeds.join(', ');
        console.log(`  ✓ ${writer.name}`);
        console.log(`      profile: ${result.profileUrl}`);
        console.log(`      feeds:   ${feedList}`);
        updates.push({
          name: writer.name,
          link: result.profileUrl || writer.link,
          feeds: feedList
        });
        resolved++;
      } else {
        failed++;
      }
    }

    const done = Math.min(i + CONCURRENCY, toResolve.length);
    console.log(`  — ${done}/${toResolve.length} processed (✓ ${resolved}  ✗ ${failed})\n`);
    if (i + CONCURRENCY < toResolve.length) await sleep(DELAY_MS);
  }

  if (updates.length === 0) {
    console.log('Nothing resolved — check that the Feeds column exists in the Writers sheet.');
    return;
  }

  console.log(`\nStoring ${updates.length} updates in sheet…`);
  const postResp = await fetch(AS1_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
    redirect: 'follow'
  });
  const result = await postResp.json();
  if (result.error) throw new Error('Sheet update failed: ' + result.error);

  console.log(`\n✓ Done. ${result.updated} rows updated in sheet.`);
  if (failed > 0) console.log(`✗ ${failed} writers could not be resolved — add their feeds manually in the sheet.`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
