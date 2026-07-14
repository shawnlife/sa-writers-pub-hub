// SINGLE CONSOLIDATED SCRIPT — replaces Scripts 1, 2, 3, 4, 5
//
// Deploy once as a web app from the spreadsheet's Apps Script editor:
//   Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Who has access: Anyone
//
// Copy the /exec URL into index.html as both AS1 and AS2 (they're the same now).
//
// For the daily RSS sync, add a time-driven trigger:
//   Triggers → Add Trigger → syncRSS → Time-driven → Day timer → 2–3am

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_ID      = '11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk';
const WRITERS_SHEET = 'Writers';
const ARTICLES_SHEET = 'Articles';
const DIGEST_DOC_ID  = '1c865BZua0CQ1WkOCvoIgjLbn9Gx7MqrMQ_G4Kpm3mp4';
const DAYS_TO_KEEP   = 90;

const NAME_COLOR    = '#e11c47';
const ARTICLE_COLOR = '#000000';

// The 5 digests and their sub-sections, in Jen's publishing order
const DIGESTS = {
  'Arts':      ['Arts & Culture', 'Books, Writing & Literature', 'Fiction', 'Poetry'],
  'Business':  ['Business, Work & Economics', 'Tech & AI', 'Trade & Industry'],
  'Personal':  ['Birth, Fertility & Parenting', 'Personal Essay & Memoir', 'Relationships'],
  'Politics':  ['Education', 'Feminism, Gender & LGBTQI+', 'History', 'Politics, Media & Government', 'Religion, Spirituality & Theology'],
  'Our World': ['Climate, Environment & Sustainability', 'Science', 'Sports & Fitness', 'Travel & Food']
};

