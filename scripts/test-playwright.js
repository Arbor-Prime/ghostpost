const { chromium } = require('playwright');

async function test() {
    console.log('Testing Playwright + Chromium...\n');

    console.log('Launching headless browser...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Navigating to https://x.com...');
    await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    var title = await page.title();
    console.log('Page title: ' + title);

    await page.screenshot({ path: '/opt/ghostpost/data/test-screenshot.png' });
    console.log('Screenshot saved: /opt/ghostpost/data/test-screenshot.png');

    await browser.close();
    console.log('\nPASSED: Playwright + Chromium');
}

test().catch(function(e) { console.error('FAILED: ' + e.message); process.exit(1); });
