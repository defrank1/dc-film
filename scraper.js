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

// Load TMDB API key from package.json
const packageJson = require('./package.json');
const TMDB_API_KEY = packageJson.tmdbApiKey;

// Configure axios with timeout
axios.defaults.timeout = 15000; // 15 second timeout
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (compatible; DCFilmScraper/1.0)';

/**
 * TMDB API Helper Functions
 */

/**
 * Extract year from title if it's in format "TITLE (YYYY)"
 */
function extractYearFromTitle(title) {
  const match = title.match(/\((\d{4})\)\s*$/);
  return match ? match[1] : null;
}

/**
 * Clean title for TMDB search by removing year and extra formatting
 */
function cleanTitleForSearch(title) {
  // Remove year in parentheses at the end
  let cleanTitle = title.replace(/\s*\((\d{4})\)\s*$/, '');
  // Remove extra whitespace
  cleanTitle = cleanTitle.trim();
  return cleanTitle;
}

/**
 * Fetch movie data from TMDB API
 */
async function fetchMovieFromTMDB(title, existingYear = null) {
  // Skip if no API key configured
  if (!TMDB_API_KEY || TMDB_API_KEY === 'TMDB_API_KEY_PLACEHOLDER') {
    return null;
  }

  try {
    const cleanTitle = cleanTitleForSearch(title);

    // Search for the movie
    let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`;
    if (existingYear) {
      searchUrl += `&year=${existingYear}`;
    }

    const response = await axios.get(searchUrl, { timeout: 5000 });

    if (response.data.results && response.data.results.length > 0) {
      const movie = response.data.results[0];
      return {
        year: movie.release_date ? movie.release_date.substring(0, 4) : null,
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
      };
    }
  } catch (error) {
    console.error(`TMDB lookup failed for "${title}":`, error.message);
  }

  return null;
}

/**
 * Enrich screening with TMDB data (poster and year)
 */
async function enrichMovieData(screening) {
  const existingYear = extractYearFromTitle(screening.title);
  const tmdbData = await fetchMovieFromTMDB(screening.title, existingYear);

  if (tmdbData) {
    // Add poster if we don't have one
    if (!screening.poster && tmdbData.poster) {
      screening.poster = tmdbData.poster;
    }

    // Add year to title if not already present
    if (tmdbData.year && !existingYear) {
      screening.title = `${screening.title} (${tmdbData.year})`;
    }
  }

  return screening;
}

/**
 * Scrape AFI Silver Theatre
 * Note: This requires inspecting their actual HTML structure
 */
async function scrapeAFISilver() {
  console.log('Scraping AFI Silver...');
  try {
    const response = await axios.get(THEATERS.AFI_SILVER, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const html = response.data;
    const screenings = [];

    // Extract JavaScript data embedded in the page
    const showArrayMatch = html.match(/console\.log\("show_array:",\s*({.*?})\);/s);
    const movieArrayMatch = html.match(/console\.log\("movie_array:",\s*(\[.*?\])\);/s);

    if (!showArrayMatch || !movieArrayMatch) {
      console.log('Could not find show data in AFI Silver page');
      return screenings;
    }

    // Parse the JavaScript objects
    const showData = JSON.parse(showArrayMatch[1]);
    const movieData = JSON.parse(movieArrayMatch[1]);

    // Create a map of movie IDs to titles
    const movieMap = {};
    movieData.forEach(movie => {
      movieMap[movie.ID] = movie.Title;
    });

    // Process showtime data
    Object.entries(showData).forEach(([date, movies]) => {
      Object.entries(movies).forEach(([movieId, showtimes]) => {
        const title = movieMap[movieId];
        if (!title) return;

        showtimes.forEach(showtime => {
          const time = parseAFITime(showtime.time);
          if (time) {
            screenings.push({
              title: title,
              venue: 'AFI Silver',
              date: date,
              time: time,
              poster: null,
              ticketLink: `https://silver.afi.com/calendar/`
            });
          }
        });
      });
    });

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
    const response = await axios.get(THEATERS.SUNS_CINEMA, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(response.data);
    const screenings = [];

    // Parse "now playing" section with specific showtimes
    $('#now-playing .show').each((i, showElem) => {
      const $show = $(showElem);
      const title = $show.find('h2').first().text().trim();
      const movieLink = $show.find('a').first().attr('href');
      const posterUrl = $show.attr('style')?.match(/url\((.*?)\)/)?.[1];

      // Find associated showtimes (next sibling element)
      const $showtimes = $show.next('ol.showtimes');
      if ($showtimes.length > 0) {
        $showtimes.find('li').each((j, timeElem) => {
          const $time = $(timeElem);
          const isSoldOut = $time.find('.sold-out').length > 0;

          if (!isSoldOut) {
            const timeText = $time.find('span, a').first().text().trim();
            const time = parseTime(timeText);
            const purchaseLink = $time.find('a').attr('href') || movieLink;

            if (time) {
              screenings.push({
                title: title,
                venue: 'Suns Cinema',
                date: getTodayDate(),  // Today's date for "now playing"
                time: time,
                poster: posterUrl || null,
                ticketLink: purchaseLink
              });
            }
          }
        });
      }
    });

    // Parse upcoming shows (just dates, no specific times)
    $('.shows .show').each((i, showElem) => {
      const $show = $(showElem);
      const title = $show.find('.show__title').text().trim();
      const dateText = $show.find('.show__date').text().trim();
      const movieLink = $show.find('.show-link').attr('href');
      const posterUrl = $show.find('.show__image img').attr('src');

      if (title && dateText) {
        const date = parseSunsDate(dateText);
        if (date) {
          screenings.push({
            title: title,
            venue: 'Suns Cinema',
            date: date,
            time: '19:00', // Default time for shows without specific times
            poster: posterUrl || null,
            ticketLink: movieLink
          });
        }
      }
    });

    console.log(`Found ${screenings.length} screenings at Suns Cinema`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Suns Cinema:', error.message);
    return [];
  }
}

