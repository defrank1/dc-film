/**
 * Headless-browser helper for the few sites that only work with JavaScript.
 * Puppeteer is loaded lazily so the plain-HTTP scrapers still run if Chrome
 * is missing.
 *
 * Set PUPPETEER_EXECUTABLE_PATH to use a system Chrome instead of the one
 * Puppeteer downloads.
 */
const { UA } = require('./lib');

async function withPage(fn) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1280, height: 1000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

module.exports = { withPage };
