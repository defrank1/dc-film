// Fetch and display screenings
async function loadScreenings() {
    try {
        const response = await fetch('data/screenings.json');
        const data = await response.json();
        displayScreenings(data.screenings);
        updateLastUpdateTime(data.lastUpdated);
    } catch (error) {
        console.error('Error loading screenings:', error);
        document.getElementById('screenings-container').innerHTML =
            '<p style="text-align: center; color: #999; padding: 40px;">Unable to load screenings. Please try again later.</p>';
    }
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
    const date = new Date(dateString);
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

            html += `
                <div class="screening">
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
