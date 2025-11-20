const axios = require('axios');
const cheerio = require('cheerio');

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
 * Helper: Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Helper: Parse Suns Cinema date format (e.g., "Nov 22") to YYYY-MM-DD
 */
function parseSunsDate(dateText) {
  if (!dateText) return null;

  const match = dateText.match(/([A-Z][a-z]+)\s+(\d{1,2})/);
  if (!match) return null;

  const monthStr = match[1];
  const day = match[2].padStart(2, '0');

  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };

  const month = months[monthStr];
  if (!month) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const year = parseInt(month) < currentMonth ? currentYear + 1 : currentYear;

  return `${year}-${month}-${day}`;
}

async function testSunsScraper() {
  console.log('Testing Suns Cinema scraper...\n');

  try {
    const response = await axios.get('https://sunscinema.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const screenings = [];

    // Parse "now playing" section
    $('#now-playing .show').each((i, showElem) => {
      const $show = $(showElem);
      const title = $show.find('h2').first().text().trim();
      const movieLink = $show.find('a').first().attr('href');
      const posterUrl = $show.attr('style')?.match(/url\((.*?)\)/)?.[1];

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
                date: getTodayDate(),
                time: time,
                poster: posterUrl || null,
                ticketLink: purchaseLink
              });
            }
          }
        });
      }
    });

    // Parse upcoming shows
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
            time: '19:00',
            poster: posterUrl || null,
            ticketLink: movieLink
          });
        }
      }
    });

    console.log(`Found ${screenings.length} screenings\n`);
    console.log('Sample screenings:');
    screenings.slice(0, 5).forEach(s => {
      console.log(`- ${s.title} | ${s.date} at ${s.time}`);
      console.log(`  Link: ${s.ticketLink}`);
      console.log(`  Poster: ${s.poster ? 'Yes' : 'No'}\n`);
    });

    return screenings;
  } catch (error) {
    console.error('Error:', error.message);
    return [];
  }
}

testSunsScraper();