/**
 * Scrape Angelika Pop Up
 * Note: Angelika uses JavaScript-rendered content, may need additional processing
 */
async function scrapeAngelika() {
  console.log('Scraping Angelika Pop Up...');
  try {
    const response = await axios.get(THEATERS.ANGELIKA, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(response.data);
    const screenings = [];

    // Angelika uses JavaScript rendering, so static scraping may not capture all data
    // Look for any movie links or titles that are in the initial HTML
    $('a[href*="/dc/movies/"], a[href*="/showtimes"]').each((i, elem) => {
      const title = $(elem).text().trim();
      const link = $(elem).attr('href');

      if (title && title.length > 2) {
        // Without JavaScript execution, we can't get full showtimes
        // Add as upcoming with default time
        screenings.push({
          title: title,
          venue: 'Angelika Pop Up',
          date: getTodayDate(),
          time: '19:00',
          poster: null,
          ticketLink: link?.startsWith('http') ? link : `https://angelikafilmcenter.com${link}`
        });
      }
    });

    console.log(`Found ${screenings.length} screenings at Angelika Pop Up (limited data - site requires JavaScript)`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Angelika:', error.message);
    return [];
  }
}

/**
 * Scrape Miracle Theater
 * Uses RSS feed with Modern Events Calendar data
 */
async function scrapeMiracleTheater() {
  console.log('Scraping Miracle Theater...');
  try {
    const response = await axios.get('https://themiracletheatre.com/events/feed/', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(response.data, { xmlMode: true });
    const screenings = [];

    $('item').each((i, item) => {
      const $item = $(item);
      const title = $item.find('title').text().trim();
      const link = $item.find('link').text().trim();
      const startDate = $item.find('mec\\:startDate, startDate').text().trim(); // 2025-12-22
      const startHour = $item.find('mec\\:startHour, startHour').text().trim(); // "4:30 pm"
      const category = $item.find('mec\\:category, category').text().trim();
      const imageUrl = $item.find('description img').attr('src');

      // Only include items in the "Movies" category
      if (category && category.toLowerCase().includes('movies') && startDate && title) {
        const time = parseTime(startHour);

        screenings.push({
          title: title,
          venue: 'Miracle Theater',
          date: startDate,
          time: time || '19:30', // Default if parsing fails
          poster: imageUrl || null,
          ticketLink: link
        });
      }
    });

    console.log(`Found ${screenings.length} screenings at Miracle Theater`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Miracle Theater:', error.message);
    return [];
  }
}

/**
 * Scrape Avalon Theater
 * Note: May use calendar widget/events system
 */
async function scrapeAvalonTheater() {
  console.log('Scraping Avalon Theater...');
  try {
    const response = await axios.get(THEATERS.AVALON, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(response.data);
    const screenings = [];

    // Look for event listings
    $('.event, .screening, .fc-event, article').each((i, elem) => {
      const $elem = $(elem);
      const title = $elem.find('h1, h2, h3, .title, .event-title').first().text().trim();
      const link = $elem.find('a').first().attr('href');

      if (title && title.length > 3) {
        screenings.push({
          title: title,
          venue: 'Avalon Theater',
          date: getTodayDate(),
          time: '19:30',
          poster: null,
          ticketLink: link || THEATERS.AVALON
        });
      }
    });

    console.log(`Found ${screenings.length} screenings at Avalon Theater (limited data)`);
    return screenings.slice(0, 10); // Limit to avoid duplicates
  } catch (error) {
    console.error('Error scraping Avalon Theater:', error.message);
    return [];
  }
}

/**
 * Scrape Library of Congress
 * Uses LOC Events JSON API
 */
async function scrapeLibraryOfCongress() {
  console.log('Scraping Library of Congress...');
  try {
    const response = await axios.get('https://www.loc.gov/events/?q=film&fo=json', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const events = response.data.content.results;
    const screenings = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    events.forEach(event => {
      const categories = event.item?.categories || [];
      const isFilmScreening = categories.includes('film and video screenings');
      const eventDate = new Date(event.date);
      const isFuture = eventDate >= today;
      const campus = event.item?.campus || '';
      const isMainCampus = campus === 'Main Campus';

      // Only include Main Campus (DC) screenings, exclude Packard Campus (Culpeper, VA)
      if (isFilmScreening && isFuture && isMainCampus) {
        const startTime = event.item?.event_start_time_local || '';
        const time = parseTime(startTime.split('T')[1]?.substring(0, 5) || '19:00');

        screenings.push({
          title: event.title,
          venue: 'Library of Congress',
          date: event.date,
          time: time || '19:00',
          poster: event.image_url?.[0] || null,
          ticketLink: event.url
        });
      }
    });

    console.log(`Found ${screenings.length} screenings at Library of Congress`);
    return screenings;
  } catch (error) {
    console.error('Error scraping Library of Congress:', error.message);
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
 * Helper: Parse time from text like "7:00 pm" to "19:00" format
 */
function parseTime(timeText) {
  if (!timeText) return null;

  // Match patterns like "7:00 pm", "7:30 PM", etc.
  const match = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toLowerCase();

  // Convert to 24-hour format
  if (meridiem === 'pm' && hours !== 12) {
    hours += 12;
  } else if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Helper: Parse AFI Silver time format (e.g., "01:00 PM") to "13:00"
 */
function parseAFITime(timeText) {
  // AFI times are already in the right format, just need conversion
  return parseTime(timeText);
}

/**
 * Helper: Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  // Get current date in Eastern Time (DC timezone)
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(new Date());
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const year = parts.find(p => p.type === 'year').value;
  return `${year}-${month}-${day}`;
}

/**
 * Helper: Parse Suns Cinema date format (e.g., "Nov 22") to YYYY-MM-DD
 */
function parseSunsDate(dateText) {
  if (!dateText) return null;

  // Match pattern like "Nov 22", "Dec 5", etc.
  const match = dateText.match(/([A-Z][a-z]+)\s+(\d{1,2})/);
  if (!match) return null;

  const monthStr = match[1];
  const day = match[2].padStart(2, '0');

  // Month mapping
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };

  const month = months[monthStr];
  if (!month) return null;

  // Determine the year (assume current year or next year)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // If the month is before current month, assume next year
  const year = parseInt(month) < currentMonth ? currentYear + 1 : currentYear;

  return `${year}-${month}-${day}`;
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
    scrapeAvalonTheater(),
    scrapeLibraryOfCongress()
  ]);

  // Collect all successful results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allScreenings.push(...result.value);
    }
  });

  // Filter out past screenings (only keep today and future)
  const today = getTodayDate();
  const futureScreenings = allScreenings.filter(screening => screening.date >= today);
  allScreenings.length = 0;
  allScreenings.push(...futureScreenings);

  console.log(`\nFiltered to ${allScreenings.length} current/upcoming screenings (removed past dates)`);

  // Enrich with TMDB data (posters and years)
  if (TMDB_API_KEY && TMDB_API_KEY !== 'TMDB_API_KEY_PLACEHOLDER') {
    console.log('\nEnriching movie data with TMDB...');
    const enrichedScreenings = [];
    for (const screening of allScreenings) {
      const enriched = await enrichMovieData(screening);
      enrichedScreenings.push(enriched);
    }
    allScreenings.length = 0;
    allScreenings.push(...enrichedScreenings);
    console.log('TMDB enrichment complete');
  } else {
    console.log('\nSkipping TMDB enrichment (no API key configured)');
  }

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
