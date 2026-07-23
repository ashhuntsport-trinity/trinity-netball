const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURE_PAGE =
  'https://registration.netballconnect.com/livescoreSeasonFixture?organisationKey=ab63c5b3-fd1a-41a6-a1a2-326989b20247&competitionUniqueKey=3023e0a7-dbcf-4f0f-a7ce-350e61da84d6&yearId=8&divisionId=All';

const OUTFILE = path.join(
  __dirname,
  '..',
  'public',
  'fixtures.json'
);

(async () => {
  let fixtureData = null;

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  page.on('response', async (response) => {
    try {
      const url = response.url();

      // Debug: print all Squadi calls
      if (url.includes('api-netball.squadi.com')) {
        console.log(url);
      }

      // Capture fixtures endpoint
      if (
        url.includes('/livescores/round/matches') &&
        !fixtureData
      ) {
        console.log('Fixtures endpoint found');
        console.log(url);

        fixtureData = await response.json();
      }
    } catch (err) {
      console.log('Response parse error:', err.message);
    }
  });

  await page.goto(FIXTURE_PAGE, {
    waitUntil: 'networkidle',
    timeout: 120000
  });

  await page.waitForTimeout(5000);

  await browser.close();

  if (!fixtureData) {
    throw new Error('No fixture JSON captured');
  }

  fs.writeFileSync(
    OUTFILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        data: fixtureData
      },
      null,
      2
    )
  );

  console.log(`Saved fixtures to ${OUTFILE}`);
})();