// SCRIPT 1 — Writer list, RSS proxy, category updates
// Deployed at: https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec
// Bound to Google Sheet: 11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk

const SHEET_NAME = 'Writers';

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  const url = e && e.parameter && e.parameter.url;
  if (url) return fetchRSS(url);
  if (action === 'updateCategory') return updateCategory(e.parameter.name, e.parameter.category);
  if (action === 'addWriter') return addWriter(e.parameter.name, e.parameter.link, e.parameter.category);
  if (action === 'updateWriter') return updateWriter(e.parameter.originalName, e.parameter.name, e.parameter.link, e.parameter.category);
  if (action === 'syncCategories') return syncCategories();
  return getWriters();
}

// Called by GitHub Actions rss-sync after resolving users/ URLs to real publication URLs.
// Payload: { updates: [ { name: "Writer Name", link: "https://pub.substack.com" } ] }
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const updates = payload.updates || [];
    if (!updates.length) return respond({ success: true, updated: 0 });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    const ni = headers.findIndex(h => h.includes('name'));
    const li = headers.findIndex(h => h.includes('link'));

    // Build row index map for fast lookup
    const rowMap = {};
    rows.slice(1).forEach((r, i) => {
      if (r[ni]) rowMap[r[ni].toString().trim().toLowerCase()] = i + 2; // 1-indexed + header
    });

    let updated = 0;
    for (const { name, link } of updates) {
      const rowNum = rowMap[name.toLowerCase().trim()];
      if (!rowNum || !link) continue;
      sheet.getRange(rowNum, li + 1).setValue(link);
      updated++;
    }

    return respond({ success: true, updated });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getWriters() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => h.toString().toLowerCase().trim());
  const ni = headers.findIndex(h => h.includes('name'));
  const li = headers.findIndex(h => h.includes('link'));
  // Find all category columns in order (category 1, category 2, category 3)
  const catIndices = headers.reduce((acc, h, i) => { if (h.includes('cat')) acc.push(i); return acc; }, []);
  const [ci1, ci2, ci3] = [catIndices[0] ?? -1, catIndices[1] ?? -1, catIndices[2] ?? -1];

  const writers = rows.slice(1).filter(r => r[ni] && r[ni].toString().trim()).map(r => ({
    name: r[ni].toString().trim(),
    link: r[li] ? r[li].toString().trim() : '',
    cat1: ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '',
    cat2: ci2 >= 0 && r[ci2] ? r[ci2].toString().trim() : '',
    cat3: ci3 >= 0 && r[ci3] ? r[ci3].toString().trim() : ''
  }));
  return ContentService.createTextOutput(JSON.stringify(writers)).setMimeType(ContentService.MimeType.JSON);
}

function fetchRSS(url) {
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = response.getResponseCode();
    if (code !== 200) return ContentService.createTextOutput(JSON.stringify({ error: 'HTTP ' + code })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(response.getContentText()).setMimeType(ContentService.MimeType.TEXT);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateCategory(name, category) {
  try {
    if (!name || !category) return ContentService.createTextOutput(JSON.stringify({ error: 'Missing name or category' })).setMimeType(ContentService.MimeType.JSON);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const nameLower = name.toString().trim().toLowerCase();

    // Update Categorized tab (column C = Category 1)
    let updatedRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim().toLowerCase() === nameLower) {
        sheet.getRange(i + 1, 3).setValue(category);
        updatedRow = i + 1;
        break;
      }
    }
    if (updatedRow === -1) return ContentService.createTextOutput(JSON.stringify({ error: 'Writer not found: ' + name })).setMimeType(ContentService.MimeType.JSON);

    // Also update Articles tab (column B) for all matching rows
    const articlesSheet = ss.getSheetByName('Articles');
    if (articlesSheet) {
      const aRows = articlesSheet.getDataRange().getValues();
      for (let i = 1; i < aRows.length; i++) {
        if (aRows[i][0] && aRows[i][0].toString().trim().toLowerCase() === nameLower) {
          articlesSheet.getRange(i + 1, 2).setValue(category);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, row: updatedRow })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function addWriter(name, link, category) {
  try {
    if (!name || !name.toString().trim()) return ContentService.createTextOutput(JSON.stringify({ error: 'Missing name' })).setMimeType(ContentService.MimeType.JSON);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const nameLower = name.toString().trim().toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim().toLowerCase() === nameLower) {
        return ContentService.createTextOutput(JSON.stringify({ error: 'Writer already exists: ' + name })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    sheet.appendRow([name.toString().trim(), (link || '').toString().trim(), (category || '').toString().trim()]);
    return ContentService.createTextOutput(JSON.stringify({ success: true, row: sheet.getLastRow() })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateWriter(originalName, name, link, category) {
  try {
    if (!originalName || !originalName.toString().trim()) return ContentService.createTextOutput(JSON.stringify({ error: 'Missing originalName' })).setMimeType(ContentService.MimeType.JSON);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const origLower = originalName.toString().trim().toLowerCase();

    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toString().trim().toLowerCase() === origLower) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) return ContentService.createTextOutput(JSON.stringify({ error: 'Writer not found: ' + originalName })).setMimeType(ContentService.MimeType.JSON);

    const newName = (name || originalName).toString().trim();
    sheet.getRange(rowIdx, 1).setValue(newName);
    sheet.getRange(rowIdx, 2).setValue((link || '').toString().trim());
    sheet.getRange(rowIdx, 3).setValue((category || '').toString().trim());

    // Propagate renamed/recategorised writer to all their rows in Articles tab
    const articlesSheet = ss.getSheetByName('Articles');
    if (articlesSheet) {
      const aRows = articlesSheet.getDataRange().getValues();
      for (let i = 1; i < aRows.length; i++) {
        if (aRows[i][0] && aRows[i][0].toString().trim().toLowerCase() === origLower) {
          if (newName.toLowerCase() !== origLower) articlesSheet.getRange(i + 1, 1).setValue(newName);
          articlesSheet.getRange(i + 1, 2).setValue((category || '').toString().trim());
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, row: rowIdx })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Re-syncs Category 1 from Categorized tab into all matching rows in the Articles tab.
// Run this once after bulk-editing categories directly in the sheet, to ensure the
// Articles tab reflects the current Category 1 values.
function syncCategories() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    const ni = headers.findIndex(h => h.includes('name'));
    const catIndices = headers.reduce((acc, h, i) => { if (h.includes('cat')) acc.push(i); return acc; }, []);
    const ci1 = catIndices[0] ?? -1;

    // Build name → category1 map
    const catMap = {};
    rows.slice(1).forEach(r => {
      const name = r[ni]?.toString().trim();
      if (name) catMap[name.toLowerCase()] = (ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '');
    });

    const articlesSheet = ss.getSheetByName('Articles');
    if (!articlesSheet) return ContentService.createTextOutput(JSON.stringify({ error: 'Articles sheet not found' })).setMimeType(ContentService.MimeType.JSON);

    const aRows = articlesSheet.getDataRange().getValues();
    let updated = 0;
    for (let i = 1; i < aRows.length; i++) {
      const writerName = aRows[i][0]?.toString().trim();
      if (!writerName) continue;
      const newCat = catMap[writerName.toLowerCase()];
      if (newCat !== undefined && newCat !== aRows[i][1]?.toString().trim()) {
        articlesSheet.getRange(i + 1, 2).setValue(newCat);
        updated++;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, updated })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