const CATEGORY_IMAGES = {
  'Arts & Culture':                  { url: 'https://images.unsplash.com/photo-1587731556938-38755b4803a6?auto=format&fit=crop&w=1080&q=80', photographer: 'Clay Banks', photographerUrl: 'https://unsplash.com/@claybanks' },
  'Birth, Fertility & Parenting':    { url: 'https://images.unsplash.com/photo-1543346242-2b8e41fb91ca?auto=format&fit=crop&w=1080&q=80', photographer: 'charlesdeluvio', photographerUrl: 'https://unsplash.com/@charlesdeluvio' },
  'Climate, Environment & Sustainability': { url: 'https://images.unsplash.com/photo-1720021893364-20fb17efc639?auto=format&fit=crop&w=1080&q=80', photographer: 'Javier Miranda', photographerUrl: 'https://unsplash.com/@nuvaproductions' },
  'Education':                       { url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1080&q=80', photographer: 'Element5 Digital', photographerUrl: 'https://unsplash.com/@element5digital' },
  'Feminism, Gender & LGBTQI+':      { url: 'https://images.unsplash.com/photo-1548383675-379abfac2c41?auto=format&fit=crop&w=1080&q=80', photographer: 'chloe s.', photographerUrl: 'https://unsplash.com/@chloesimpson' },
  'Fiction':                         { url: 'https://images.unsplash.com/photo-1572097560317-1189048dac38?auto=format&fit=crop&w=1080&q=80', photographer: 'Ondrej Bocek', photographerUrl: 'https://unsplash.com/@ondrejbocek' },
  'History':                         { url: 'https://images.unsplash.com/photo-1592252032050-34897f779223?auto=format&fit=crop&w=1080&q=80', photographer: 'Benigno Hoyuela', photographerUrl: 'https://unsplash.com/@benignohoyuela' },
  'Personal Essay & Memoir':         { url: 'https://images.unsplash.com/photo-1522794338816-ee3a17a00ae8?auto=format&fit=crop&w=1080&q=80', photographer: 'Debby Hudson', photographerUrl: 'https://unsplash.com/@hudsoncrafted' },
  'Poetry':                          { url: 'https://images.unsplash.com/photo-1487147264018-f937fba0c817?auto=format&fit=crop&w=1080&q=80', photographer: 'Mona Eendra', photographerUrl: 'https://unsplash.com/@monaeendra' },
  'Relationships':                   { url: 'https://images.unsplash.com/photo-1613244600331-ac72a1ee5256?auto=format&fit=crop&w=1080&q=80', photographer: 'freestocks', photographerUrl: 'https://unsplash.com/@freestocks' },
  'Religion, Spirituality & Theology':{ url: 'https://images.unsplash.com/photo-1586084531165-7c2dede00604?auto=format&fit=crop&w=1080&q=80', photographer: 'Sincerely Media', photographerUrl: 'https://unsplash.com/@sincerelymedia' },
  'Science':                         { url: 'https://images.unsplash.com/photo-1576086085526-0de1930a57c7?auto=format&fit=crop&w=1080&q=80', photographer: 'National Cancer Institute', photographerUrl: 'https://unsplash.com/@nci' },
  'Tech & AI':                       { url: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=1080&q=80', photographer: 'Ales Nesetril', photographerUrl: 'https://unsplash.com/@alesnesetril' },
  'Trade & Industry':                { url: 'https://images.unsplash.com/photo-1522125307274-36420256794e?auto=format&fit=crop&w=1080&q=80', photographer: 'Tim Mossholder', photographerUrl: 'https://unsplash.com/@timmossholder' },
  'Travel & Food':                   { url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1080&q=80', photographer: 'Jake Blucker', photographerUrl: 'https://unsplash.com/@jakeblucker' }
};

// ─── HTTP entry points ─────────────────────────────────────────────────────────

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || '';

  // RSS proxy (legacy — keeps old URL?= calls working)
  if (p.url) return fetchRSS(p.url);

  // Digest actions
  if (action === 'preview')       return respond(previewDigest(p.from, p.to, p.cat || '__all__', p.digest || ''));
  if (action === 'createDigest')  return respond(buildAndWriteDigest(p.from, p.to, p.cat || '__all__', p.digest || '', p.overrides ? JSON.parse(p.overrides) : {}));

  // Writer actions
  if (action === 'updateCategory') return updateCategory(p.name, p.category);
  if (action === 'addWriter')      return addWriter(p.name, p.link, p.category, p.cat2, p.cat3, p.feeds);
  if (action === 'updateWriter')   return updateWriter(p.originalName, p.name, p.link, p.category, p.cat2, p.cat3, p.feeds);
  if (action === 'syncCategories') return syncCategories();

  // Default: return full writer list
  return getWriters();
}

// Called by resolve-links.js (run locally) and check-feeds.js to update writer fields.
// Also handles bulk lastPost updates from check-feeds.js.
// Payload: { updates: [ { name, link?, feeds?, lastPost? } ] }
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const updates = payload.updates || [];
    if (!updates.length) return respond({ success: true, updated: 0 });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(WRITERS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    const ni  = headers.findIndex(h => h.includes('name'));
    const li  = headers.findIndex(h => h.includes('link'));
    const fi  = headers.findIndex(h => h.includes('feed'));
    const lpi = headers.findIndex(h => h.includes('last') && h.includes('post'));

    const rowMap = {};
    rows.slice(1).forEach((r, i) => {
      if (r[ni]) rowMap[r[ni].toString().trim().toLowerCase()] = i + 2;
    });

    let updated = 0;
    for (const { name, link, feeds, lastPost } of updates) {
      const rowNum = rowMap[name.toLowerCase().trim()];
      if (!rowNum) continue;
      if (link     !== undefined && li  >= 0) sheet.getRange(rowNum, li  + 1).setValue(link);
      if (feeds    !== undefined && fi  >= 0) sheet.getRange(rowNum, fi  + 1).setValue(feeds);
      if (lastPost !== undefined && lpi >= 0) sheet.getRange(rowNum, lpi + 1).setValue(lastPost);
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

// ─── Writer CRUD ───────────────────────────────────────────────────────────────

function getWriters() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WRITERS_SHEET);
  const rows = sheet.getDataRange().getValues();
  const h = rows[0].map(x => x.toString().toLowerCase().trim());
  const ni = h.findIndex(x => x.includes('name'));
  const li = h.findIndex(x => x.includes('link'));
  const fi  = h.findIndex(x => x.includes('feed'));
  const lpi = h.findIndex(x => x.includes('last') && x.includes('post'));
  const catIdx = h.reduce((a, x, i) => { if (x.includes('cat')) a.push(i); return a; }, []);
  const [ci1, ci2, ci3] = [catIdx[0] ?? -1, catIdx[1] ?? -1, catIdx[2] ?? -1];

  const writers = rows.slice(1)
    .filter(r => r[ni] && r[ni].toString().trim())
    .map(r => ({
      name:     r[ni].toString().trim(),
      link:     li  >= 0 && r[li]  ? r[li].toString().trim()  : '',
      feeds:    fi  >= 0 && r[fi]  ? r[fi].toString().trim()  : '',
      lastPost: lpi >= 0 && r[lpi] ? (r[lpi] instanceof Date ? Utilities.formatDate(r[lpi], Session.getScriptTimeZone(), 'yyyy-MM-dd') : r[lpi].toString().trim()) : '',
      cat1:     ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '',
      cat2:     ci2 >= 0 && r[ci2] ? r[ci2].toString().trim() : '',
      cat3:     ci3 >= 0 && r[ci3] ? r[ci3].toString().trim() : ''
    }));

  return ContentService.createTextOutput(JSON.stringify(writers)).setMimeType(ContentService.MimeType.JSON);
}

function fetchRSS(url) {
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    if (code !== 200) return respond({ error: 'HTTP ' + code });
    return ContentService.createTextOutput(resp.getContentText()).setMimeType(ContentService.MimeType.TEXT);
  } catch (e) {
    return respond({ error: e.message });
  }
}

function updateCategory(name, category) {
  try {
    if (!name || !category) return respond({ error: 'Missing name or category' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(WRITERS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const lower = name.toString().trim().toLowerCase();

    let updatedRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]?.toString().trim().toLowerCase() === lower) {
        sheet.getRange(i + 1, 3).setValue(category);
        updatedRow = i + 1;
        break;
      }
    }
    if (updatedRow === -1) return respond({ error: 'Writer not found: ' + name });

    const aSheet = ss.getSheetByName(ARTICLES_SHEET);
    if (aSheet) {
      const aRows = aSheet.getDataRange().getValues();
      for (let i = 1; i < aRows.length; i++) {
        if (aRows[i][0]?.toString().trim().toLowerCase() === lower) {
          aSheet.getRange(i + 1, 2).setValue(category);
        }
      }
    }
    return respond({ success: true, row: updatedRow });
  } catch (e) {
    return respond({ error: e.message });
  }
}

function addWriter(name, link, category, cat2, cat3, feeds) {
  try {
    if (!name?.toString().trim()) return respond({ error: 'Missing name' });
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WRITERS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    const lower = name.toString().trim().toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]?.toString().trim().toLowerCase() === lower) {
        return respond({ error: 'Writer already exists: ' + name });
      }
    }
    // Build a new row aligned to the sheet's header order
    const newRow = headers.map(h => {
      if (h.includes('name'))  return name.toString().trim();
      if (h.includes('link'))  return (link  || '').toString().trim();
      if (h.includes('feed'))  return (feeds || '').toString().trim();
      return '';
    });
    const catIdx = headers.reduce((a, h, i) => { if (h.includes('cat')) a.push(i); return a; }, []);
    if (catIdx[0] !== undefined) newRow[catIdx[0]] = (category || '').toString().trim();
    if (catIdx[1] !== undefined) newRow[catIdx[1]] = (cat2    || '').toString().trim();
    if (catIdx[2] !== undefined) newRow[catIdx[2]] = (cat3    || '').toString().trim();
    sheet.appendRow(newRow);
    return respond({ success: true, row: sheet.getLastRow() });
  } catch (e) {
    return respond({ error: e.message });
  }
}

