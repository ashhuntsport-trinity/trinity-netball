const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORG_KEY  = 'ab63c5b3-fd1a-41a6-a1a2-326989b20247';
const COMP_KEY = '3023e0a7-dbcf-4f0f-a7ce-350e61da84d6';
const YEAR_ID  = 8;

// Public API that lists every division in the competition (id + name).
// Division IDs shift a bit from season to season / when grades are
// reshuffled, so we always resolve them fresh rather than hardcoding.
const DIVISION_LIST_API =
  `https://api-netball.squadi.com/livescores/division?competitionKey=${COMP_KEY}`;

const LADDER_PAGE = (divisionId) =>
  `https://registration.netballconnect.com/livescorePublicLadder?organisationKey=${ORG_KEY}&competitionUniqueKey=${COMP_KEY}&yearId=${YEAR_ID}&divisionId=${divisionId}`;

const FIXTURES_FILE = path.join(__dirname, '..', 'public', 'fixtures.json');
const OUTFILE        = path.join(__dirname, '..', 'public', 'ladder.json');

function isTrinity(name) {
  return typeof name === 'string' && name.toLowerCase().includes('trinity');
}

// Figure out which division IDs Trinity actually has a team in.
// Preferred source: the freshly-scraped fixtures.json (has team names
// per division, so it's always accurate for the current season).
// Fallback: every division in the competition (safe but slower).
async function resolveTrinityDivisionIds() {
  try {
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8'));
    const rounds = fixtures?.data?.rounds || [];
    const ids = new Set();

    for (const round of rounds) {
      for (const m of (round.matches || [])) {
        const t1 = m.team1?.name || '';
        const t2 = m.team2?.name || '';
        if (isTrinity(t1) || isTrinity(t2)) {
          ids.add(round.divisionId);
        }
      }
    }

    if (ids.size) {
      console.log(`Resolved ${ids.size} Trinity division(s) from fixtures.json`);
      return [...ids];
    }
  } catch (err) {
    console.log('Could not read fixtures.json to resolve divisions:', err.message);
  }

  console.log('Falling back to full division list from Squadi API…');
  const res = await fetch(DIVISION_LIST_API);
  if (!res.ok) throw new Error(`Division list fetch failed: ${res.status}`);
  const divisions = await res.json();
  return divisions.map((d) => d.id);
}

async function scrapeLadderForDivision(browser, divisionId) {
  const page = await browser.newPage();
  let ladderData = null;

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes('/livescores/teams/ladder/v2') && !ladderData) {
        ladderData = await response.json();
      }
    } catch (err) {
      console.log(`Response parse error (division ${divisionId}):`, err.message);
    }
  });

  try {
    await page.goto(LADDER_PAGE(divisionId), {
      waitUntil: 'networkidle',
      timeout: 120000
    });
    await page.waitForTimeout(4000);
  } catch (err) {
    console.log(`Navigation error for division ${divisionId}:`, err.message);
  } finally {
    await page.close();
  }

  if (!ladderData) {
    console.log(`⚠ No ladder captured for division ${divisionId}`);
    return [];
  }

  return ladderData.ladders || ladderData.data?.ladders || [];
}

(async () => {
  const divisionIds = await resolveTrinityDivisionIds();
  console.log('Scraping ladders for divisions:', divisionIds);

  const browser = await chromium.launch({ headless: true });

  const mergedById = new Map();

  for (const divisionId of divisionIds) {
    console.log(`Fetching ladder for division ${divisionId}…`);
    const entries = await scrapeLadderForDivision(browser, divisionId);
    for (const e of entries) {
      mergedById.set(e.id, e);
    }
    console.log(`  → ${entries.length} team(s)`);
  }

  await browser.close();

  const ladders = [...mergedById.values()];

  if (!ladders.length) {
    throw new Error('No ladder data captured for any division');
  }

  fs.writeFileSync(
    OUTFILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        data: { ladders }
      },
      null,
      2
    )
  );

  console.log(`Saved ${ladders.length} ladder entries across ${divisionIds.length} division(s) to ${OUTFILE}`);
})();
