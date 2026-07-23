/**
 * fetch-ladder.js
 * Fetches ladder data for all Trinity divisions and writes public/ladder.json
 *
 * Smart refresh logic:
 * - Checks public/fixtures.json for the `ladderStale` flag set by fetch-fixtures.js
 * - If not stale AND not a manual/forced run, skips the fetch entirely
 * - This prevents hammering the Squadi API every 2 minutes for ladder data
 */

const fs   = require('fs');
const path = require('path');

const COMPETITION_KEY = '3023e0a7-dbcf-4f0f-a7ce-350e61da84d6';
const API_KEY         = process.env.SQUADI_API_KEY || '';
const SQUADI_BASE     = 'https://api-netball.squadi.com';
const FIXTURES_FILE   = path.join(__dirname, '..', 'public', 'fixtures.json');
const OUT_FILE        = path.join(__dirname, '..', 'public', 'ladder.json');
const FORCE           = process.argv.includes('--force');

// All division IDs that contain Trinity teams
const TRINITY_DIVISION_IDS = [
  33344, 33347, 33348, 33349, 33352,
  33354, 33355, 33359, 33363, 33364,
  33365, 33367, 33369, 33370, 33372,
];

const HEADERS = {
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-AU,en;q=0.9',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Referer':         'https://registration.netballconnect.com/',
  'Origin':          'https://registration.netballconnect.com',
  'x-api-key':       API_KEY,
};

function isTrinity(name) {
  return typeof name === 'string' && name.toLowerCase().includes('trinity');
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`  Attempt ${i + 1} failed for ${url.split('?')[0]}: ${err.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, (i + 1) * 2000));
      else throw err;
    }
  }
}

async function main() {
  // Check if ladder refresh is needed
  if (!FORCE) {
    try {
      const fixtures = JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8'));
      if (!fixtures.ladderStale) {
        console.log('⏭️  Ladder is up to date — no completed matches since last fetch. Skipping.');
        console.log('   (Run with --force to fetch anyway)');
        return;
      }
      console.log(`🏁 ladderStale=true — ${fixtures.newlyCompleted} match(es) just completed. Fetching ladder...`);
    } catch {
      console.log('No fixtures file found — fetching ladder anyway...');
    }
  } else {
    console.log('--force flag set — fetching ladder regardless of stale state...');
  }

  console.log(`Fetching ${TRINITY_DIVISION_IDS.length} divisions in parallel...`);

  // Fetch all divisions concurrently with a small stagger to avoid rate limiting
  const results = await Promise.allSettled(
    TRINITY_DIVISION_IDS.map((divId, i) =>
      new Promise(resolve => setTimeout(resolve, i * 100))  // 100ms stagger
        .then(() => fetchWithRetry(
          `${SQUADI_BASE}/livescores/teams/ladder/v2`
          + `?divisionIds=${divId}`
          + `&competitionKey=${COMPETITION_KEY}`
          + `&filteredOutCompStatuses=1&showForm=1&sportRefId=1`
        ))
        .then(data => ({ divId, data }))
    )
  );

  // Merge all entries, count teams per division
  const allEntries = [];
  let ok = 0, failed = 0;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      ok++;
      for (const entry of (r.value.data?.ladders || [])) {
        allEntries.push(entry);
      }
    } else {
      failed++;
      console.warn(`  Division failed: ${r.reason?.message}`);
    }
  }

  console.log(`  Fetched ${ok}/${TRINITY_DIVISION_IDS.length} divisions (${failed} failed)`);

  // Count total teams per division for "Nth of N" rank display
  const divTotals = {};
  for (const e of allEntries) {
    divTotals[e.divisionId] = (divTotals[e.divisionId] || 0) + 1;
  }

  // Build ladder map — ALL teams (not just Trinity) so opponent ranks show too
  const ladderMap = {};
  for (const e of allEntries) {
    ladderMap[e.id] = {
      teamId:       e.id,
      teamName:     e.name,
      divisionId:   e.divisionId,
      divisionName: e.divisionName,
      rank:         parseInt(e.rk, 10),
      totalTeams:   divTotals[e.divisionId] || 0,
      played:       parseInt(e.P,   10),
      wins:         parseInt(e.W,   10),
      losses:       parseInt(e.L,   10),
      draws:        parseInt(e.D,   10),
      points:       parseInt(e.PTS, 10),
      goalsFor:     parseInt(e.F,   10),
      goalsAgainst: parseInt(e.A,   10),
    };
  }

  const trinityCount = Object.values(ladderMap).filter(e => isTrinity(e.teamName)).length;

  const output = {
    fetchedAt:       new Date().toISOString(),
    totalEntries:    Object.keys(ladderMap).length,
    trinityEntries:  trinityCount,
    divisionsOk:     ok,
    divisionsFailed: failed,
    ladder:          ladderMap,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  console.log(`✅ Written ${Object.keys(ladderMap).length} teams (${trinityCount} Trinity) to public/ladder.json`);

  // Clear ladderStale flag in fixtures.json now that we've refreshed
  try {
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8'));
    fixtures.ladderStale = false;
    fs.writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
    console.log('✅ Cleared ladderStale flag in fixtures.json');
  } catch {}
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
