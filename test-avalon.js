const axios = require('axios');
const cheerio = require('cheerio');

async function testAvalon() {
  console.log('Testing Avalon Theater scraping...\n');

  try {
    const response = await axios.get('https://www.theavalon.org/', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const $ = cheerio.load(response.data);
    const screenings = [];

    // Look for showtime list
    $('ul.showtimes li').each((i, elem) => {
      const $elem = $(elem);
      const titleLink = $elem.find('a').first();
      const title = titleLink.text().trim();
      const link = titleLink.attr('href');

      // Get all time spans
      const times = [];
      $elem.find('.times span, .times a').each((j, timeElem) => {
        const timeText = $(timeElem).text().trim();
        if (timeText.match(/\d{1,2}:\d{2}/)) {
          times.push(timeText);
        }
      });

      console.log(`Found: ${title}`);
      console.log(`  Times: ${times.join(', ')}`);
      console.log(`  Link: ${link}`);
      console.log('');

      screenings.push({
        title,
        times,
        link
      });
    });

    console.log(`\nTotal screenings found: ${screenings.length}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAvalon();
