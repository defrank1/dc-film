# DC Film Screenings

A simple, automatically-updating website that shows all independent film screenings in the DC area.

## Features

- Clean, minimalist design
- Mobile-responsive layout
- Organized by date and time
- Automatic updates every 6 hours via GitHub Actions
- Shows screenings from:
  - AFI Silver Theatre
  - Suns Cinema
  - Angelika Pop Up at Union Market
  - Miracle Theater
  - Avalon Theater

## Setup Instructions

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it `dc-film` (or whatever you prefer)
3. Make it **public** (required for free GitHub Pages)
4. Don't initialize with README (we already have one)

### 2. Push Your Code to GitHub

Open Terminal and run these commands from your project folder:

```bash
cd /Users/andrewdefrank/Desktop/dc-film

# Initialize git repository
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: DC Film Screenings website"

# Connect to GitHub (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/dc-film.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar)
4. Under "Source", select **main** branch
5. Click **Save**
6. Your site will be live at: `https://YOUR_USERNAME.github.io/dc-film/homepage.html`

### 4. Enable GitHub Actions

GitHub Actions should work automatically, but verify:

1. Go to **Settings** > **Actions** > **General**
2. Under "Workflow permissions", select **Read and write permissions**
3. Check **Allow GitHub Actions to create and approve pull requests**
4. Click **Save**

### 5. Set Up the Scraper

The scraper is created but needs to be configured for each theater's website structure.

**To develop the scraper locally:**

```bash
# Install dependencies
npm install

# Run the scraper
npm run scrape
```

**Current Status:**
- The scraper framework is ready
- Each theater function needs HTML structure inspection
- See [scraper.js](scraper.js) for TODO comments

### 6. Customize the Scraper

Each theater website has a different HTML structure. To make the scraper work:

1. Open [scraper.js](scraper.js)
2. For each theater, inspect their website's HTML (right-click > Inspect in browser)
3. Find the CSS selectors for movie titles, dates, times, etc.
4. Update the scraper functions with the correct selectors

**Example for AFI Silver:**
```javascript
async function scrapeAFISilver() {
  const response = await axios.get(THEATERS.AFI_SILVER);
  const $ = cheerio.load(response.data);
  const screenings = [];

  $('.film-item').each((i, elem) => {
    screenings.push({
      title: $(elem).find('.film-title').text().trim(),
      venue: 'AFI Silver',
      date: formatDate($(elem).find('.date').text()),
      time: $(elem).find('.time').text().trim(),
      poster: $(elem).find('img').attr('src'),
      ticketLink: $(elem).find('a').attr('href')
    });
  });

  return screenings;
}
```

## How It Works

1. **GitHub Actions** runs [scraper.js](scraper.js) every 6 hours
2. The scraper fetches data from each theater's website
3. It updates [data/screenings.json](data/screenings.json)
4. GitHub automatically commits and pushes the changes
5. GitHub Pages serves the updated website

## File Structure

```
dc-film/
├── homepage.html          # Main HTML file
├── css/
│   └── style.css          # Styles
├── js/
│   └── main.js            # Frontend JavaScript
├── data/
│   └── screenings.json    # Theater data (auto-updated)
├── scraper.js             # Web scraper
├── package.json           # Node.js dependencies
├── .github/
│   └── workflows/
│       └── scrape-screenings.yml  # GitHub Actions config
└── README.md              # This file
```

## Manual Updates

To manually update the screenings:

1. Edit [data/screenings.json](data/screenings.json)
2. Follow the existing format:
```json
{
  "title": "Movie Title",
  "venue": "Theater Name",
  "date": "2025-11-20",
  "time": "19:00",
  "poster": "https://image.tmdb.org/t/p/w300/poster.jpg",
  "ticketLink": "https://theater-website.com"
}
```
3. Commit and push changes

## Next Steps

1. ✅ Basic website structure
2. ✅ GitHub Actions automation
3. ⏳ Configure scraper for each theater
4. ⏳ Add TMDB API for automatic movie posters
5. ⏳ Add filtering and search features

## Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Scraper:** Node.js, Axios, Cheerio
- **Automation:** GitHub Actions
- **Hosting:** GitHub Pages

## License

MIT
