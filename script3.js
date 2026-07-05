// SCRIPT 3 — RSS sync (runs on daily trigger)
// Standalone Apps Script project
// Deployed at: https://script.google.com/macros/s/AKfycbzc6gYvMHCiaYz12joc4b3HBRgIjGVTrnJ_0hndUpbMqYWjpsQL7844QLgBcR9dyoMaWA/exec
// Trigger: Time-based, daily (e.g. 6am), function: syncAllFeeds

const SHEET_ID = '11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk';
const WRITERS_SHEET = 'Categorized';
const ARTICLES_SHEET = 'Articles';
const DAYS_TO_KEEP = 90;

function syncAllFeeds() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const writersSheet = ss.getSheetByName(WRITERS_SHEET);
  const articlesSheet = ss.getSheetByName(ARTICLES_SHEET);

  // Load writers — use the first category column (Category 1) as the stored category
  const wRows = writersSheet.getDataRange().getValues();
  const wHeaders = wRows[0].map(h => h.toString().toLowerCase().trim());
  const ni = wHeaders.findIndex(h => h.includes('name'));
  const li = wHeaders.findIndex(h => h.includes('link'));
  const catIndices = wHeaders.reduce((acc, h, i) => { if (h.includes('cat')) acc.push(i); return acc; }, []);
  const ci = catIndices[0] ?? -1; // Category 1 only — articles stored under primary category

  const writers = wRows.slice(1).filter(r => r[ni] && r[ni].toString().trim()).map(r => ({
    name: r[ni].toString().trim(),
    link: r[li] ? r[li].toString().trim() : '',
    category: ci >= 0 && r[ci] ? r[ci].toString().trim() : ''
  }));

  // Load existing article URLs to avoid duplicates
  const aRows = articlesSheet.getDataRange().getValues();

  // Prune articles older than DAYS_TO_KEEP
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);
  const toKeep = [aRows[0]]; // keep header row
  for (let i = 1; i < aRows.length; i++) {
    const pubDate = new Date(aRows[i][4]);
    if (!isNaN(pubDate.getTime()) && pubDate >= cutoff) toKeep.push(aRows[i]);
  }
  articlesSheet.clearContents();
  if (toKeep.length > 0) {
    articlesSheet.getRange(1, 1, toKeep.length, 5).setValues(toKeep);
  }

  // Reload existing URLs after pruning
  const freshRows = articlesSheet.getDataRange().getValues();
  const freshUrls = new Set(freshRows.slice(1).map(r => r[3]?.toString().trim()).filter(Boolean));

  // Fetch each writer's feed and add new articles
  const newRows = [];
  for (const w of writers) {
    const feedUrl = slugToFeed(w.link);
    if (!feedUrl) continue;
    try {
      const resp = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) continue;
      const items = parseRSS(resp.getContentText());
      for (const item of items) {
        if (!item.url || freshUrls.has(item.url) || newRows.some(r => r[3] === item.url)) continue;
        if (item.pubDate < cutoff) continue;
        newRows.push([w.name, w.category, item.title, item.url, item.pubDate]);
      }
    } catch (e) {
      continue;
    }
  }

  if (newRows.length > 0) {
    const lastRow = articlesSheet.getLastRow();
    articlesSheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
  }

  Logger.log(`Sync complete. Added ${newRows.length} new articles.`);
}

function parseRSS(xml) {
  const items = [];
  try {
    const doc = XmlService.parse(xml);
    const root = doc.getRootElement();
    const channel = root.getChild('channel');
    const rawItems = channel ? channel.getChildren('item') : [];
    for (const item of rawItems) {
      const title = item.getChild('title')?.getText()?.trim() || '';
      const link = item.getChild('link')?.getText()?.trim() || '';
      const pubRaw = item.getChild('pubDate')?.getText()?.trim() || '';
      if (!title || !link) continue;
      const pubDate = new Date(pubRaw);
      if (isNaN(pubDate.getTime())) continue;
      items.push({ title, url: link, pubDate });
    }
  } catch (e) {}
  return items;
}

function slugToFeed(link) {
  if (!link) return null;
  // open.substack.com/pub/slug
  const m1 = link.match(/open\.substack\.com\/pub\/([^/?]+)/);
  if (m1) return 'https://' + m1[1] + '.substack.com/feed';
  // open.substack.com/users/12345-slug
  const m2 = link.match(/open\.substack\.com\/users\/\d+-([^/?&]+)/);
  if (m2) return 'https://' + m2[1] + '.substack.com/feed';
  // Direct substack URL: writer.substack.com or writer.substack.com/...
  const m3 = link.match(/^https?:\/\/([^.]+)\.substack\.com/);
  if (m3 && m3[1] !== 'open') return 'https://' + m3[1] + '.substack.com/feed';
  return null;
}
