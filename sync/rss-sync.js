// RSS sync script — runs via GitHub Actions on a daily cron
// Fetches all writer RSS feeds (no 6-minute limit), sends new articles to Script 4

import Parser from 'rss-parser';

const AS1_URL = process.env.AS1_URL || 'https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec';
const AS4_URL = process.env.AS4_URL; // set as GitHub Actions secret

const DAYS_TO_KEEP = 90;
const FEED_CONCURRENCY = 20; // fetch this many feeds at once
const FEED_TIMEOUT_MS = 10000;

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

// Resolve open.substack.com/users/... URLs by following redirects to get the
// real @handle, which matches the actual publication subdomain.
// e.g. /users/211650717-zubayr-charles → substack.com/@zubayrcharles → zubayrcharles.substack.com/feed
async function resolveUsersUrl(link) {
  try {
    const resp = await fetch(link, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const finalUrl = resp.url;
    const m = finalUrl.match(/substack\.com\/@([^/?]+)/);
    if (m) return `https://${m[1]}.substack.com/feed`;
  } catch {}
  return null;
}

async function slugToFeed(link) {
  if (!link) return null;
  // open.substack.com/pub/slug — pub slug matches subdomain directly
  const m1 = link.match(/open\.substack\.com\/pub\/([^/?]+)/);
  if (m1) return `https://${m1[1]}.substack.com/feed`;
  // Direct substack URL — subdomain is the feed slug
  const m3 = link.match(/^https?:\/\/([^.]+)\.substack\.com/);
  if (m3 && m3[1] !== 'open') return `https://${m3[1]}.substack.com/feed`;
  // open.substack.com/users/ID-slug — slug ≠ publication subdomain, must resolve
  if (link.includes('open.substack.com/users/')) return resolveUsersUrl(link);
  return null;
}

async function fetchWriterFeed(writer, cutoff) {
  const feedUrl = await slugToFeed(writer.link);
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
    console.warn('AS4_URL is not set — skipping sheet update. Deploy Script 4 and add AS4_URL as a GitHub secret to enable writing.');
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
