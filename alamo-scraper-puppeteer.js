const puppeteer = require('puppeteer');

async function scrapeAlamoPuppeteer() {
  console.log('Scraping Alamo Drafthouse Bryant St with Puppeteer...');

  const browser = await puppeteer.launch({
    headless: false, // Run with visible browser to let JavaScript execute
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

    await page.goto('https://drafthouse.com/dc/film', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for the app to load - look for any movie-related content
    console.log('Waiting for content to load...');
    try {
      await page.waitForSelector('a[href*="/session/"], a[class*="ShowtimeButton"], button[class*="showtime"], [class*="film-"], [class*="movie-"]', {
        timeout: 30000
      });
    } catch (e) {
      console.log('Timeout waiting for movie elements, trying fallback selectors...');
    }

    // Extra wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll to load all movies
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

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Debug: Check what's on the page
    const pageContent = await page.evaluate(() => {
      return {
        bodyText: document.body.textContent.substring(0, 500),
        allClasses: Array.from(document.querySelectorAll('[class]')).slice(0, 20).map(el => el.className)
      };
    });
    console.log('Page sample:', pageContent);

    const screenings = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Alamo Drafthouse shows movie cards with session times
      // Try multiple selectors
      const movieCards = document.querySelectorAll('[class*="FilmCard"], [class*="filmCard"], [class*="movie-card"], .film-card, [class*="Film"], article, [data-film], [class*="card"]');

      console.log('Found', movieCards.length, 'potential movie cards');

      movieCards.forEach(card => {
        // Get movie title
        const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]');
        const title = titleEl?.textContent?.trim();

        if (!title || title.length > 100) return;

        // Get poster
        const posterImg = card.querySelector('img');
        const poster = posterImg?.src || null;

        // Get session times
        const sessionLinks = card.querySelectorAll('a[href*="/session/"], a[class*="session"], button[class*="session"]');

        sessionLinks.forEach(session => {
          const timeText = session.textContent?.trim();
          const link = session.href || null;

          // Look for time pattern
          const timeMatch = timeText?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
          if (!timeMatch) return;

          let hours = parseInt(timeMatch[1]);
          const minutes = timeMatch[2];
          const period = timeMatch[3]?.toUpperCase();

          if (period) {
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
          } else {
            // Assume PM for times < 10, AM for 10-11
            if (hours < 10) hours += 12;
          }

          const time24 = `${String(hours).padStart(2, '0')}:${minutes}`;

          // Get date (usually today or look for date context)
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, '0');
          const day = String(today.getDate()).padStart(2, '0');
          const date = `${year}-${month}-${day}`;

          const key = `${title}-${date}-${time24}`;
          if (seen.has(key)) return;
          seen.add(key);

          results.push({
            title,
            venue: 'Alamo Drafthouse Bryant St',
            date,
            time: time24,
            poster,
            ticketLink: link
          });
        });
      });

      return results;
    });

    console.log(`Found ${screenings.length} screenings at Alamo Drafthouse Bryant St`);
    return screenings;

  } catch (error) {
    console.error('Error scraping Alamo Drafthouse:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

// Test if run directly
if (require.main === module) {
  scrapeAlamoPuppeteer().then(screenings => {
    console.log('\nScreenings:');
    console.log(JSON.stringify(screenings, null, 2));
  });
}

module.exports = scrapeAlamoPuppeteer;