function updateWriter(originalName, name, link, category, cat2, cat3, feeds) {
  try {
    if (!originalName?.toString().trim()) return respond({ error: 'Missing originalName' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(WRITERS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(h => h.toString().toLowerCase().trim());
    const origLower = originalName.toString().trim().toLowerCase();

    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]?.toString().trim().toLowerCase() === origLower) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) return respond({ error: 'Writer not found: ' + originalName });

    const newName = (name || originalName).toString().trim();
    const ni  = headers.findIndex(h => h.includes('name'));
    const li  = headers.findIndex(h => h.includes('link'));
    const fi  = headers.findIndex(h => h.includes('feed'));
    const catIdx = headers.reduce((a, h, i) => { if (h.includes('cat')) a.push(i); return a; }, []);

    if (ni  >= 0) sheet.getRange(rowIdx, ni  + 1).setValue(newName);
    if (li  >= 0) sheet.getRange(rowIdx, li  + 1).setValue((link  || '').toString().trim());
    if (fi  >= 0) sheet.getRange(rowIdx, fi  + 1).setValue((feeds || '').toString().trim());
    if (catIdx[0] !== undefined) sheet.getRange(rowIdx, catIdx[0] + 1).setValue((category || '').toString().trim());
    if (catIdx[1] !== undefined) sheet.getRange(rowIdx, catIdx[1] + 1).setValue((cat2     || '').toString().trim());
    if (catIdx[2] !== undefined) sheet.getRange(rowIdx, catIdx[2] + 1).setValue((cat3     || '').toString().trim());

    const aSheet = ss.getSheetByName(ARTICLES_SHEET);
    if (aSheet) {
      const aRows = aSheet.getDataRange().getValues();
      for (let i = 1; i < aRows.length; i++) {
        if (aRows[i][0]?.toString().trim().toLowerCase() === origLower) {
          if (newName.toLowerCase() !== origLower) aSheet.getRange(i + 1, 1).setValue(newName);
          aSheet.getRange(i + 1, 2).setValue((category || '').toString().trim());
        }
      }
    }
    return respond({ success: true, row: rowIdx });
  } catch (e) {
    return respond({ error: e.message });
  }
}

