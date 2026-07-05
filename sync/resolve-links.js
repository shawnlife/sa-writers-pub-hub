// One-time script — run locally from your Mac.
// Resolves each writer's open.substack.com/users/ link to their actual publication
// feed URLs and stores them in the Feeds column of the Writers sheet.
//
// Usage:
//   SUBSTACK_TOKEN="your-connect-sid-value" node resolve-links.js

const AS1_URL = 'https://script.google.com/macros/s/AKfycbzvdzFSv5d29zSfe5ddSiD2i2xEwAnYvZbaju5mvwgZUq_8zx76MlFS6zi5aQg1jltz/exec';
const DELAY_MS = 1200;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resolveProfile(token, writer) {
  const idMatch = writer.link.match(/open\.substack\.com\/users\/(\d+)/);
  if (!idMatch) return null;
  const userId = idMatch[1];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Cookie': `connect.sid=${token}`,
  };

  const subdomains = new Set();
  let handle = null;

  try {
    // 1. reader/feed/profile — get handle, primary publication, and any pubs
    //    where author_id matches this user (definitively their own)
    const feedResp = await fetch(
      `https://substack.com/api/v1/reader/feed/profile/${userId}?limit=50`,
      { signal: AbortSignal.timeout(15000), headers }
    );
    if (feedResp.ok) {
      const feedData = await feedResp.json();
      for (const item of feedData.items || []) {
        // Extract handle and primary publication from user context
        const user = item.context?.users?.find(u => String(u.id) === userId);
        if (user) {
          if (!handle && user.handle) handle = user.handle;
          const primarySub = user.primary_publication?.subdomain;
          if (primarySub) subdomains.add(primarySub);
        }
        // Include any publication where this user is the author
        const pub = item.publication;
        if (pub?.subdomain && String(pub.author_id) === userId) {
          subdomains.add(pub.subdomain);
        }
      }
    }

  } catch (err) {
    return null;
  }

  const profileUrl = handle ? `https://substack.com/@${handle}` : null;
  if (!profileUrl && subdomains.size === 0) return { reason: 'no profile found' };
  if (subdomains.size === 0) return { profileUrl, feeds: '', reason: 'no publications' };
  const feeds = [...subdomains].map(s => `https://${s}.substack.com/feed`).join(', ');
  return { profileUrl, feeds };
}

async function main() {
  const token = process.env.SUBSTACK_TOKEN;
  if (!token) {
    console.error('Missing SUBSTACK_TOKEN. Run as:');
    console.error('  SUBSTACK_TOKEN="your-connect-sid-value" node resolve-links.js');
    process.exit(1);
  }

  console.log('Loading writers from sheet…');
  const resp = await fetch(AS1_URL);
  const writers = await resp.json();
  if (!Array.isArray(writers)) throw new Error('Bad response: ' + JSON.stringify(writers));

  const toResolve = writers.filter(w => w.link && w.link.includes('open.substack.com/users/'));
  const alreadyDone = writers.length - toResolve.length;
  console.log(`${writers.length} total. ${alreadyDone} already resolved. Processing ${toResolve.length}…\n`);

  const updates = [];
  let resolved = 0, failed = 0;

  for (let i = 0; i < toResolve.length; i++) {
    const writer = toResolve[i];
    const result = await resolveProfile(token, writer);

    if (result && (result.profileUrl || result.feeds)) {
      const tag = result.feeds ? '✓' : '~';
      console.log(`  ${tag} [${i+1}/${toResolve.length}] ${writer.name}`);
      if (result.profileUrl) console.log(`      profile: ${result.profileUrl}`);
      if (result.feeds)      console.log(`      feeds:   ${result.feeds}`);
      else                   console.log(`      (no publications — profile link stored)`);
      updates.push({ name: writer.name, link: result.profileUrl || writer.link, feeds: result.feeds || '' });
      resolved++;
    } else {
      const reason = result?.reason || 'no profile found';
      console.log(`  ✗ [${i+1}/${toResolve.length}] ${writer.name} — ${reason}`);
      failed++;
    }

    // Save to sheet every 50 resolved
    if (updates.length > 0 && (updates.length % 50 === 0 || i === toResolve.length - 1)) {
      process.stdout.write(`\n  Saving ${updates.length} updates to sheet…`);
      try {
        const postResp = await fetch(AS1_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
          redirect: 'follow'
        });
        const r = await postResp.json();
        console.log(` ✓ (${r.updated} written)\n`);
      } catch (err) {
        console.log(` ✗ save failed: ${err.message}\n`);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ✓ ${resolved} resolved, ✗ ${failed} not found.`);
  if (failed > 0) console.log('Writers marked ✗ — add their feed URLs manually in the Feeds column.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
