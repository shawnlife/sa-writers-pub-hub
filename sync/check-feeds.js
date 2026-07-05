// Checks the last post date for every writer that has feeds in the sheet.
// Stores the result in the "Last Post" column.
//
// Run: node check-feeds.js

import Parser from 'rss-parser';

const AS1_URL = 'https://script.google.com/macros/s/AKfycbzvdzFSv5d29zSfe5ddSiD2i2xEwAnYvZbaju5mvwgZUq_8zx76MlFS6zi5aQg1jltz/exec';
const CONCURRENCY = 10;
const FEED_TIMEOUT_MS = 10000;

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

async function getLastPostDate(feeds) {
  const feedUrls = feeds.split(',').map(f => f.trim()).filter(Boolean);
  let latest = null;
  await Promise.all(feedUrls.map(async url => {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items || []) {
        const d = item.pubDate ? new Date(item.pubDate) : null;
        if (d && !isNaN(d) && (!latest || d > latest)) latest = d;
      }
    } catch {
      // feed unavailable — skip
    }
  }));
  return latest;
}

async function runInBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) if (r.status === 'fulfilled') results.push(r.value);
    console.log(`  Checked ${Math.min(i + size, items.length)}/${items.length}…`);
  }
  return results;
}

async function main() {
  console.log('Loading writers from sheet…');
  const resp = await fetch(AS1_URL);
  const writers = await resp.json();
  if (!Array.isArray(writers)) throw new Error('Bad response: ' + JSON.stringify(writers));

  const withFeeds = writers.filter(w => w.feeds && w.feeds.trim());
  const noFeeds = writers.filter(w => !w.feeds || !w.feeds.trim());
  console.log(`${writers.length} total. ${withFeeds.length} have feeds, ${noFeeds.length} have none.\n`);

  const updates = [];

  await runInBatches(withFeeds, CONCURRENCY, async writer => {
    const lastDate = await getLastPostDate(writer.feeds);
    const lastPost = lastDate ? lastDate.toISOString().slice(0, 10) : 'no posts found';
    updates.push({ name: writer.name, lastPost });
  });

  // Mark writers with no feeds as inactive
  for (const writer of noFeeds) {
    updates.push({ name: writer.name, lastPost: 'no publication' });
  }

  console.log(`\nSaving ${updates.length} last-post dates to sheet…`);

  // Send in chunks of 100 to avoid payload limits
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const postResp = await fetch(AS1_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: chunk }),
      redirect: 'follow'
    });
    const r = await postResp.json();
    if (r.error) console.warn('Save warning:', r.error);
    else console.log(`  Saved rows ${i + 1}–${i + chunk.length} (${r.updated} written)`);
  }

  console.log('\nDone. Check the Last Post column in the sheet.');
  console.log('Writers with "no posts found" or "no publication" can be reviewed for removal.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
