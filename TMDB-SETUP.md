# TMDB API Setup Instructions

The scraper now uses The Movie Database (TMDB) API to automatically fetch:
- **Movie posters** for all screenings (when missing)
- **Release years** added to movie titles (when not already present)

## Smart Year Handling

The scraper intelligently handles years:
- If title already has year: `"THE KILLER (1989)"` → stays as `"THE KILLER (1989)"`
- If title missing year: `"SUNSET BOULEVARD"` → becomes `"SUNSET BOULEVARD (1950)"`

## How to Get Your Free TMDB API Key

1. **Create a TMDB account** (free):
   - Go to https://www.themoviedb.org/signup
   - Create an account (takes 1 minute)

2. **Request an API key** (also free):
   - Log in to your account
   - Go to https://www.themoviedb.org/settings/api
   - Click "Request an API Key"
   - Choose "Developer" option
   - Fill out the simple form (can use personal website info)
   - You'll get your API key instantly

3. **Add the API key to your project**:
   - Open `package.json`
   - Replace `"TMDB_API_KEY_PLACEHOLDER"` with your actual key
   - Should look like: `"tmdbApiKey": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"`

4. **Test it locally**:
   ```bash
   npm run scrape
   ```
   You should see: "Enriching movie data with TMDB..."

5. **Push to GitHub**:
   ```bash
   git add package.json
   git commit -m "Add TMDB API key"
   git push
   ```

## What the TMDB Integration Does

### For AFI Silver:
- ✅ Adds missing posters (AFI doesn't provide them)
- ✅ Adds year to titles without years (e.g., `"SUNSET BOULEVARD"` → `"SUNSET BOULEVARD (1950)"`)
- ✅ Preserves existing years (e.g., `"THE KILLER (1989)"` stays the same)

### For Suns Cinema:
- ✅ Keeps existing posters from their site
- ✅ Falls back to TMDB if poster missing
- ✅ Adds years to titles

### For All Theaters:
- Universal poster coverage
- Consistent title formatting with years
- Better movie identification for users

## Rate Limits

TMDB free tier allows:
- 40 requests every 10 seconds
- The scraper handles rate limiting gracefully
- For ~130 screenings, enrichment takes ~20-30 seconds

## Privacy Note

Your API key will be:
- ✅ Stored in package.json (tracked in git)
- ✅ Used only for movie lookups
- ✅ Never exposed to frontend users
- ✅ Safe for public repos (TMDB keys are meant to be used client-side)

TMDB API keys are designed to be public-facing and don't require secrets management.
