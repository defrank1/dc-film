const puppeteer = require('puppeteer');

async function testAFIClick() {
  console.log('Testing AFI Silver calendar clicking...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to AFI Silver calendar...');
    await page.goto('https://silver.afi.com/calendar/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the month before clicking
    const monthBefore = await page.evaluate(() => {
      // Look for the calendar month header - it should contain text like "DECEMBER 2025"
      const allH2 = document.querySelectorAll('h2');
      for (const h2 of allH2) {
        const text = h2.textContent.trim();
        if (text.match(/[A-Z]+ \d{4}/)) { // Match "MONTH YEAR" pattern
          return text;
        }
      }
      return 'Not found';
    });
    console.log(`Month before click: ${monthBefore}`);

    // Take screenshot before
    await page.screenshot({ path: 'afi-before-click.png' });

    // Look for the right arrow (>) near the calendar
    // Based on the screenshot, it's near the "DECEMBER 2025" header
    const clickResult = await page.evaluate(() => {
      // Find all elements with > text
      const allElements = Array.from(document.querySelectorAll('*'));
      const arrowElements = allElements.filter(el => {
        const text = el.textContent?.trim();
        // Must be exactly ">" and not contain more text
        return text === '>' && el.children.length === 0;
      });

      if (arrowElements.length === 0) {
        return { success: false, message: 'No arrow elements found' };
      }

      // Click the first one (should be the calendar next button)
      arrowElements[0].click();
      return {
        success: true,
        message: `Clicked element: ${arrowElements[0].tagName}.${arrowElements[0].className}`,
        totalFound: arrowElements.length
      };
    });

    console.log('Click result:', clickResult);

    // Wait for the calendar to update
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the month after clicking
    const monthAfter = await page.evaluate(() => {
      // Look for the calendar month header - it should contain text like "DECEMBER 2025"
      const allH2 = document.querySelectorAll('h2');
      for (const h2 of allH2) {
        const text = h2.textContent.trim();
        if (text.match(/[A-Z]+ \d{4}/)) { // Match "MONTH YEAR" pattern
          return text;
        }
      }
      return 'Not found';
    });
    console.log(`Month after click: ${monthAfter}`);

    // Take screenshot after
    await page.screenshot({ path: 'afi-after-click.png' });
    console.log('Screenshots saved: afi-before-click.png, afi-after-click.png');

    if (monthBefore !== monthAfter) {
      console.log('\n✓ SUCCESS: Month changed from', monthBefore, 'to', monthAfter);
    } else {
      console.log('\n✗ FAILED: Month did not change');
    }

    // Keep browser open
    console.log('\nBrowser will stay open for 20 seconds...');
    await new Promise(resolve => setTimeout(resolve, 20000));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testAFIClick();
