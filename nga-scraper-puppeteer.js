const puppeteer = require('puppeteer');

async function scrapeNGAPuppeteer() {
  console.log('Scraping National Gallery of Art with Puppeteer...');

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

    // Use current date for the start parameter
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateParam = `${year}-${month}-${day}`;

    const url = `https://www.nga.gov/calendar?type%5B103026%5D=103026&visit_start=${dateParam}&tab=all`;

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Debug: take screenshot and log page structure
    await page.screenshot({ path: 'nga-debug.png', fullPage: true });

    const debugInfo = await page.evaluate(() => {
      const eventItems = document.querySelectorAll('.c-events-calendar__item, .o-event, article, [class*="event"]');
      return {
        eventItemsFound: eventItems.length,
        bodyPreview: document.body.innerText.substring(0, 1000),
        firstEventHTML: eventItems[0]?.outerHTML?.substring(0, 500)
      };
    });

    console.log('Debug info:', JSON.stringify(debugInfo, null, 2));

    const screenings = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Look for all elements with "FILMS" type badge
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n');

      let currentDate = null;
      let currentTitle = null;
      let currentTime = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check for date pattern (e.g., "December 27, 2025")
        const dateMatch = line.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
        if (dateMatch) {
          const months = {
            January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
            July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
          };
          const month = months[dateMatch[1]];
          const day = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          if (month) {
            currentDate = `${year}-${month}-${day}`;
          }
          continue;
        }

        // Check for "FILMS" indicator
        if (line === 'FILMS') {
          // Next non-empty line should be the title
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && nextLine !== 'FILM SERIES' && !nextLine.includes('Learn More')) {
              currentTitle = nextLine;
              i = j;
              break;
            }
          }
          continue;
        }

        // Check for time pattern (e.g., "2:00 p.m. – 3:45 p.m.")
        const timeMatch = line.match(/^(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
        if (timeMatch && currentTitle && currentDate) {
          let hours = parseInt(timeMatch[1]);
          const minutes = timeMatch[2];
          const period = timeMatch[3].toLowerCase();

          if (period.startsWith('p') && hours !== 12) hours += 12;
          if (period.startsWith('a') && hours === 12) hours = 0;

          currentTime = `${String(hours).padStart(2, '0')}:${minutes}`;

          // Create unique key
          const key = `${currentTitle}-${currentDate}-${currentTime}`;
          if (!seen.has(key)) {
            seen.add(key);

            results.push({
              title: currentTitle,
              venue: 'National Gallery of Art',
              date: currentDate,
              time: currentTime,
              poster: null,
              ticketLink: `https://www.nga.gov/calendar?type%5B103026%5D=103026`
            });
          }

          // Reset for next screening
          currentTitle = null;
          currentTime = null;
        }
      }

      return results;
    });

    console.log(`Found ${screenings.length} screenings at National Gallery of Art`);
    return screenings;

  } catch (error) {
    console.error('Error scraping NGA:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

// Test if run directly
if (require.main === module) {
  scrapeNGAPuppeteer().then(screenings => {
    console.log('\nScreenings:');
    console.log(JSON.stringify(screenings, null, 2));
  });
}

module.exports = scrapeNGAPuppeteer;
