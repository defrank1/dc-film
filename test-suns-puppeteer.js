const puppeteer = require('puppeteer');

async function testSunsUpcoming() {
  console.log('Testing Suns Cinema upcoming page with Puppeteer...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 2000 }); // Tall viewport to see more

    console.log('Navigating to Suns upcoming films page...');
    await page.goto('https://sunscinema.com/upcoming-films-3/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take a screenshot
    await page.screenshot({ path: 'suns-upcoming.png', fullPage: true });
    console.log('Screenshot saved: suns-upcoming.png');

    // Count how many shows are visible
    const showCount = await page.evaluate(() => {
      return document.querySelectorAll('.show-details').length;
    });

    console.log(`Found ${showCount} .show-details elements`);

    // Extract all show information
    const shows = await page.evaluate(() => {
      const showElements = document.querySelectorAll('.show-details');
      const results = [];

      showElements.forEach((show, index) => {
        const titleEl = show.querySelector('.show-title a.title');
        const title = titleEl ? titleEl.textContent.trim() : 'No title';
        const link = titleEl ? titleEl.getAttribute('href') : '';

        // Try multiple selectors for date
        let whenText = 'No date';
        const whenEl = show.querySelector('.show-when');
        if (whenEl) {
          whenText = whenEl.textContent.trim();
        }

        // Also check for date-selector elements (might be loaded dynamically)
        const dateSelectors = show.querySelectorAll('[class*="date"]');
        const dateInfo = [];
        dateSelectors.forEach(ds => {
          if (ds.textContent.trim()) {
            dateInfo.push({
              class: ds.className,
              text: ds.textContent.trim()
            });
          }
        });

        const posterEl = show.querySelector('.show-poster img');
        const poster = posterEl ? posterEl.getAttribute('src') : '';

        // Get the full HTML of the show element to debug
        const innerHTML = show.innerHTML.substring(0, 500);

        results.push({
          index,
          title,
          whenText,
          dateInfo,
          link,
          poster: poster ? poster.substring(0, 50) + '...' : 'No poster',
          innerHTML: innerHTML + '...'
        });
      });

      return results;
    });

    console.log('\nShows found:');
    console.log(JSON.stringify(shows, null, 2));

    // Keep browser open for inspection
    console.log('\nBrowser will stay open for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testSunsUpcoming();