function syncCategories() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(WRITERS_SHEET);
    const rows = sheet.getDataRange().getValues();
    const h = rows[0].map(x => x.toString().toLowerCase().trim());
    const ni = h.findIndex(x => x.includes('name'));
    const ci1 = h.reduce((a, x, i) => { if (x.includes('cat')) a.push(i); return a; }, [])[0] ?? -1;

    const catMap = {};
    rows.slice(1).forEach(r => {
      const n = r[ni]?.toString().trim();
      if (n) catMap[n.toLowerCase()] = ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '';
    });

    const aSheet = ss.getSheetByName(ARTICLES_SHEET);
    if (!aSheet) return respond({ error: 'Articles sheet not found' });
    const aRows = aSheet.getDataRange().getValues();
    let updated = 0;
    for (let i = 1; i < aRows.length; i++) {
      const wn = aRows[i][0]?.toString().trim();
      if (!wn) continue;
      const newCat = catMap[wn.toLowerCase()];
      if (newCat !== undefined && newCat !== aRows[i][1]?.toString().trim()) {
        aSheet.getRange(i + 1, 2).setValue(newCat);
        updated++;
      }
    }
    return respond({ success: true, updated });
  } catch (e) {
    return respond({ error: e.message });
  }
}

// ─── RSS Sync (daily trigger) ──────────────────────────────────────────────────

const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

