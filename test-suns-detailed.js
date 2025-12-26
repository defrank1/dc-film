const puppeteer = require('puppeteer');

async function testSunsDetailed() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://sunscinema.com/upcoming-films-3/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract all show information
    const shows = await page.evaluate(() => {
      const showElements = document.querySelectorAll('.show-details');
      const results = [];

      showElements.forEach(show => {
        const titleEl = show.querySelector('.show-title a.title');
        const title = titleEl ? titleEl.textContent.trim() : null;

        // Get all show dates
        const dateElements = show.querySelectorAll('.show-date');
        const dates = [];
        dateElements.forEach(dateEl => {
          const dateText = dateEl.textContent.trim();
          if (dateText) {
            dates.push(dateText);
          }
        });

        if (title) {
          results.push({ title, dateCount: dates.length, dates: dates.slice(0, 3) });
        }
      });

      return results;
    });

    console.log(`Found ${shows.length} total shows`);
    console.log('\nFirst 10 shows:');
    shows.slice(0, 10).forEach((show, i) => {
      console.log(`${i + 1}. ${show.title}: ${show.dateCount} dates - [${show.dates.join(', ')}]`);
    });

    const showsWithDates = shows.filter(s => s.dateCount > 0);
    console.log(`\n${showsWithDates.length} shows have dates`);
    console.log(`${shows.length - showsWithDates.length} shows have no dates`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

testSunsDetailed();
