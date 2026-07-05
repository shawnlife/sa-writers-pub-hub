// RSS sync script — runs via GitHub Actions on a daily cron
// Reads feed URLs from the Feeds column in the Writers sheet (populated by resolve-links.js)
// and sends new articles to Script 4 for storage.

import Parser from 'rss-parser';

const AS1_URL = process.env.AS1_URL || 'https://script.google.com/macros/s/AKfycbzvdzFSv5d29zSfe5ddSiD2i2xEwAnYvZbaju5mvwgZUq_8zx76MlFS6zi5aQg1jltz/exec';
const AS4_URL = process.env.AS4_URL;

const DAYS_TO_KEEP = 90;
const FEED_CONCURRENCY = 20;
const FEED_TIMEOUT_MS = 10000;

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

async function fetchFeed(feedUrl, writer, cutoff) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const articles = [];
    for (const item of feed.items || []) {
      if (!item.title || !item.link) continue;
      const pubDate = item.pubDate ? new Date(item.pubDate) : null;
      if (!pubDate || isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      articles.push({
        name: writer.name,
        category: writer.cat1 || '',
        title: item.title.trim(),
        url: item.link.trim(),
        pubDate: pubDate.toISOString()
      });
    }
    return articles;
  } catch {
    return [];
  }
}

async function fetchWriterArticles(writer, cutoff) {
  if (!writer.feeds) return [];
  // Feeds column is comma-separated — fetch all publications for this writer
  const feedUrls = writer.feeds.split(',').map(f => f.trim()).filter(Boolean);
  const results = await Promise.all(feedUrls.map(url => fetchFeed(url, writer, cutoff)));
  return results.flat();
}

async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(...r.value);
    }
    console.log(`  Processed ${Math.min(i + batchSize, items.length)}/${items.length} writers…`);
  }
  return results;
}

async function main() {
  if (!AS4_URL) {
    console.warn('AS4_URL not set — run resolve-links.js locally first, then add AS4_URL secret.');
  }

  console.log('Fetching writer list from Script 1…');
  const writersResp = await fetch(AS1_URL);
  const writers = await writersResp.json();
  if (!Array.isArray(writers)) throw new Error('Unexpected writer list response: ' + JSON.stringify(writers));

  const withFeeds = writers.filter(w => w.feeds);
  const withoutFeeds = writers.length - withFeeds.length;
  console.log(`Loaded ${writers.length} writers. ${withFeeds.length} have feeds, ${withoutFeeds} still need resolve-links.js.`);

  if (withFeeds.length === 0) {
    console.log('No writers have feeds yet — run resolve-links.js locally to populate the Feeds column.');
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

  console.log('Fetching RSS feeds…');
  const allArticles = await runInBatches(
    withFeeds,
    FEED_CONCURRENCY,
    w => fetchWriterArticles(w, cutoff)
  );
  console.log(`Found ${allArticles.length} articles within the last ${DAYS_TO_KEEP} days.`);

  if (!AS4_URL) {
    console.log('Dry run complete — no articles written (AS4_URL not set).');
    return;
  }

  if (allArticles.length === 0) {
    console.log('No new articles found — nothing to write.');
    return;
  }

  console.log('Sending articles to Script 4…');
  const postResp = await fetch(AS4_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles: allArticles }),
    redirect: 'follow'
  });
  const result = await postResp.json();

  if (result.error) throw new Error('Script 4 error: ' + result.error);
  console.log(`Done. Added: ${result.added}, Skipped (already exist): ${result.skipped}`);
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
