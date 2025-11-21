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

    let html = '';

    sortedDates.forEach(date => {
        html += `
            <div class="date-section">
                <h2 class="date-header">${formatDate(date)}</h2>
        `;

        groupedScreenings[date].forEach(screening => {
            html += `
                <div class="screening">
                    <div class="poster">
                        ${screening.poster ?
                    `<img src="${screening.poster}" alt="${screening.title} poster">` :
                    ''}
                    </div>
                    <div class="screening-info">
                        <div class="showtime">${screening.time}</div>
                        <h3 class="movie-title">${screening.title}</h3>
                        <p class="venue">${screening.venue}</p>
                        ${screening.ticketLink ?
                    `<a href="${screening.ticketLink}" class="ticket-link" target="_blank" rel="noopener">Buy Tickets</a>` :
                    ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
    });

    container.innerHTML = html;
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
