const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function testSunsCinema() {
  try {
    console.log('Fetching Suns Cinema...');
    const response = await axios.get('https://sunscinema.com/');
    const $ = cheerio.load(response.data);

    // Save full HTML for inspection
    fs.writeFileSync('suns-cinema-debug.html', response.data);
    console.log('Saved full HTML to suns-cinema-debug.html');

    // Try to find movie-related elements
    console.log('\n=== Looking for movie elements ===\n');

    // Check for common patterns
    const possibleSelectors = [
      'article',
      '.movie',
      '.screening',
      '.showtime',
      '[class*="film"]',
      '[class*="movie"]',
      '[class*="show"]',
      'a[href*="/movies/"]',
      'a[href*="/purchase/"]'
    ];

    possibleSelectors.forEach(selector => {
      const found = $(selector);
      if (found.length > 0) {
        console.log(`Found ${found.length} elements matching: ${selector}`);
        // Show first example
        if (found.length > 0) {
          console.log('First element HTML:');
          console.log($(found[0]).html()?.substring(0, 200) + '...\n');
        }
      }
    });

    // Look for links to movies
    console.log('\n=== Movie links ===');
    $('a[href*="/movies/"]').each((i, elem) => {
      if (i < 5) { // Just show first 5
        console.log(`${$(elem).text().trim()} -> ${$(elem).attr('href')}`);
      }
    });

    // Look for purchase links
    console.log('\n=== Purchase links ===');
    $('a[href*="/purchase/"]').each((i, elem) => {
      if (i < 5) { // Just show first 5
        console.log(`${$(elem).text().trim()} -> ${$(elem).attr('href')}`);
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSunsCinema();