function syncRSS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const writersSheet  = ss.getSheetByName(WRITERS_SHEET);
  const articlesSheet = ss.getSheetByName(ARTICLES_SHEET);

  const wRows = writersSheet.getDataRange().getValues();
  const wh = wRows[0].map(x => x.toString().toLowerCase().trim());
  const ni  = wh.findIndex(x => x.includes('name'));
  const fi  = wh.findIndex(x => x.includes('feed'));
  const ci1 = wh.reduce((a, x, i) => { if (x.includes('cat')) a.push(i); return a; }, [])[0] ?? -1;

  // Build feed task list: { url, name, cat }
  const tasks = [];
  for (let i = 1; i < wRows.length; i++) {
    const name  = wRows[i][ni]?.toString().trim();
    const feeds = fi >= 0 ? wRows[i][fi]?.toString().trim() : '';
    const cat   = ci1 >= 0 ? wRows[i][ci1]?.toString().trim() : '';
    if (!name || !feeds) continue;
    for (const url of feeds.split(',').map(f => f.trim()).filter(Boolean)) {
      tasks.push({ url, name, cat });
    }
  }

  console.log(`Fetching ${tasks.length} feeds…`);

  // fetchAll rate-limits at ~50 concurrent requests — batch with a short sleep
  const BATCH_SIZE = 50;
  const responses = [];
  for (let b = 0; b < tasks.length; b += BATCH_SIZE) {
    const batch = tasks.slice(b, b + BATCH_SIZE);
    try {
      const batchResponses = UrlFetchApp.fetchAll(batch.map(t => ({
        url: t.url,
        method: 'get',
        headers: RSS_HEADERS,
        muteHttpExceptions: true,
        followRedirects: true
      })));
      responses.push(...batchResponses);
    } catch (err) {
      console.error(`fetchAll error on batch ${b}–${b + batch.length}: ` + err.message);
      // Push nulls so indexes stay aligned with tasks
      for (let i = 0; i < batch.length; i++) responses.push(null);
    }
    if (b + BATCH_SIZE < tasks.length) Utilities.sleep(1000);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

  // Prune old articles
  const existingData = articlesSheet.getDataRange().getValues();
  const header = existingData[0];
  const toKeep = [header];
  for (let i = 1; i < existingData.length; i++) {
    const d = new Date(existingData[i][4]);
    if (!isNaN(d.getTime()) && d >= cutoff) toKeep.push(existingData[i]);
  }
  articlesSheet.clearContents();
  if (toKeep.length > 0) {
    articlesSheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
  }

  // Dedup set
  const existingUrls = new Set(toKeep.slice(1).map(r => r[3]?.toString().trim()).filter(Boolean));

  // Parse and collect new articles; track each writer's most recent post
  const newRows = [];
  const latestByName = {};
  let fetched = 0, failed = 0;
  for (let i = 0; i < responses.length; i++) {
    const { name, cat, url } = tasks[i];
    const resp = responses[i];
    if (!resp || resp.getResponseCode() !== 200) { failed++; continue; }
    fetched++;
    if (!(name in latestByName)) latestByName[name] = null; // feed reachable, may have no posts
    for (const item of parseRSS(resp.getContentText())) {
      if (item.pubDate && (!latestByName[name] || item.pubDate > latestByName[name])) latestByName[name] = item.pubDate;
      if (!item.url || existingUrls.has(item.url) || !item.pubDate || item.pubDate < cutoff) continue;
      newRows.push([name, cat, item.title || '', item.url, item.pubDate]);
      existingUrls.add(item.url);
    }
  }

  if (newRows.length > 0) {
    articlesSheet.getRange(articlesSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  }

  // Refresh the Last Post column so it never goes stale.
  // Built as one column array and written with a single setValues call —
  // per-cell writes exceed the 6-minute execution limit.
  const lpi = wh.findIndex(x => x.includes('last'));
  if (lpi >= 0 && wRows.length > 1) {
    const tz = Session.getScriptTimeZone();
    const col = [];
    for (let i = 1; i < wRows.length; i++) {
      const name = wRows[i][ni]?.toString().trim();
      let val = wRows[i][lpi]; // default: keep existing (no feed, or fetch failed this run)
      if (name && (name in latestByName)) {
        const latest = latestByName[name];
        val = latest ? Utilities.formatDate(latest, tz, 'yyyy-MM-dd') : 'no posts found';
      }
      col.push([val]);
    }
    writersSheet.getRange(2, lpi + 1, col.length, 1).setValues(col);
  }

  console.log(`Sync done. ${fetched} feeds OK, ${failed} failed. Added ${newRows.length} articles.`);
}

function parseRSS(xml) {
  const items = [];
  try {
    const doc = XmlService.parse(xml);
    const root = doc.getRootElement();
    if (root.getName() === 'rss') {
      const channel = root.getChild('channel');
      if (!channel) return items;
      for (const item of channel.getChildren('item')) {
        const title   = item.getChildText('title') || '';
        const link    = item.getChildText('link')  || '';
        const dateStr = item.getChildText('pubDate') || '';
        const pubDate = dateStr ? new Date(dateStr) : null;
        if (link && pubDate && !isNaN(pubDate.getTime())) {
          items.push({ title: title.trim(), url: link.trim(), pubDate });
        }
      }
    } else if (root.getName() === 'feed') {
      const ns = XmlService.getNamespace('http://www.w3.org/2005/Atom');
      for (const entry of root.getChildren('entry', ns)) {
        const title   = entry.getChildText('title', ns) || '';
        const linkEl  = entry.getChild('link', ns);
        const link    = linkEl ? (linkEl.getAttribute('href')?.getValue() || '') : '';
        const dateStr = entry.getChildText('published', ns) || entry.getChildText('updated', ns) || '';
        const pubDate = dateStr ? new Date(dateStr) : null;
        if (link && pubDate && !isNaN(pubDate.getTime())) {
          items.push({ title: title.trim(), url: link.trim(), pubDate });
        }
      }
    }
  } catch (e) {}
  return items;
}

// ─── Digest (preview + Google Doc creation) ────────────────────────────────────

function loadWriterData(ss) {
  const wSheet = ss.getSheetByName(WRITERS_SHEET);
  const wRows = wSheet.getDataRange().getValues();
  const wh = wRows[0].map(x => x.toString().toLowerCase().trim());
  const wni = wh.findIndex(x => x.includes('name'));
  const wli = wh.findIndex(x => x.includes('link'));
  const catIdx = wh.reduce((a, x, i) => { if (x.includes('cat')) a.push(i); return a; }, []);
  const [ci1, ci2, ci3] = [catIdx[0] ?? -1, catIdx[1] ?? -1, catIdx[2] ?? -1];

  const profileMap = {};
  const writerCatsMap = {};
  wRows.slice(1).forEach(r => {
    if (!r[wni]) return;
    const name = r[wni].toString().trim();
    profileMap[name] = r[wli]?.toString().trim() || '';
    writerCatsMap[name] = [
      ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '',
      ci2 >= 0 && r[ci2] ? r[ci2].toString().trim() : '',
      ci3 >= 0 && r[ci3] ? r[ci3].toString().trim() : ''
    ].filter(Boolean);
  });
  return { profileMap, writerCatsMap };
}

// Resolves the digest/category selection to the list of categories to include
// (null = all categories), and the section order for output.
function resolveCatList(catFilter, digest) {
  if (catFilter && catFilter !== '__all__') return [catFilter];
  if (digest && DIGESTS[digest]) return DIGESTS[digest];
  return null;
}

// overrides is keyed by article URL: { "https://...": "Tech & AI" }
function loadArticles(fromD, toD, catFilter, digest, overrides) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { profileMap, writerCatsMap } = loadWriterData(ss);
  const catList = resolveCatList(catFilter, digest);

  const aSheet = ss.getSheetByName(ARTICLES_SHEET);
  const aRows = aSheet.getDataRange().getValues();

  const catMap = {}, uncatMap = {}, multicatPending = {};
  let totalArticles = 0;

  for (let i = 1; i < aRows.length; i++) {
    const row = aRows[i];
    const writerName    = (row[0] || '').toString().trim();
    const storedCategory = (row[1] || '').toString().trim();
    const title         = (row[2] || '').toString().trim();
    const url           = (row[3] || '').toString().trim();
    const pubDate       = new Date(row[4]);

    if (!writerName || !title || !url || isNaN(pubDate.getTime())) continue;
    if (pubDate < fromD || pubDate > toD) continue;

    const writerCats  = writerCatsMap[writerName] || (storedCategory ? [storedCategory] : []);
    const effectiveCat = overrides[url] || storedCategory;

    if (catList && !catList.includes(effectiveCat) && !writerCats.some(c => catList.includes(c))) continue;

    const profileLink = getProfileUrl(profileMap[writerName] || '');
    const placedCat = (catList && !catList.includes(effectiveCat))
      ? writerCats.find(c => catList.includes(c))
      : effectiveCat;

    if (placedCat) {
      if (!catMap[placedCat]) catMap[placedCat] = {};
      if (!catMap[placedCat][writerName]) catMap[placedCat][writerName] = { profileLink, articles: [] };
      catMap[placedCat][writerName].articles.push({ title, url });
    } else {
      if (!uncatMap[writerName]) uncatMap[writerName] = { profileLink, articles: [] };
      uncatMap[writerName].articles.push({ title, url });
    }
    totalArticles++;

    // Writers with 2+ categories: offer a per-article category choice
    if (writerCats.length > 1 && !overrides[url]) {
      if (!multicatPending[writerName]) multicatPending[writerName] = { cats: writerCats, articles: [] };
      multicatPending[writerName].articles.push({ title, url, current: placedCat || storedCategory });
    }
  }

  const writerCount = Object.values(catMap).reduce((n, c) => n + Object.keys(c).length, 0) + Object.keys(uncatMap).length;
  return { catMap, uncatMap, multicatPending, totalArticles, writerCount, catList };
}

