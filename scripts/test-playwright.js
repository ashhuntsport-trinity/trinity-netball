const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto(
    'https://registration.netballconnect.com/livescoreSeasonFixture?organisationKey=ab63c5b3-fd1a-41a6-a1a2-326989b20247&competitionUniqueKey=3023e0a7-dbcf-4f0f-a7ce-350e61da84d6&yearId=8&divisionId=All',
    { waitUntil: 'networkidle' }
  );

  console.log(await page.title());

  await browser.close();
})();