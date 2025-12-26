const axios = require('axios');
const cheerio = require('cheerio');
const ical = require('node-ical');
const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');

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
 * Scrape AFI Silver Theatre using Puppeteer
 * Navigates through multiple months to get all available screenings
 */
async function scrapeAFISilver() {
  console.log('Scraping AFI Silver with Puppeteer...');

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

    await page.goto(THEATERS.AFI_SILVER, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const allScreenings = [];

    // Scrape current month and next 2 months (3 months total)
    for (let monthIndex = 0; monthIndex < 3; monthIndex++) {
      try {
        // Extract data from current view
        const monthData = await page.evaluate(() => {
          const html = document.documentElement.outerHTML;

          // Extract JavaScript data embedded in the page
          const showArrayMatch = html.match(/console\.log\("show_array:",\s*({.*?})\);/s);
          const movieArrayMatch = html.match(/console\.log\("movie_array:",\s*(\[.*?\])\);/s);

          if (!showArrayMatch || !movieArrayMatch) {
            return null;
          }

          return {
            showData: showArrayMatch[1],
            movieData: movieArrayMatch[1]
          };
        });

        if (monthData) {
          // Parse the JavaScript objects
          const showData = JSON.parse(monthData.showData);
          const movieData = JSON.parse(monthData.movieData);

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
                  allScreenings.push({
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
        }

        // Click next month button if not on last iteration
        if (monthIndex < 2) {
          const nextButtonClicked = await page.evaluate(() => {
            // Find the ">" arrow button near the calendar
            const allElements = Array.from(document.querySelectorAll('*'));
            const arrowElement = allElements.find(el => {
              const text = el.textContent?.trim();
              // Must be exactly ">" and not contain more text (avoid elements with children)
              return text === '>' && el.children.length === 0;
            });

            if (arrowElement) {
              arrowElement.click();
              return true;
            }
            return false;
          });

          if (!nextButtonClicked) {
            console.log('Could not find next month button, stopping');
            break;
          }

          // Wait for calendar to update
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`Error scraping AFI month ${monthIndex}:`, error.message);
      }
    }

    console.log(`Found ${allScreenings.length} screenings at AFI Silver`);
    return allScreenings;
  } catch (error) {
    console.error('Error scraping AFI Silver:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scrape Suns Cinema using Puppeteer for the upcoming films page
 */
async function scrapeSunsCinema() {
  console.log('Scraping Suns Cinema with Puppeteer...');
  const screenings = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // Scrape the upcoming films page with Puppeteer to handle JavaScript-loaded dates
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
        const link = titleEl ? titleEl.getAttribute('href') : null;

        const posterEl = show.querySelector('.show-poster img');
        const poster = posterEl ? posterEl.getAttribute('src') : null;

        const dates = [];

        // Get all show dates from .show-date elements (scheduled screenings)
        const dateElements = show.querySelectorAll('.show-date');
        dateElements.forEach(dateEl => {
          const dateText = dateEl.textContent.trim();
          if (dateText) {
            dates.push(dateText);
          }
        });

        // Also check for "Opens on" date in .no-showtimes-date element (upcoming releases)
        const noShowtimesEl = show.querySelector('.no-showtimes-date');
        if (noShowtimesEl) {
          const opensText = noShowtimesEl.textContent.trim();
          if (opensText) {
            dates.push(opensText);
          }
        }

        if (title && dates.length > 0) {
          results.push({ title, link, poster, dates });
        }
      });

      return results;
    });

    // Parse each show and create screening entries
    shows.forEach(show => {
      show.dates.forEach(dateText => {
        const date = parseSunsDate(dateText);
        if (date) {
          screenings.push({
            title: show.title,
            venue: 'Suns Cinema',
            date: date,
            time: '19:00', // Default time
            poster: show.poster,
            ticketLink: show.link
          });
        }
      });
    });

    // Remove duplicates based on title + date
    const seen = new Set();
    const uniqueScreenings = screenings.filter(screening => {
      const key = `${screening.title}-${screening.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Found ${uniqueScreenings.length} screenings at Suns Cinema`);
    return uniqueScreenings;
  } catch (error) {
    console.error('Error scraping Suns Cinema:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scrape Angelika Pop Up
 * Note: Angelika uses JavaScript-rendered content, may need additional processing
 */
async function scrapeAngelika() {
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
 * Scrape Avalon Theater using Puppeteer
 * Note: Site blocks requests, requires headless browser
 */
async function scrapeAvalonTheater() {
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

        const posterImg = item.querySelector('img');
        const poster = posterImg?.src || null;

        const timeElements = item.querySelectorAll('.times span, .times a');
        timeElements.forEach(timeEl => {
          const timeText = timeEl.textContent?.trim();

          if (timeText && timeText.match(/^\d{1,2}:\d{2}$/)) {
            let time24 = timeText;
            const parts = timeText.split(':');
            let hours = parseInt(parts[0]);
            const minutes = parts[1];

            // Assume PM for times before 10, AM for 10-11
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
    console.error('Error scraping Avalon Theater:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scrape Library of Congress
 * Uses LOC Events JSON API
 */
async function scrapeLibraryOfCongress() {
  console.log('Scraping Library of Congress...');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // LOC API - fetch all available future events (no end date limit)
    const response = await axios.get('https://www.loc.gov/events/?q=film&fo=json', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const events = response.data.content.results;
    const screenings = [];

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
 * Scrape National Gallery of Art using Puppeteer
 * Note: Site uses Cloudflare protection, requires headless browser
 */
async function scrapeNationalGallery() {
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

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateParam = `${year}-${month}-${day}`;

    // No end date - fetch all available future screenings
    const url = `https://www.nga.gov/calendar?type%5B103026%5D=103026&visit_start=${dateParam}&tab=all`;

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const screenings = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n');

      let currentDate = null;
      let currentTitle = null;
      let currentTime = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

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

        if (line === 'FILMS') {
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

        const timeMatch = line.match(/^(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
        if (timeMatch && currentTitle && currentDate) {
          let hours = parseInt(timeMatch[1]);
          const minutes = timeMatch[2];
          const period = timeMatch[3].toLowerCase();

          if (period.startsWith('p') && hours !== 12) hours += 12;
          if (period.startsWith('a') && hours === 12) hours = 0;

          currentTime = `${String(hours).padStart(2, '0')}:${minutes}`;

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
 * Helper: Parse Suns Cinema date format to YYYY-MM-DD
 * Handles formats: "Nov 22", "Sat, Dec 27", "Opens on January 7"
 */
function parseSunsDate(dateText) {
  if (!dateText) return null;

  // Check for "Opens on Month Day" format (e.g., "Opens on January 7")
  const opensMatch = dateText.match(/Opens on ([A-Z][a-z]+)\s+(\d{1,2})/);
  if (opensMatch) {
    const monthStr = opensMatch[1];
    const day = opensMatch[2].padStart(2, '0');

    // Full month name mapping
    const fullMonths = {
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'May': '05', 'June': '06', 'July': '07', 'August': '08',
      'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };

    const month = fullMonths[monthStr];
    if (!month) return null;

    // Determine year
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const year = parseInt(month) < currentMonth ? currentYear + 1 : currentYear;

    return `${year}-${month}-${day}`;
  }

  // Match pattern like "Nov 22", "Dec 5", or "Sat, Dec 27"
  const match = dateText.match(/(?:[A-Z][a-z]+,?\s+)?([A-Z][a-z]+)\s+(\d{1,2})/);
  if (!match) return null;

  const monthStr = match[1];
  const day = match[2].padStart(2, '0');

  // Abbreviated month mapping
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
    scrapeLibraryOfCongress(),
    scrapeNationalGallery()
  ]);

  // Collect all successful results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allScreenings.push(...result.value);
    }
  });

  // Filter out only past screenings (keep all future screenings)
  const today = getTodayDate();
  const futureScreenings = allScreenings.filter(screening => screening.date >= today);
  allScreenings.length = 0;
  allScreenings.push(...futureScreenings);

  console.log(`\nFiltered to ${allScreenings.length} current and upcoming screenings (removed past dates)`);

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