function previewDigest(fromStr, toStr, catFilter, digest) {
  if (!fromStr || !toStr) return { error: 'Missing from/to dates' };
  const fromD = new Date(fromStr + 'T00:00:00');
  const toD   = new Date(toStr   + 'T23:59:59');
  const { catMap, uncatMap, multicatPending, totalArticles, writerCount } = loadArticles(fromD, toD, catFilter, digest, {});

  return {
    success: true,
    writers: writerCount,
    articles: totalArticles,
    categories: Object.keys(catMap).length + (Object.keys(uncatMap).length > 0 ? 1 : 0),
    uncategorised: Object.entries(uncatMap).map(([name, { articles }]) => ({ name, articles: articles.slice(0, 3) })),
    multicat_writers: Object.entries(multicatPending).map(([name, { cats, articles }]) => ({ name, cats, articles: articles.slice(0, 20) }))
  };
}

// Writes per-article category choices back to the Articles tab so they stick.
function persistArticleCategories(overrides) {
  const urls = Object.keys(overrides || {});
  if (!urls.length) return 0;
  const aSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ARTICLES_SHEET);
  const aRows = aSheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < aRows.length; i++) {
    const url = (aRows[i][3] || '').toString().trim();
    if (overrides[url] && overrides[url] !== (aRows[i][1] || '').toString().trim()) {
      aSheet.getRange(i + 1, 2).setValue(overrides[url]);
      updated++;
    }
  }
  return updated;
}

