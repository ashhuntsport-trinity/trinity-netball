const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LADDER_PAGE =
  'https://registration.netballconnect.com/livescorePublicLadder?organisationKey=ab63c5b3-fd1a-41a6-a1a2-326989b20247&competitionUniqueKey=3023e0a7-dbcf-4f0f-a7ce-350e61da84d6&yearId=8&divisionId=33355';

const OUTFILE = path.join(
  __dirname,
  '..',
  'public',
  'ladder.json'
);

(async () => {
  let captured = false;
  let ladderData = null;

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  page.on('response', async (response) => {
    try {
      const url = response.url();

      if (
        url.includes('/livescores/teams/ladder/v2') &&
        !captured
      ) {
        captured = true;

        console.log('Ladder endpoint found');
        console.log(url);

        ladderData = await response.json();
      }
    } catch (err) {
      console.log('Response parse error:', err.message);
    }
  });

  await page.goto(LADDER_PAGE, {
    waitUntil: 'networkidle',
    timeout: 120000
  });

  await page.waitForTimeout(5000);

  if (!ladderData) {
    throw new Error('No ladder JSON captured');
  }

  fs.writeFileSync(
    OUTFILE,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        data: ladderData
      },
      null,
      2
    )
  );

  console.log(`Saved ladder to ${OUTFILE}`);

  await browser.close();
})();