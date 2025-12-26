// Global state
let allScreenings = [];
let selectedTheater = 'all';

// Fetch and display screenings
async function loadScreenings() {
    try {
        const response = await fetch('data/screenings.json');
        const data = await response.json();
        allScreenings = data.screenings;
        populateTheaterFilter(allScreenings);
        displayScreenings(filterScreenings(allScreenings));
        updateLastUpdateTime(data.lastUpdated);
    } catch (error) {
        console.error('Error loading screenings:', error);
        document.getElementById('screenings-container').innerHTML =
            '<p style="text-align: center; color: #999; padding: 40px;">Unable to load screenings. Please try again later.</p>';
    }
}

// Populate theater filter dropdown
function populateTheaterFilter(screenings) {
    const theaters = new Set();
    screenings.forEach(screening => {
        theaters.add(screening.venue);
    });

    const sortedTheaters = Array.from(theaters).sort();
    const select = document.getElementById('theater-filter');

    // Clear existing options except "All Theaters"
    select.innerHTML = '<option value="all">All Theaters</option>';

    // Add theater options
    sortedTheaters.forEach(theater => {
        const option = document.createElement('option');
        option.value = theater;
        option.textContent = theater;
        select.appendChild(option);
    });

    // Add change event listener
    select.addEventListener('change', function() {
        selectedTheater = this.value;
        displayScreenings(filterScreenings(allScreenings));
    });
}

// Filter screenings by selected theater
function filterScreenings(screenings) {
    if (selectedTheater === 'all') {
        return screenings;
    }
    return screenings.filter(screening => screening.venue === selectedTheater);
}

// Group screenings by date
function groupByDate(screenings) {
    const grouped = {};

    screenings.forEach(screening => {
        const date = screening.date;
        if (!grouped[date]) {
            grouped[date] = [];
        }
        grouped[date].push(screening);
    });

    // Sort screenings within each date by time
    Object.keys(grouped).forEach(date => {
        grouped[date].sort((a, b) => {
            return a.time.localeCompare(b.time);
        });
    });

    return grouped;
}

// Format date for display
function formatDate(dateString) {
    // Parse date string as local time, not UTC
    // dateString format: "2025-11-21"
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day); // month is 0-indexed
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}


// Format time from 24-hour to 12-hour format
function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

// Display screenings grouped by date
function displayScreenings(screenings) {
    const container = document.getElementById('screenings-container');

    if (!screenings || screenings.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No screenings available at this time.</p>';
        return;
    }

    // Group and sort by date
    const groupedScreenings = groupByDate(screenings);
    const sortedDates = Object.keys(groupedScreenings).sort();

    // Track which movies have already been displayed with posters
    const shownMovies = new Set();

    let html = '';

    sortedDates.forEach((date, index) => {
        const dateId = `date-${index}`;
        html += `
            <div class="date-section">
                <h2 class="date-header" data-date-id="${dateId}">
                    <span class="date-toggle">▼</span>
                    ${formatDate(date)}
                </h2>
                <div class="date-screenings" id="${dateId}">
        `;

        groupedScreenings[date].forEach(screening => {
            const showPoster = !shownMovies.has(screening.title);
            if (showPoster) {
                shownMovies.add(screening.title);
            }

            // Determine venue class for background color
            const venueClass = screening.venue.toLowerCase().includes('afi') ? 'venue-afi' :
                              screening.venue.toLowerCase().includes('suns') ? 'venue-suns' :
                              screening.venue.toLowerCase().includes('miracle') ? 'venue-miracle' :
                              screening.venue.toLowerCase().includes('library') ? 'venue-library' :
                              screening.venue.toLowerCase().includes('angelika') ? 'venue-angelika' :
                              screening.venue.toLowerCase().includes('avalon') ? 'venue-avalon' :
                              screening.venue.toLowerCase().includes('national gallery') ? 'venue-nga' : '';

            html += `
                <div class="screening ${venueClass}">
                    <div class="poster${!showPoster ? ' hidden' : ''}">
                        ${screening.poster ?
                    `<img src="${screening.poster}" alt="${screening.title} poster">` :
                    ''}
                    </div>
                    <div class="screening-info">
                        <div class="showtime">${formatTime(screening.time)}</div>
                        <h3 class="movie-title">${screening.title}</h3>
                        <p class="venue">${screening.venue}</p>
                        ${screening.ticketLink ?
                    `<a href="${screening.ticketLink}" class="ticket-link" target="_blank" rel="noopener">Buy Tickets</a>` :
                    ''}
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    });

    container.innerHTML = html;

    // Add click handlers for collapsible date sections
    document.querySelectorAll('.date-header').forEach(header => {
        header.addEventListener('click', function() {
            const dateId = this.getAttribute('data-date-id');
            const screeningsDiv = document.getElementById(dateId);
            const toggle = this.querySelector('.date-toggle');

            if (screeningsDiv.classList.contains('collapsed')) {
                screeningsDiv.classList.remove('collapsed');
                screeningsDiv.style.maxHeight = screeningsDiv.scrollHeight + 'px';
                toggle.textContent = '▼';
            } else {
                screeningsDiv.classList.add('collapsed');
                screeningsDiv.style.maxHeight = '0';
                toggle.textContent = '▶';
            }
        });
    });
}

// Update last update time
function updateLastUpdateTime(timestamp) {
    const element = document.getElementById('last-update-time');
    if (timestamp) {
        const date = new Date(timestamp);
        element.textContent = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
}

// Load screenings when page loads
document.addEventListener('DOMContentLoaded', loadScreenings);

// Refresh every 30 minutes
setInterval(loadScreenings, 30 * 60 * 1000);