function buildAndWriteDigest(fromStr, toStr, catFilter, digest, overrides) {
  if (!fromStr || !toStr) return { error: 'Missing from/to dates' };
  const fromD = new Date(fromStr + 'T00:00:00');
  const toD   = new Date(toStr   + 'T23:59:59');
  const saved = persistArticleCategories(overrides);
  const { catMap, uncatMap, totalArticles, writerCount, catList } = loadArticles(fromD, toD, catFilter, digest, overrides);

  const tabName = (digest && DIGESTS[digest] ? digest + ' Digest: ' : 'Digest: ') + formatTabName(fromStr, toStr);
  writeToDoc(catMap, uncatMap, tabName, catList);

  return {
    success: true,
    writers: writerCount,
    articles: totalArticles,
    categoriesSaved: saved,
    tab: tabName,
    url: 'https://docs.google.com/document/d/' + DIGEST_DOC_ID + '/edit',
    html: buildDigestHtml(catMap, uncatMap, tabName, catFilter === '__all__', catList)
  };
}

// catList (when set) controls section order; otherwise alphabetical.
function orderedCats(catMap, catList) {
  const present = Object.keys(catMap);
  if (!catList) return present.sort();
  return catList.filter(c => present.includes(c)).concat(present.filter(c => !catList.includes(c)).sort());
}

function buildDigestHtml(catMap, uncatMap, tabName, includeImages, catList) {
  let html = '<h1>' + escapeHtml(tabName) + '</h1>';
  for (const cat of orderedCats(catMap, catList)) {
    if (includeImages) html += categoryImageHtml(cat);
    html += '<h2>' + escapeHtml(cat) + '</h2>';
    for (const writerName of Object.keys(catMap[cat]).sort()) {
      const { profileLink, articles } = catMap[cat][writerName];
      html += writerEntryHtml(writerName, profileLink, articles);
    }
  }
  if (Object.keys(uncatMap).length > 0) {
    html += '<h2>Uncategorised</h2>';
    for (const writerName of Object.keys(uncatMap).sort()) {
      const { profileLink, articles } = uncatMap[writerName];
      html += writerEntryHtml(writerName, profileLink, articles);
    }
  }
  return html;
}

function categoryImageHtml(cat) {
  const img = CATEGORY_IMAGES[cat];
  if (!img) return '';
  return '<figure style="text-align:center;max-width:272px;margin:0 auto;">' +
    '<img src="' + img.url + '" style="max-width:272px;width:272px;display:block;margin:0 auto;">' +
    '<figcaption><em>Photo by <a href="' + img.photographerUrl + '">' + escapeHtml(img.photographer) + '</a> on <a href="https://unsplash.com">Unsplash</a></em></figcaption>' +
    '</figure>';
}

