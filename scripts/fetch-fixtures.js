/**
 * fetch-fixtures.js
 * Fetches all Trinity fixtures from the Squadi API and writes public/fixtures.json
 * Runs inside GitHub Actions (browser-like Node fetch, residential-equivalent IP)
 */

const fs   = require('fs');
const path = require('path');

const COMPETITION_ID  = 5224;
const COMPETITION_KEY = '3023e0a7-dbcf-4f0f-a7ce-350e61da84d6';
const API_KEY         = process.env.SQUADI_API_KEY || '';
const SQUADI_BASE     = 'https://api-netball.squadi.com';
const OUT_FILE        = path.join(__dirname, '..', 'public', 'fixtures.json');

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

function shortDiv(d) {
  return d
    .replace(/\(Femals and Males\)|\(Females & Males\)/g, '')
    .replace(/\(Males 13\/U.*?participate\)/g, '')
    .replace(/restrictions apply|- no restrictions/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAEST(isoString) {
  if (!isoString) return { dateStr: '', timeStr: '' };
  const d = new Date(new Date(isoString).getTime() + 10 * 3600_000);
  const dateStr = d.toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  const timeStr = d.toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
  });
  return { dateStr, timeStr };
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`  Attempt ${i + 1} failed: ${err.message}`);
      if (i < retries - 1) {
        const wait = (i + 1) * 2000;
        console.log(`  Retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  console.log('Fetching fixtures from Squadi...');
  console.log(`  API key present: ${!!API_KEY}, length: ${API_KEY.length}`);

  const url = `${SQUADI_BASE}/livescores/round/matches`
    + `?competitionId=${COMPETITION_ID}&divisionId=&teamIds=&ignoreStatuses=%5B1%5D`;

  const raw = await fetchWithRetry(url);
  const rounds = Array.isArray(raw) ? raw : (raw.rounds || [raw]);

  const trinityMatches = [];

  for (const round of rounds) {
    const roundName = round.name || '';
    const roundSeq  = round.sequence ?? 0;
    const divName   = round.division?.name || '';

    for (const m of (round.matches || [])) {
      const t1 = m.team1?.name || '';
      const t2 = m.team2?.name || '';
      if (!isTrinity(t1) && !isTrinity(t2)) continue;

      const t1t = isTrinity(t1);
      const t1s = m.team1Score ?? 0;
      const t2s = m.team2Score ?? 0;
      const status = m.matchStatus || '';

      let result;
      if (status === 'STARTED') result = 'LIVE';
      else if (status === 'ENDED') {
        const ts = t1t ? t1s : t2s;
        const os = t1t ? t2s : t1s;
        result = ts > os ? 'WIN' : ts < os ? 'LOSS' : 'DRAW';
      } else {
        result = 'UPCOMING';
      }

      const { dateStr, timeStr } = toAEST(m.startTime);
      const courtRaw = m.venueCourt?.name || '';
      const courtNum = courtRaw.replace(/Court\s*/i, '').trim();

      trinityMatches.push({
        id:          m.id,
        round:       roundName,
        round_seq:   roundSeq,
        division:    divName,
        div_short:   shortDiv(divName),
        start:       m.startTime || '',
        date_str:    dateStr,
        time_str:    timeStr,
        team1:       t1,
        team2:       t2,
        team1Id:     m.team1?.id || null,
        team2Id:     m.team2?.id || null,
        team1Score:  t1s,
        team2Score:  t2s,
        matchStatus: status,
        result,
        court:       courtNum ? `Court ${courtNum}` : courtRaw,
      });
    }
  }

  // Load existing file to detect newly completed matches (for ladder invalidation signal)
  let prevEndedIds = new Set();
  if (fs.existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      prevEndedIds = new Set(
        (prev.matches || [])
          .filter(m => m.result !== 'UPCOMING' && m.result !== 'LIVE')
          .map(m => m.id)
      );
    } catch {}
  }

  const newlyCompleted = trinityMatches.filter(
    m => ['WIN','LOSS','DRAW'].includes(m.result) && !prevEndedIds.has(m.id)
  );

  const output = {
    fetchedAt:        new Date().toISOString(),
    totalMatches:     trinityMatches.length,
    newlyCompleted:   newlyCompleted.length,
    ladderStale:      newlyCompleted.length > 0,   // signal to fetch-ladder.js
    matches:          trinityMatches,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  console.log(`✅ Written ${trinityMatches.length} Trinity matches to public/fixtures.json`);
  if (newlyCompleted.length > 0) {
    console.log(`🏁 ${newlyCompleted.length} newly completed match(es) — ladder will refresh`);
  }

  // Exit with code 2 if ladder needs refreshing (workflow uses this to decide)
  process.exit(newlyCompleted.length > 0 ? 2 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
