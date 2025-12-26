const puppeteer = require('puppeteer');

async function testAFINavigation() {
  console.log('Testing AFI Silver calendar navigation...');

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
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

    // Wait a bit for JavaScript to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take a screenshot of initial state
    await page.screenshot({ path: 'afi-initial.png' });
    console.log('Screenshot saved: afi-initial.png');

    // Try to find all possible navigation button selectors
    const selectors = await page.evaluate(() => {
      const results = [];

      // Look for buttons with "next" or arrow text/classes
      const allButtons = document.querySelectorAll('button, a, div, span');
      allButtons.forEach((btn, index) => {
        const classes = btn.className || '';
        const text = btn.textContent?.trim() || '';
        const onclick = btn.getAttribute('onclick') || '';

        // Look for simple arrows or navigation indicators
        if (text === '>' || text === '<' ||
            text.includes('›') || text.includes('‹') ||
            text.includes('»') || text.includes('«') ||
            classes.includes('next') ||
            classes.includes('prev') ||
            classes.includes('arrow') ||
            onclick.includes('next') ||
            onclick.includes('prev')) {
          results.push({
            index,
            tag: btn.tagName,
            classes: classes,
            text: text,
            onclick: onclick.substring(0, 100),
            id: btn.id,
            role: btn.getAttribute('role')
          });
        }
      });

      return results;
    });

    console.log('\nFound potential navigation buttons:');
    console.log(JSON.stringify(selectors, null, 2));

    // Try to find the calendar header/navigation area
    const calendarNav = await page.evaluate(() => {
      const navElements = [];

      // Look for calendar-related navigation
      const possibleNavs = document.querySelectorAll('.calendar-nav, .calendar-header, [class*="calendar"][class*="nav"], [class*="nav"][class*="month"]');
      possibleNavs.forEach((nav, index) => {
        navElements.push({
          index,
          tag: nav.tagName,
          classes: nav.className,
          innerHTML: nav.innerHTML.substring(0, 200)
        });
      });

      return navElements;
    });

    console.log('\nFound calendar navigation elements:');
    console.log(JSON.stringify(calendarNav, null, 2));

    // Get the current month display
    const currentMonth = await page.evaluate(() => {
      const monthElement = document.querySelector('.calendar-month, [class*="month"], h2');
      return monthElement ? monthElement.textContent.trim() : 'Not found';
    });

    console.log(`\nCurrent month displayed: ${currentMonth}`);

    // Try common selector patterns for next button
    const selectorTests = [
      '.calendar-nav-next',
      '.calendar-next',
      '.next-month',
      'button.next',
      '[aria-label*="next"]',
      '[aria-label*="Next"]',
      '.fc-next-button',
      '.fc-button-next'
    ];

    console.log('\nTesting selectors:');
    for (const selector of selectorTests) {
      const exists = await page.evaluate((sel) => {
        return document.querySelector(sel) !== null;
      }, selector);
      console.log(`  ${selector}: ${exists ? 'FOUND' : 'not found'}`);
    }

    // Keep browser open for manual inspection
    console.log('\nBrowser will stay open for 30 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testAFINavigation();
