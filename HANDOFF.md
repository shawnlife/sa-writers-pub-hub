# SA Writing Digest Generator — Claude Code Handoff

## Project Overview

A web-based tool built for **Jen Thorpe** to automate the generation of her weekly *South African Writers' Pub Hub* digest on Substack. Previously Jen manually checked ~400 Substack writers' pages. This tool automates that entirely.

---

## What's Been Built

### The Tool
A single-page HTML/JS app (currently a Claude artifact) that:
1. Loads the writer list from a Google Sheet via Apps Script
2. Shows a date range picker and category filter dropdown
3. On "Generate digest" — queries an article database (Google Sheet) for articles published in the date range — nearly instant
4. Shows uncategorised writers with a dropdown to assign categories + save directly to the sheet
5. On "Create digest in Google Doc" — calls Apps Script 2 which reads the article database and writes a formatted digest (with live hyperlinks) to a Google Doc

### The Infrastructure
- **Google Sheet** (Jen's, Shawn has edit access): Contains two tabs:
  - `Categorized` — the writer list (Name, Substack Link, Category)
  - `Articles` — the article database (Writer Name, Category, Article Title, Article URL, Published Date)
- **Google Doc** (Jen's): One doc, all digests stacked inside with H1 date headings, newest at top
- **3 Apps Scripts** deployed as web apps

---

## Google Resource IDs

| Resource | ID / URL |
|----------|----------|
| Google Sheet | `11VMjloWhg9qJNfUMMTTAdLQkqt7DqoU8cvoBmxx1WEk` |
| Google Doc | `1c865BZua0CQ1WkOCvoIgjLbn9Gx7MqrMQ_G4Kpm3mp4` |
| Script 1 URL | `https://script.google.com/macros/s/AKfycbxy071PQpHB41exiBoMqo5q4dQfjfXn_ovZHkXwfTAAWQFTH2q8WoXaw1s2Q8KqO41Y/exec` |
| Script 2 URL | `https://script.google.com/macros/s/AKfycbyCZ4CgqOylY8l7z1FxVrJIFK7vfIOxPAsPOdRexNrJ_RwYrCno6VHBeolE3gwV2Ns1/exec` |
| Script 3 URL | `https://script.google.com/macros/s/AKfycbzc6gYvMHCiaYz12joc4b3HBRgIjGVTrnJ_0hndUpbMqYWjpsQL7844QLgBcR9dyoMaWA/exec` |

---

## Script Roles

### Script 1 — Writer list & RSS proxy & category updates
- `GET /` — returns writer list as JSON array `[{name, link, category}]`
- `GET /?url=<feedUrl>` — proxies RSS feed fetch (Substack blocks browser fetches directly)
- `GET /?action=updateCategory&name=<name>&category=<cat>` — writes category to column C of the matching row in `Categorized` tab, matched by name

### Script 2 — Digest preview & Google Doc creation (reads from Articles sheet)
- `GET /?action=preview&from=YYYY-MM-DD&to=YYYY-MM-DD&cat=<cat|__all__>` — queries Articles sheet, returns `{success, writers, articles, categories, uncategorised: [{name, articles}]}`
- `GET /?action=createDigest&from=YYYY-MM-DD&to=YYYY-MM-DD&cat=<cat|__all__>` — queries Articles sheet, writes formatted digest to Google Doc (prepended at top with H1 date heading, live hyperlinks), returns `{success, writers, articles, tab, url}`

### Script 3 — RSS sync (runs on daily trigger)
- Function `syncAllFeeds()` — reads all writers from `Categorized`, fetches their RSS feeds, adds new articles to `Articles` tab, deduplicates by URL, prunes articles older than 90 days
- Set up with a Google Apps Script **time-based trigger** to run daily at 6am
- Run manually first time to backfill

---

## Sheet Structure

### Tab: `Categorized`
| Column A | Column B | Column C |
|----------|----------|----------|
| Substack Name | Substack Link | Category |

Links are in format: `https://open.substack.com/users/12345-writer-name?utm_source=mentions`
Or: `https://open.substack.com/pub/publicationname`

Categories currently in use:
Agriculture, Arts & Culture, Birth Fertility & Parenting, Books Writing & Literature, Business Work & Economics, Climate Environment & Sustainability, Education, Feminism Gender & LGBTQI+, Fiction, History, Mining, Personal Essay & Memoir, Poetry, Politics Media & Government, Relationships, Religion Spirituality & Theology, Science & Health, Sports & Fitness, Tech & AI, Trade and Industry, Travel & Food

### Tab: `Articles`
| Column A | Column B | Column C | Column D | Column E |
|----------|----------|----------|----------|----------|
| Writer Name | Category | Article Title | Article URL | Published Date |

---

## Known Issues / Next Steps

### Bug: "undefined categories" on Generate
The `preview` action in Script 2 returns `categories` count correctly but the tool shows "undefined". Likely the tool is reading `data.categories` but the response key may differ. Check Script 2's `previewDigest()` return object and the tool's `generate()` function.

### Bug: Assign categories section not appearing after Generate
The uncategorised writers panel should appear after "Generate digest" runs, populated from `data.uncategorised` returned by the preview call. Currently not showing. The `buildUncatSection()` function in the tool expects `[{name, articles: [{title, url}]}]` — verify Script 2 is returning this shape and the tool is correctly passing it.

### Bug: Category updates should also update the Articles tab
When Jen assigns a category to an uncategorised writer via the tool (Script 1 `updateCategory`), it currently only updates column C in the `Categorized` tab. It should also update column B (Category) for all existing rows in the `Articles` tab where column A (Writer Name) matches. This ensures future digest queries from the Articles tab reflect the new category without waiting for the next sync.

### Next Feature: Hosted version
The tool is currently a Claude artifact. It should be moved to a proper hosted URL (e.g. GitHub Pages at `shawnlife.github.io/writers-pub-hub/`) so Jen has a permanent link she can bookmark. The tool is plain HTML/CSS/JS — no build step needed.

---

## Design Specs

- Font: SF Pro (`-apple-system, BlinkMacSystemFont, 'SF Pro Display'`)
- Background: white `#fff`
- Primary button colour: `#e11c47` with white text
- Accent/success: `#22c55e`
- Error: `#ef4444`
- Border radius: 12–14px for cards, 8–10px for inputs/buttons
- Logo: 🇿🇦 flag emoji, top right, 38px circle with border
- Two quick-link buttons at top: "Writer & article database" (links to Sheet) and "Digests" (links to Doc)

---

## Flow Summary

```
[Tool loads] → Script 1 GET / → writer list → populate category dropdown

[Generate digest clicked] → Script 2 GET ?action=preview → Articles sheet query
  → returns: writer count, article count, category count, uncategorised list
  → tool shows stats + uncategorised assignment panel

[Assign category + Save] → Script 1 GET ?action=updateCategory
  → updates Categorized tab column C
  → ALSO NEEDS TO update Articles tab column B (bug to fix)

[Create digest in Google Doc] → Script 2 GET ?action=createDigest
  → queries Articles sheet → writes to Google Doc → returns URL

[Background, daily] → Script 3 syncAllFeeds()
  → fetches all 400 RSS feeds → adds new articles to Articles tab → prunes old
```

---

## Files in This Handoff

- `HANDOFF.md` — this document
- `script1.js` — Apps Script 1 (writer list, RSS proxy, category update)
- `script2.js` — Apps Script 2 (digest preview + Google Doc creation)
- `script3.js` — Apps Script 3 (RSS sync, runs on daily trigger)
- `tool.html` — the digest generator tool (full HTML/CSS/JS)
