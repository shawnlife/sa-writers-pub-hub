// One-time script to fix writer links in the Google Sheet.
// Reads the authoritative link list from writer-links.json and updates
// any mismatched links in the sheet via Script 1's updateWriter endpoint.
//
// Run once from your machine:
//   cd sync && node fix-links.js

import { readFileSync } from 'fs';

const AS1 = 'https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec';

const correctLinks = JSON.parse(readFileSync(new URL('./writer-links.json', import.meta.url)));

async function main() {
  // Load current writer list from sheet
  console.log('Loading writers from sheet…');
  const resp = await fetch(AS1);
  const sheetWriters = await resp.json();
  const sheetMap = {};
  for (const w of sheetWriters) {
    sheetMap[w.name.toLowerCase().trim()] = w;
  }

  let updated = 0, skipped = 0, notFound = 0;

  for (const { name, link } of correctLinks) {
    const key = name.toLowerCase().trim();
    const sheetWriter = sheetMap[key];
    if (!sheetWriter) { notFound++; continue; }
    if (sheetWriter.link === link) { skipped++; continue; }

    const url = AS1 + '?action=updateWriter'
      + '&originalName=' + encodeURIComponent(sheetWriter.name)
      + '&name=' + encodeURIComponent(sheetWriter.name)
      + '&link=' + encodeURIComponent(link)
      + '&category=' + encodeURIComponent(sheetWriter.cat1 || '');

    const r = await fetch(url);
    const result = await r.json();
    if (result.success) {
      console.log(`✓ Fixed: ${name}`);
      updated++;
    } else {
      console.log(`✗ Error for ${name}: ${result.error}`);
    }

    // Small delay to avoid hammering Apps Script
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone. Updated: ${updated}, Already correct: ${skipped}, Not in sheet: ${notFound}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
