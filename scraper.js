const axios = require('axios');
const cheerio = require('cheerio');
const ical = require('node-ical');
const fs = require('fs').promises;
const path = require('path');

/**
 * DC Film Screenings Scraper
 * Fetches screening data from DC independent theaters and updates screenings.json
 */

// Theater websites
const THEATERS = {
  AFI_SILVER: 'https://silver.afi.com/calendar/',
  SUNS_CINEMA: 'https://sunscinema.com/',
  ANGELIKA: 'https://angelikafilmcenter.com/dc/showtimes-and-tickets/now-playing',
  MIRACLE: 'https://themiracletheatre.com/',
  AVALON: 'https://www.theavalon.org/'
};

/**
 * Scrape AFI Silver Theatre
 * Note: This requires inspecting their actual HTML structure
 */
async function scrapeAFISilver() {
  console.log('Scraping AFI Silver...');
  try {
    const response = await axios.get(THEATERS.AFI_SILVER);
    const $ = cheerio.load(response.data);
    const screenings = [];

    // TODO: Inspect AFI Silver's HTML structure and parse accordingly
    // Example structure (needs to be verified):
    // $('.screening-item').each((i, elem) => {
    //   const title = $(elem).find('.title').text().trim();
    //   const date = $(elem).find('.date').text().trim();
    //   const time = $(elem).find('.time').text().trim();
    //   const link = $(elem).find('a').attr('href');
    //
    //   screenings.push({
    //     title,
    //     venue: 'AFI Silver',
    //     date: formatDate(date),
    //     time: formatTime(time),
    //     poster: null,
    //     ticketLink: link
    //   });
    // });

    console.log(`Found ${screenings.length} screenings at AFI Silver`);
    return screenings;
  } catch (error) {
    console.error('Error scraping AFI Silver:', error.message);
    return [];
  }
}

/**
 * Scrape Suns Cinema
 */
async function scrapeSunsCinema() {
  console.log('Scraping Suns Cinema...');
  try {
    const response = await axios.get(THEATERS.SUNS_CINEMA);
    const $ = cheerio.load(response.data);
    const screenings = [];

    // TODO: Inspect Suns Cinema's HTML structure

    console.log(`Found ${screenings.length} screenings at Suns Cinema`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Suns Cinema:', error.message);
    return [];
  }
}

/**
 * Scrape Angelika Pop Up
 */
async function scrapeAngelika() {
  console.log('Scraping Angelika Pop Up...');
  try {
    const response = await axios.get(THEATERS.ANGELIKA);
    const $ = cheerio.load(response.data);
    const screenings = [];

    // TODO: Inspect Angelika's HTML structure

    console.log(`Found ${screenings.length} screenings at Angelika Pop Up`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Angelika:', error.message);
    return [];
  }
}

/**
 * Scrape Miracle Theater
 */
async function scrapeMiracleTheater() {
  console.log('Scraping Miracle Theater...');
  try {
    const response = await axios.get(THEATERS.MIRACLE);
    const $ = cheerio.load(response.data);
    const screenings = [];

    // TODO: Inspect Miracle Theater's HTML structure

    console.log(`Found ${screenings.length} screenings at Miracle Theater`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Miracle Theater:', error.message);
    return [];
  }
}

/**
 * Scrape Avalon Theater
 */
async function scrapeAvalonTheater() {
  console.log('Scraping Avalon Theater...');
  try {
    const response = await axios.get(THEATERS.AVALON);
    const $ = cheerio.load(response.data);
    const screenings = [];

    // TODO: Inspect Avalon Theater's HTML structure

    console.log(`Found ${screenings.length} screenings at Avalon Theater`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Avalon Theater:', error.message);
    return [];
  }
}

/**
 * Helper: Format date to YYYY-MM-DD
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

/**
 * Helper: Format time to HH:MM
 */
function formatTime(timeString) {
  // Parse various time formats and return HH:MM
  // This needs to be adapted based on actual theater formats
  return timeString;
}

/**
 * Helper: Fetch poster from TMDB (optional)
 */
async function fetchPoster(movieTitle) {
  // TODO: Implement TMDB API integration if you want automatic posters
  // For now, return null
  return null;
}

/**
 * Main scraper function
 */
async function scrapeAllTheaters() {
  console.log('Starting scraper...');
  console.log('===================\n');

  const allScreenings = [];

  // Scrape all theaters
  const results = await Promise.allSettled([
    scrapeAFISilver(),
    scrapeSunsCinema(),
    scrapeAngelika(),
    scrapeMiracleTheater(),
    scrapeAvalonTheater()
  ]);

  // Collect all successful results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allScreenings.push(...result.value);
    }
  });

  // Sort by date and time
  allScreenings.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.time.localeCompare(b.time);
  });

  // Create output data
  const outputData = {
    lastUpdated: new Date().toISOString(),
    screenings: allScreenings
  };

  // Write to file
  const outputPath = path.join(__dirname, 'data', 'screenings.json');
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));

  console.log('\n===================');
  console.log(`Scraping complete! Found ${allScreenings.length} total screenings`);
  console.log(`Data saved to ${outputPath}`);
  console.log(`Last updated: ${outputData.lastUpdated}`);
}

// Run the scraper
scrapeAllTheaters().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