// Substack's paste sanitizer strips inline color styling; bold survives the paste.
function writerEntryHtml(writerName, profileLink, articles) {
  const nameHtml = profileLink
    ? '<strong><a href="' + profileLink + '">' + escapeHtml(writerName) + '</a></strong>'
    : '<strong>' + escapeHtml(writerName) + '</strong>';
  if (articles.length === 1) {
    return '<p>' + nameHtml + ' <a href="' + articles[0].url + '">' + escapeHtml(articles[0].title) + '</a></p>';
  }
  let html = '<p>' + nameHtml + '</p><ul>';
  for (const art of articles) html += '<li><a href="' + art.url + '">' + escapeHtml(art.title) + '</a></li>';
  return html + '</ul>';
}

function escapeHtml(s) {
  return s.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeToDoc(catMap, uncatMap, tabName, catList) {
  const doc  = DocumentApp.openById(DIGEST_DOC_ID);
  const body = doc.getBody();

  if (body.getText().trim().length > 0) body.insertPageBreak(0);

  const sortedCats = orderedCats(catMap, catList);
  const hasUncat   = Object.keys(uncatMap).length > 0;
  let insertIndex  = 0;

  if (hasUncat) {
    for (const writerName of Object.keys(uncatMap).sort().reverse()) {
      const { profileLink, articles } = uncatMap[writerName];
      insertWriterEntry(body, insertIndex, writerName, profileLink, articles);
    }
    const h = body.insertParagraph(insertIndex, 'Uncategorised');
    h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.insertParagraph(insertIndex, '');
  }

  for (const cat of [...sortedCats].reverse()) {
    for (const writerName of Object.keys(catMap[cat]).sort().reverse()) {
      const { profileLink, articles } = catMap[cat][writerName];
      insertWriterEntry(body, insertIndex, writerName, profileLink, articles);
    }
    const h = body.insertParagraph(insertIndex, cat);
    h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.insertParagraph(insertIndex, '');
  }

  const titlePara = body.insertParagraph(0, tabName);
  titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  doc.saveAndClose();
}

function insertWriterEntry(body, index, writerName, profileLink, articles) {
  if (articles.length === 1) {
    const para = body.insertParagraph(index, '');
    const nameText = para.appendText(writerName);
    nameText.setForegroundColor(NAME_COLOR);
    if (profileLink) nameText.setLinkUrl(profileLink);
    para.appendText(' ');
    const artText = para.appendText(articles[0].title);
    artText.setForegroundColor(ARTICLE_COLOR);
    if (articles[0].url) artText.setLinkUrl(articles[0].url);
  } else {
    for (const art of [...articles].reverse()) {
      const li = body.insertListItem(index, '');
      li.setGlyphType(DocumentApp.GlyphType.BULLET);
      const artText = li.appendText(art.title);
      artText.setForegroundColor(ARTICLE_COLOR);
      if (art.url) artText.setLinkUrl(art.url);
    }
    const namePara = body.insertParagraph(index, '');
    const nameText = namePara.appendText(writerName);
    nameText.setForegroundColor(NAME_COLOR);
    if (profileLink) nameText.setLinkUrl(profileLink);
  }
}

function getProfileUrl(link) {
  if (!link) return '';
  if (link.includes('open.substack.com/users/')) {
    const m = link.match(/open\.substack\.com\/users\/\d+-([^/?]+)/);
    if (m) return 'https://substack.com/@' + m[1];
  }
  const m2 = link.match(/open\.substack\.com\/pub\/([^/?]+)/);
  if (m2) return 'https://' + m2[1] + '.substack.com';
  return link;
}

function formatTabName(from, to) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to   + 'T23:59:59');
  const fd = f.getDate(), fm = months[f.getMonth()], fy = f.getFullYear();
  const td = t.getDate(), tm = months[t.getMonth()], ty = t.getFullYear();
  if (fy === ty && fm === tm) return `${fd}–${td} ${fm} ${fy}`;
  if (fy === ty)              return `${fd} ${fm} – ${td} ${tm} ${fy}`;
  return `${fd} ${fm} ${fy} – ${td} ${tm} ${ty}`;
}
