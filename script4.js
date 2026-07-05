// SCRIPT 4 — Batch article ingestion via HTTP POST (called by GitHub Actions RSS sync)
// Deploy as a NEW standalone Apps Script web app
// Execute as: Me | Who has access: Anyone
// After deploying, copy the /exec URL and set it as AS4_URL in the GitHub Actions workflow

const SHEET_ID = '11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk';
const ARTICLES_SHEET = 'Articles';
const DAYS_TO_KEEP = 90;

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const articles = payload.articles || [];
    if (!Array.isArray(articles) || articles.length === 0) {
      return respond({ error: 'No articles provided' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(ARTICLES_SHEET);
    if (!sheet) return respond({ error: 'Articles sheet not found' });

    // Prune articles older than DAYS_TO_KEEP
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);
    const existingRows = sheet.getDataRange().getValues();
    const toKeep = [existingRows[0]];
    for (let i = 1; i < existingRows.length; i++) {
      const d = new Date(existingRows[i][4]);
      if (!isNaN(d.getTime()) && d >= cutoff) toKeep.push(existingRows[i]);
    }
    sheet.clearContents();
    if (toKeep.length > 0) {
      sheet.getRange(1, 1, toKeep.length, 5).setValues(toKeep);
    }

    // Build set of existing URLs to avoid duplicates
    const freshRows = sheet.getDataRange().getValues();
    const existingUrls = new Set(freshRows.slice(1).map(r => r[3]?.toString().trim()).filter(Boolean));

    // Filter and append new articles
    const newRows = [];
    for (const a of articles) {
      if (!a.url || existingUrls.has(a.url)) continue;
      const pubDate = new Date(a.pubDate);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      newRows.push([
        (a.name || '').toString().trim(),
        (a.category || '').toString().trim(),
        (a.title || '').toString().trim(),
        a.url.toString().trim(),
        pubDate
      ]);
      existingUrls.add(a.url); // prevent duplicates within this batch
    }

    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
    }

    return respond({ success: true, added: newRows.length, skipped: articles.length - newRows.length });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// Allow GET pings to verify the endpoint is live
function doGet(e) {
  return respond({ ok: true, message: 'Script 4 is live. Use POST to sync articles.' });
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
