const puppeteer = require('puppeteer');

async function scrapeAngelikaPuppeteer() {
  console.log('Scraping Angelika Pop-Up with Puppeteer...');

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

    // Navigate to DC homepage first, then to now-playing
    console.log('Navigating to Angelika DC...');
    await page.goto('https://angelikafilmcenter.com/dc', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.goto('https://angelikafilmcenter.com/dc/now-playing', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Scroll to load all content
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

    // Extract screenings
    const screenings = await page.evaluate(() => {
      const results = [];
      const seen = new Set(); // Track duplicates

      // Find all time buttons/links
      const timeElements = Array.from(document.querySelectorAll('a, button, div')).filter(el => {
        const text = el.textContent?.trim() || '';
        return text.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i);
      });

      timeElements.forEach(timeEl => {
        const time = timeEl.textContent?.trim();
        if (!time) return;

        // Find the movie container (go up the DOM tree)
        let movieContainer = timeEl.closest('[class*="movie-details"]') ||
                           timeEl.closest('.movie-item') ||
                           timeEl.closest('[class*="film"]');

        if (!movieContainer) return;

        // Extract movie title
        const titleEl = movieContainer.querySelector('h1, h2, h3, h4, [class*="title"]');
        if (!titleEl) return;

        const title = titleEl.textContent?.trim();
        if (!title || title.length > 100) return;

        // Extract date
        let date = null;
        const dateEl = movieContainer.querySelector('[class*="date"]') ||
                      document.querySelector('[class*="selected-date"]');
        if (dateEl) {
          const dateText = dateEl.textContent?.trim();
          const dateMatch = dateText?.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
          if (dateMatch) {
            // Convert "December 22, 2025" to "2025-12-22"
            const months = {Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                          Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
                          January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
                          July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'};
            const month = months[dateMatch[1]];
            const day = dateMatch[2].padStart(2, '0');
            const year = dateMatch[3];
            if (month) {
              date = `${year}-${month}-${day}`;
            }
          }
        }

        // If no date found, use today's date
        if (!date) {
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, '0');
          const day = String(today.getDate()).padStart(2, '0');
          date = `${year}-${month}-${day}`;
        }

        // Extract ticket link
        const ticketLink = timeEl.href || timeEl.closest('a')?.href || null;

        // Extract poster
        const posterImg = movieContainer.querySelector('img');
        const poster = posterImg?.src || posterImg?.getAttribute('data-src') || null;

        // Create unique key to avoid duplicates
        const key = `${title}-${date}-${time}`;
        if (seen.has(key)) return;
        seen.add(key);

        // Convert time to 24-hour format
        const timeMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = timeMatch[2];
          const period = timeMatch[3].toUpperCase();

          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;

          const time24 = `${String(hours).padStart(2, '0')}:${minutes}`;

          results.push({
            title,
            venue: 'Angelika Pop-Up at Union Market',
            date,
            time: time24,
            poster,
            ticketLink
          });
        }
      });

      return results;
    });

    console.log(`Found ${screenings.length} screenings at Angelika Pop-Up`);
    return screenings;

  } catch (error) {
    console.error('Error scraping Angelika:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

// Test if run directly
if (require.main === module) {
  scrapeAngelikaPuppeteer().then(screenings => {
    console.log('\nScreenings:');
    console.log(JSON.stringify(screenings, null, 2));
  });
}

module.exports = scrapeAngelikaPuppeteer;
