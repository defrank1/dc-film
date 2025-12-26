const puppeteer = require('puppeteer');

async function scrapeAvalonPuppeteer() {
  console.log('Scraping Avalon Theater with Puppeteer...');

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

    await page.goto('https://www.theavalon.org/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const screenings = await page.evaluate(() => {
      const results = [];
      const showtimeItems = document.querySelectorAll('ul.showtimes li, .showtimes li');

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayDate = `${year}-${month}-${day}`;

      showtimeItems.forEach(item => {
        const titleLink = item.querySelector('a');
        const title = titleLink?.textContent?.trim();
        const link = titleLink?.href;

        // Get poster image if available
        const posterImg = item.querySelector('img');
        const poster = posterImg?.src || null;

        // Get all times
        const timeElements = item.querySelectorAll('.times span, .times a');
        timeElements.forEach(timeEl => {
          const timeText = timeEl.textContent?.trim();

          if (timeText && timeText.match(/^\d{1,2}:\d{2}$/)) {
            // Convert to 24-hour format
            let time24 = timeText;
            const parts = timeText.split(':');
            let hours = parseInt(parts[0]);
            const minutes = parts[1];

            // Assume PM for times before noon (common for evening screenings)
            // Assume AM for times 10-11 (matinees)
            if (hours < 10 && hours >= 1) {
              hours += 12; // PM
            }

            time24 = `${String(hours).padStart(2, '0')}:${minutes}`;

            results.push({
              title,
              venue: 'Avalon Theater',
              date: todayDate,
              time: time24,
              poster,
              ticketLink: link
            });
          }
        });
      });

      return results;
    });

    console.log(`Found ${screenings.length} screenings at Avalon Theater`);
    return screenings;

  } catch (error) {
    console.error('Error scraping Avalon:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

// Test if run directly
if (require.main === module) {
  scrapeAvalonPuppeteer().then(screenings => {
    console.log('\nScreenings:');
    console.log(JSON.stringify(screenings, null, 2));
  });
}

module.exports = scrapeAvalonPuppeteer;
