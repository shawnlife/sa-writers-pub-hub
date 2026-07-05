// RSS sync script — runs via GitHub Actions on a daily cron
// Fetches all writer RSS feeds (no 6-minute limit), sends new articles to Script 4

import Parser from 'rss-parser';

const AS1_URL = process.env.AS1_URL || 'https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec';
const AS4_URL = process.env.AS4_URL; // set as GitHub Actions secret

const DAYS_TO_KEEP = 90;
const FEED_CONCURRENCY = 20; // fetch this many feeds at once
const FEED_TIMEOUT_MS = 10000;

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

function slugToFeed(link) {
  if (!link) return null;
  const m1 = link.match(/open\.substack\.com\/pub\/([^/?]+)/);
  if (m1) return `https://${m1[1]}.substack.com/feed`;
  const m2 = link.match(/open\.substack\.com\/users\/\d+-([^/?&]+)/);
  if (m2) return `https://${m2[1]}.substack.com/feed`;
  const m3 = link.match(/^https?:\/\/([^.]+)\.substack\.com/);
  if (m3 && m3[1] !== 'open') return `https://${m3[1]}.substack.com/feed`;
  return null;
}

async function fetchWriterFeed(writer, cutoff) {
  const feedUrl = slugToFeed(writer.link);
  if (!feedUrl) return [];
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
    console.error('AS4_URL env var is not set. Add it as a GitHub Actions secret.');
    process.exit(1);
  }

  console.log('Fetching writer list from Script 1…');
  const writersResp = await fetch(AS1_URL);
  const writers = await writersResp.json();
  if (!Array.isArray(writers)) throw new Error('Unexpected writer list response: ' + JSON.stringify(writers));
  console.log(`Loaded ${writers.length} writers.`);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

  console.log('Fetching RSS feeds…');
  const allArticles = await runInBatches(
    writers,
    FEED_CONCURRENCY,
    w => fetchWriterFeed(w, cutoff)
  );
  console.log(`Found ${allArticles.length} articles within the last ${DAYS_TO_KEEP} days.`);

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
