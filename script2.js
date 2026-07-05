// SCRIPT 2 — Digest preview + Google Doc creation (reads from Articles sheet)
// Deployed at: https://script.google.com/macros/s/AKfycbyCZ4CgqOylY8l7z1FxVrJIFK7vfIOxPAsPOdRexNrJ_RwYrCno6VHBeolE3gwV2Ns1/exec
// Standalone Apps Script project (not bound to sheet — uses SHEET_ID)

const SHEET_ID = '11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk';
const ARTICLES_SHEET = 'Articles';
const WRITERS_SHEET = 'Categorized';
const DIGEST_DOC_ID = '1c865BZua0CQ1WkOCvoIgjLbn9Gx7MqrMQ_G4Kpm3mp4';

const NAME_COLOR = '#e11c47';
const ARTICLE_COLOR = '#000000';

// Per-category header image, matched to the photo Jen already uses for that
// category in her Substack digests. Categories not listed here get no image.
const CATEGORY_IMAGES = {
  'Arts & Culture': { url: 'https://images.unsplash.com/photo-1587731556938-38755b4803a6?auto=format&fit=crop&w=1080&q=80', photographer: 'Clay Banks', photographerUrl: 'https://unsplash.com/@claybanks' },
  'Birth Fertility & Parenting': { url: 'https://images.unsplash.com/photo-1543346242-2b8e41fb91ca?auto=format&fit=crop&w=1080&q=80', photographer: 'charlesdeluvio', photographerUrl: 'https://unsplash.com/@charlesdeluvio' },
  'Climate Environment & Sustainability': { url: 'https://images.unsplash.com/photo-1720021893364-20fb17efc639?auto=format&fit=crop&w=1080&q=80', photographer: 'Javier Miranda', photographerUrl: 'https://unsplash.com/@nuvaproductions' },
  'Education': { url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1080&q=80', photographer: 'Element5 Digital', photographerUrl: 'https://unsplash.com/@element5digital' },
  'Feminism Gender & LGBTQI+': { url: 'https://images.unsplash.com/photo-1548383675-379abfac2c41?auto=format&fit=crop&w=1080&q=80', photographer: 'chloe s.', photographerUrl: 'https://unsplash.com/@chloesimpson' },
  'Fiction': { url: 'https://images.unsplash.com/photo-1572097560317-1189048dac38?auto=format&fit=crop&w=1080&q=80', photographer: 'Ondrej Bocek', photographerUrl: 'https://unsplash.com/@ondrejbocek' },
  'History': { url: 'https://images.unsplash.com/photo-1592252032050-34897f779223?auto=format&fit=crop&w=1080&q=80', photographer: 'Benigno Hoyuela', photographerUrl: 'https://unsplash.com/@benignohoyuela' },
  'Personal Essay & Memoir': { url: 'https://images.unsplash.com/photo-1522794338816-ee3a17a00ae8?auto=format&fit=crop&w=1080&q=80', photographer: 'Debby Hudson', photographerUrl: 'https://unsplash.com/@hudsoncrafted' },
  'Poetry': { url: 'https://images.unsplash.com/photo-1487147264018-f937fba0c817?auto=format&fit=crop&w=1080&q=80', photographer: 'Mona Eendra', photographerUrl: 'https://unsplash.com/@monaeendra' },
  'Relationships': { url: 'https://images.unsplash.com/photo-1613244600331-ac72a1ee5256?auto=format&fit=crop&w=1080&q=80', photographer: 'freestocks', photographerUrl: 'https://unsplash.com/@freestocks' },
  'Religion Spirituality & Theology': { url: 'https://images.unsplash.com/photo-1586084531165-7c2dede00604?auto=format&fit=crop&w=1080&q=80', photographer: 'Sincerely Media', photographerUrl: 'https://unsplash.com/@sincerelymedia' },
  'Science & Health': { url: 'https://images.unsplash.com/photo-1576086085526-0de1930a57c7?auto=format&fit=crop&w=1080&q=80', photographer: 'National Cancer Institute', photographerUrl: 'https://unsplash.com/@nci' },
  'Tech & AI': { url: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=1080&q=80', photographer: 'Ales Nesetril', photographerUrl: 'https://unsplash.com/@alesnesetril' },
  'Trade and Industry': { url: 'https://images.unsplash.com/photo-1522125307274-36420256794e?auto=format&fit=crop&w=1080&q=80', photographer: 'Tim Mossholder', photographerUrl: 'https://unsplash.com/@timmossholder' },
  'Travel & Food': { url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1080&q=80', photographer: 'Jake Blucker', photographerUrl: 'https://unsplash.com/@jakeblucker' }
};

function doGet(e) {
  try {
    const action = e.parameter.action || 'createDigest';
    const from = e.parameter.from;
    const to = e.parameter.to;
    const catFilter = e.parameter.cat || '__all__';
    const overrides = e.parameter.overrides ? JSON.parse(e.parameter.overrides) : {};
    if (!from || !to) return respond({ error: 'Missing from/to dates' });
    if (action === 'preview') return respond(previewDigest(from, to, catFilter));
    if (action === 'createDigest') return respond(buildAndWriteDigest(from, to, catFilter, overrides));
    return respond({ error: 'Unknown action: ' + action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Loads writer profile links and all category columns from the Categorized sheet.
// Returns { profileMap, writerCatsMap } where:
//   profileMap: { writerName → profileUrl }
//   writerCatsMap: { writerName → [cat1, cat2, cat3] (non-empty only) }
function loadWriterData(ss) {
  const wSheet = ss.getSheetByName(WRITERS_SHEET);
  const wRows = wSheet.getDataRange().getValues();
  const wHeaders = wRows[0].map(h => h.toString().toLowerCase().trim());
  const wni = wHeaders.findIndex(h => h.includes('name'));
  const wli = wHeaders.findIndex(h => h.includes('link'));
  const catIndices = wHeaders.reduce((acc, h, i) => { if (h.includes('cat')) acc.push(i); return acc; }, []);
  const [ci1, ci2, ci3] = [catIndices[0] ?? -1, catIndices[1] ?? -1, catIndices[2] ?? -1];

  const profileMap = {};
  const writerCatsMap = {};
  wRows.slice(1).forEach(r => {
    if (!r[wni]) return;
    const name = r[wni].toString().trim();
    profileMap[name] = r[wli]?.toString().trim() || '';
    const cats = [
      ci1 >= 0 && r[ci1] ? r[ci1].toString().trim() : '',
      ci2 >= 0 && r[ci2] ? r[ci2].toString().trim() : '',
      ci3 >= 0 && r[ci3] ? r[ci3].toString().trim() : ''
    ].filter(Boolean);
    writerCatsMap[name] = cats;
  });

  return { profileMap, writerCatsMap };
}

function loadArticles(fromD, toD, catFilter, overrides) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const { profileMap, writerCatsMap } = loadWriterData(ss);

  // Load and filter articles
  const aSheet = ss.getSheetByName(ARTICLES_SHEET);
  const aRows = aSheet.getDataRange().getValues();

  const catMap = {};
  const uncatMap = {};
  const multicatPending = {}; // writers with 2+ cats who need disambiguation
  let totalArticles = 0;

  for (let i = 1; i < aRows.length; i++) {
    const row = aRows[i];
    const writerName = (row[0] || '').toString().trim();
    const storedCategory = (row[1] || '').toString().trim();
    const title = (row[2] || '').toString().trim();
    const url = (row[3] || '').toString().trim();
    const pubDateRaw = row[4];

    if (!writerName || !title || !url) continue;
    const pubDate = new Date(pubDateRaw);
    if (isNaN(pubDate.getTime())) continue;
    if (pubDate < fromD || pubDate > toD) continue;

    const writerCats = writerCatsMap[writerName] || (storedCategory ? [storedCategory] : []);
    const effectiveCat = overrides[writerName] || storedCategory;

    if (catFilter !== '__all__' && !writerCats.includes(catFilter) && effectiveCat !== catFilter) continue;

    const profileLink = getProfileUrl(profileMap[writerName] || '');

    if (effectiveCat) {
      if (!catMap[effectiveCat]) catMap[effectiveCat] = {};
      if (!catMap[effectiveCat][writerName]) catMap[effectiveCat][writerName] = { profileLink, articles: [] };
      catMap[effectiveCat][writerName].articles.push({ title, url });
    } else {
      if (!uncatMap[writerName]) uncatMap[writerName] = { profileLink, articles: [] };
      uncatMap[writerName].articles.push({ title, url });
    }
    totalArticles++;

    // Track writers with multiple categories who haven't had an override set
    if (writerCats.length > 1 && !overrides[writerName]) {
      if (!multicatPending[writerName]) multicatPending[writerName] = { cats: writerCats, articles: [] };
      multicatPending[writerName].articles.push({ title, url });
    }
  }

  const writerCount = Object.values(catMap).reduce((n, cat) => n + Object.keys(cat).length, 0) + Object.keys(uncatMap).length;

  return { catMap, uncatMap, multicatPending, totalArticles, writerCount };
}

function previewDigest(fromStr, toStr, catFilter) {
  const fromD = new Date(fromStr + 'T00:00:00');
  const toD = new Date(toStr + 'T23:59:59');
  const { catMap, uncatMap, multicatPending, totalArticles, writerCount } = loadArticles(fromD, toD, catFilter, {});

  const uncategorised = Object.entries(uncatMap).map(([name, { articles }]) => ({
    name,
    articles: articles.slice(0, 3)
  }));

  const multicat_writers = Object.entries(multicatPending).map(([name, { cats, articles }]) => ({
    name,
    cats,
    articles: articles.slice(0, 3)
  }));

  return {
    success: true,
    writers: writerCount,
    articles: totalArticles,
    categories: Object.keys(catMap).length + (Object.keys(uncatMap).length > 0 ? 1 : 0),
    uncategorised,
    multicat_writers
  };
}

function buildAndWriteDigest(fromStr, toStr, catFilter, overrides) {
  const fromD = new Date(fromStr + 'T00:00:00');
  const toD = new Date(toStr + 'T23:59:59');
  const { catMap, uncatMap, totalArticles, writerCount } = loadArticles(fromD, toD, catFilter, overrides);

  const tabName = formatTabName(fromStr, toStr);
  writeToDoc(catMap, uncatMap, tabName);

  return {
    success: true,
    writers: writerCount,
    articles: totalArticles,
    tab: tabName,
    url: 'https://docs.google.com/document/d/' + DIGEST_DOC_ID + '/edit',
    html: buildDigestHtml(catMap, uncatMap, tabName, catFilter === '__all__')
  };
}

function buildDigestHtml(catMap, uncatMap, tabName, includeImages) {
  let html = '<h1>Digest: ' + escapeHtml(tabName) + '</h1>';

  const sortedCats = Object.keys(catMap).sort();
  for (const cat of sortedCats) {
    if (includeImages) html += categoryImageHtml(cat);
    html += '<h2>' + escapeHtml(cat) + '</h2>';
    const writers = Object.keys(catMap[cat]).sort();
    for (const writerName of writers) {
      const { profileLink, articles } = catMap[cat][writerName];
      html += writerEntryHtml(writerName, profileLink, articles);
    }
  }

  if (Object.keys(uncatMap).length > 0) {
    html += '<h2>Uncategorised</h2>';
    const uncatWriters = Object.keys(uncatMap).sort();
    for (const writerName of uncatWriters) {
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

// Substack's paste sanitizer strips all inline color styling, and the pink
// writer-name color in Jen's published digests only comes from Substack's
// native @mention feature (not reproducible via pasted HTML). Bold is used
// instead to visually distinguish writer names from article titles, since
// bold/italic formatting does survive the paste.
function writerEntryHtml(writerName, profileLink, articles) {
  const nameHtml = profileLink
    ? '<strong><a href="' + profileLink + '">' + escapeHtml(writerName) + '</a></strong>'
    : '<strong>' + escapeHtml(writerName) + '</strong>';

  if (articles.length === 1) {
    return '<p>' + nameHtml + ' ' +
      '<a href="' + articles[0].url + '">' + escapeHtml(articles[0].title) + '</a></p>';
  }

  let html = '<p>' + nameHtml + '</p><ul>';
  for (const art of articles) {
    html += '<li><a href="' + art.url + '">' + escapeHtml(art.title) + '</a></li>';
  }
  html += '</ul>';
  return html;
}

function escapeHtml(s) {
  return s.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeToDoc(catMap, uncatMap, tabName) {
  const doc = DocumentApp.openById(DIGEST_DOC_ID);
  const body = doc.getBody();

  // If doc already has content, insert a page break before prepending
  const existingText = body.getText().trim();
  if (existingText.length > 0) {
    body.insertPageBreak(0);
  }

  const sortedCats = Object.keys(catMap).sort();
  const hasUncat = Object.keys(uncatMap).length > 0;
  let insertIndex = 0;

  // Insert uncategorised last (bottom), so insert first when building top-down reversed
  if (hasUncat) {
    const uncatWriters = Object.keys(uncatMap).sort().reverse();
    for (const writerName of uncatWriters) {
      const { profileLink, articles } = uncatMap[writerName];
      insertWriterEntry(body, insertIndex, writerName, profileLink, articles);
    }
    const uncatHeading = body.insertParagraph(insertIndex, 'Uncategorised');
    uncatHeading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.insertParagraph(insertIndex, '');
  }

  // Insert categories in reverse alphabetical so they end up alphabetical at top
  const reversedCats = [...sortedCats].reverse();
  for (const cat of reversedCats) {
    const writers = Object.keys(catMap[cat]).sort().reverse();
    for (const writerName of writers) {
      const { profileLink, articles } = catMap[cat][writerName];
      insertWriterEntry(body, insertIndex, writerName, profileLink, articles);
    }
    const catHeading = body.insertParagraph(insertIndex, cat);
    catHeading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.insertParagraph(insertIndex, '');
  }

  // Insert digest title at very top
  const dateHeading = body.insertParagraph(0, 'Digest: ' + tabName);
  dateHeading.setHeading(DocumentApp.ParagraphHeading.HEADING1);

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
    // Insert bullet articles in reverse so they come out in correct order
    for (const art of [...articles].reverse()) {
      const listItem = body.insertListItem(index, '');
      listItem.setGlyphType(DocumentApp.GlyphType.BULLET);
      const artText = listItem.appendText(art.title);
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
  const m = link.match(/open\.substack\.com\/users\/\d+-([^/?]+)/);
  if (m) return 'https://substack.com/@' + m[1];
  const m2 = link.match(/open\.substack\.com\/pub\/([^/?]+)/);
  if (m2) return 'https://' + m2[1] + '.substack.com';
  return link;
}

function formatTabName(from, to) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T23:59:59');
  const fd = f.getDate(), fm = months[f.getMonth()], fy = f.getFullYear();
  const td = t.getDate(), tm = months[t.getMonth()], ty = t.getFullYear();
  if (fy === ty && fm === tm) return `${fd}–${td} ${fm} ${fy}`;
  if (fy === ty) return `${fd} ${fm} – ${td} ${tm} ${fy}`;
  return `${fd} ${fm} ${fy} – ${td} ${tm} ${ty}`;
}
