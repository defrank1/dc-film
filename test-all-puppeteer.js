const puppeteer = require('puppeteer');

async function testTheater(name, url, extractFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const data = await extractFn(page);
    console.log('\nResults:');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

async function testAll() {
  // Test Avalon Theater
  await testTheater(
    'Avalon Theater',
    'https://www.theavalon.org/',
    async (page) => {
      return await page.evaluate(() => {
        const screenings = [];
        const showtimeItems = document.querySelectorAll('ul.showtimes li, .showtimes li');

        showtimeItems.forEach(item => {
          const titleLink = item.querySelector('a');
          const title = titleLink?.textContent?.trim();
          const link = titleLink?.href;

          const times = [];
          const timeElements = item.querySelectorAll('.times span, .times a');
          timeElements.forEach(timeEl => {
            const time = timeEl.textContent?.trim();
            if (time && time.match(/\d{1,2}:\d{2}/)) {
              times.push(time);
            }
          });

          if (title && times.length > 0) {
            screenings.push({ title, times, link });
          }
        });

        return {
          count: screenings.length,
          sample: screenings.slice(0, 3),
          bodyPreview: document.body.innerText.substring(0, 500)
        };
      });
    }
  );

  // Test Alamo Drafthouse
  await testTheater(
    'Alamo Drafthouse Bryant St',
    'https://drafthouse.com/dc',
    async (page) => {
      // Scroll to load content
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if(totalHeight >= scrollHeight){
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      return await page.evaluate(() => {
        const movies = [];

        // Look for movie elements
        const movieElements = document.querySelectorAll('[class*="movie"], [class*="film"], [class*="session"], [class*="show"]');

        movieElements.forEach((el, i) => {
          if (i < 5) { // Just check first 5
            const title = el.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent?.trim();
            const time = el.querySelector('[class*="time"]')?.textContent?.trim();

            if (title || time) {
              movies.push({
                title: title || 'No title',
                time: time || 'No time',
                className: el.className
              });
            }
          }
        });

        return {
          moviesFound: movies.length,
          sample: movies.slice(0, 3),
          bodyPreview: document.body.innerText.substring(0, 800)
        };
      });
    }
  );

  // Test National Gallery of Art
  await testTheater(
    'National Gallery of Art',
    'https://www.nga.gov/calendar?type%5B103026%5D=103026&visit_start=2025-03-26&tab=all',
    async (page) => {
      return await page.evaluate(() => {
        const events = [];

        // Look for event items
        const eventElements = document.querySelectorAll('[class*="event"], [class*="calendar"], article, .item');

        eventElements.forEach((el, i) => {
          if (i < 5) {
            const title = el.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent?.trim();
            const date = el.querySelector('[class*="date"], time')?.textContent?.trim();

            if (title || date) {
              events.push({
                title: title || 'No title',
                date: date || 'No date',
                className: el.className
              });
            }
          }
        });

        return {
          eventsFound: events.length,
          sample: events.slice(0, 3),
          bodyPreview: document.body.innerText.substring(0, 800)
        };
      });
    }
  );
}

testAll().then(() => {
  console.log('\n' + '='.repeat(60));
  console.log('All tests complete');
  console.log('='.repeat(60));
});
