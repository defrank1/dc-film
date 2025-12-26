const puppeteer = require('puppeteer');

async function findMonthElement() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://silver.afi.com/calendar/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Find all text nodes that contain the month
    const monthInfo = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const monthElements = [];

      allElements.forEach(el => {
        const text = el.textContent?.trim();
        // Look for "MONTH YEAR" pattern like "DECEMBER 2025"
        if (text && text.match(/^[A-Z]+ \d{4}$/)) {
          monthElements.push({
            tag: el.tagName,
            className: el.className,
            id: el.id,
            text: text,
            parent: el.parentElement?.tagName,
            parentClass: el.parentElement?.className
          });
        }
      });

      return monthElements;
    });

    console.log('Found month elements:');
    console.log(JSON.stringify(monthInfo, null, 2));

    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

findMonthElement();
