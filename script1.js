// SCRIPT 1 — Writer list, RSS proxy, category updates
// Deployed at: https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec
// Bound to Google Sheet: 11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk

const SHEET_NAME = 'Categorized';

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  const url = e && e.parameter && e.parameter.url;
  if (url) return fetchRSS(url);
  if (action === 'updateCategory') return updateCategory(e.parameter.name, e.parameter.category);
  if (action === 'addWriter') return addWriter(e.parameter.name, e.parameter.link, e.parameter.category);
  if (action === 'updateWriter') return updateWriter(e.parameter.originalName, e.parameter.name, e.parameter.link, e.parameter.category);
  return getWriters();
}

function getWriters() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => h.toString().toLowerCase().trim());
  const ni = headers.findIndex(h => h.includes('name'));
  const li = headers.findIndex(h => h.includes('link'));
  const ci = headers.findIndex(h => h.includes('cat'));
  const writers = rows.slice(1).filter(r => r[ni] && r[ni].toString().trim()).map(r => ({
    name: r[ni].toString().trim(),
    link: r[li] ? r[li].toString().trim() : '',
    category: ci >= 0 && r[ci] ? r[ci].toString().trim() : ''
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

    // Update Categorized tab (column C)
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
