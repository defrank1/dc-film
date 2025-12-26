const puppeteer = require('puppeteer');

async function testAngelikaPuppeteer() {
  console.log('Testing Angelika with Puppeteer...\n');

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

    // Set realistic browser headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate directly to homepage first to potentially set location cookie
    console.log('Navigating to Angelika DC homepage...');
    await page.goto('https://angelikafilmcenter.com/dc', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now navigate to showtimes page - try the /now-playing route
    console.log('Navigating to showtimes page...');
    await page.goto('https://angelikafilmcenter.com/dc/now-playing', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Scroll down the page to load all content (lazy loading)
    console.log('Scrolling to load all content...');
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

    console.log('Checking for cinema selector...');

    // Wait a bit for initial render
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if there's a cinema dropdown and select DC
    const hasCinemaSelector = await page.evaluate(() => {
      // Look for select dropdown or buttons
      const selectText = document.body.innerText;
      return selectText.includes('Select your cinema') || selectText.includes('select value is focused');
    });

    console.log('Has cinema selector:', hasCinemaSelector);

    if (hasCinemaSelector) {
      console.log('Looking for DC cinema option...');

      try {
        // First, try to find and click the select/dropdown to open it
        const dropdownOpened = await page.evaluate(() => {
          // Look for input, select, or button that might trigger the dropdown
          const inputs = Array.from(document.querySelectorAll('input, select, [role="combobox"], [role="button"]'));
          const dropdown = inputs.find(el => {
            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
            const placeholder = el.getAttribute('placeholder')?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            return ariaLabel.includes('cinema') || placeholder.includes('cinema') ||
                   ariaLabel.includes('select') || id.includes('select');
          });

          if (dropdown) {
            dropdown.click();
            dropdown.focus();
            return true;
          }
          return false;
        });

        if (dropdownOpened) {
          console.log('Opened dropdown, waiting for options to render...');

          // Try keyboard navigation - press ArrowDown to open menu
          await page.keyboard.press('ArrowDown');
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Debug: See what's in the DOM now
          const debugInfo = await page.evaluate(() => {
            // Look for menu/list containers that might hold cinema options
            const menuContainers = Array.from(document.querySelectorAll('[role="listbox"], [role="menu"], ul, .menu, .dropdown-menu, [class*="menu"], [class*="list"]'));

            // Get all elements that might be cinema options
            const allDivs = Array.from(document.querySelectorAll('div, li, a, button'));
            const cinemaLike = allDivs.filter(el => {
              const text = el.textContent?.toLowerCase() || '';
              return (text.includes('dc') || text.includes('union market') || text.includes('mosaic')) &&
                     text.length < 50; // Likely option text, not full page content
            }).slice(0, 10);

            return {
              menuContainerCount: menuContainers.length,
              cinemaLikeElements: cinemaLike.map(el => ({
                tag: el.tagName,
                text: el.textContent?.trim(),
                className: el.className
              }))
            };
          });

          console.log('After keyboard down:', JSON.stringify(debugInfo, null, 2));

          // Try to find and click DC cinema option
          const selected = await page.evaluate(() => {
            // Look more broadly for elements containing DC
            const allElements = Array.from(document.querySelectorAll('*'));
            const dcElement = allElements.find(el => {
              const text = el.textContent?.toLowerCase() || '';
              const isShortText = text.length < 100; // Not the whole page
              const hasDC = text.includes('dc') || text.includes('union market');
              const isClickable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
                                  el.tagName === 'LI' || el.tagName === 'DIV' ||
                                  el.getAttribute('role') === 'option';
              return hasDC && isShortText && isClickable;
            });

            if (dcElement) {
              dcElement.click();
              return { success: true, text: dcElement.textContent?.trim() };
            }
            return { success: false };
          });

          console.log('Selection result:', selected);

          if (selected.success) {
            console.log('Selected DC option, waiting for movies to load...');
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            console.log('Could not find DC option in dropdown');
          }
        } else {
          console.log('Could not find/open cinema dropdown');
        }
      } catch (e) {
        console.log('Error selecting cinema:', e.message);
      }
    }

    // Wait for content to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take a screenshot for debugging
    await page.screenshot({ path: 'angelika-debug.png', fullPage: true });
    console.log('Screenshot saved to angelika-debug.png');

    // Look for actual showtime content in the page
    const movieData = await page.evaluate(() => {
      const screenings = [];
      const bodyText = document.body.innerText;

      // Debug: Check if there's any showtime-related text
      const hasShowtimes = bodyText.toLowerCase().includes('showtime');
      const hasTimes = bodyText.match(/\d{1,2}:\d{2}\s*(AM|PM)/gi);

      // Look everywhere for time patterns with movie context
      const allElements = Array.from(document.querySelectorAll('*'));

      allElements.forEach(el => {
        const text = el.textContent || '';
        // Skip if too long (likely parent container with all content)
        if (text.length > 200) return;

        // Look for time patterns
        const timeMatch = text.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
        if (!timeMatch) return;

        // Try to find associated movie title
        let titleEl = el.closest('[class*="movie"]') || el.closest('tr') || el.closest('div');
        if (!titleEl) return;

        const titleText = titleEl.querySelector('h1, h2, h3, h4, h5, [class*="title"], strong, b');
        if (!titleText) return;

        const title = titleText.textContent?.trim();
        if (!title || title.length > 80) return;

        screenings.push({
          title,
          time: timeMatch[0],
          element: el.tagName,
          parentClass: titleEl.className
        });
      });

      return {
        screenings,
        hasShowtimes,
        timePatterns: hasTimes ? hasTimes.slice(0, 10) : [],
        bodyTextSample: bodyText.substring(0, 2000)
      };
    });

    console.log('\n=== Movie Data Analysis ===');
    console.log('Has showtimes text:', movieData.hasShowtimes);
    console.log('Time patterns found:', movieData.timePatterns);
    console.log('Found screenings:', movieData.screenings.length);
    if (movieData.screenings.length > 0) {
      console.log('\nFirst 5 screenings:');
      console.log(JSON.stringify(movieData.screenings.slice(0, 5), null, 2));
    }
    console.log('\nPage text sample:');
    console.log(movieData.bodyTextSample);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testAngelikaPuppeteer();
