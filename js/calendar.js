let currentMonth = new Date();
let screeningsData = [];

// Fetch and display screenings
async function loadScreenings() {
    try {
        const response = await fetch('data/screenings.json');
        const data = await response.json();
        screeningsData = data.screenings;
        renderCalendar();
        updateLastUpdateTime(data.lastUpdated);
    } catch (error) {
        console.error('Error loading screenings:', error);
        document.getElementById('calendar-container').innerHTML =
            '<p style="text-align: center; color: #999; padding: 40px;">Unable to load screenings. Please try again later.</p>';
    }
}

// Render the calendar
function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Update month display
    document.getElementById('current-month').textContent =
        currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Get previous month's last days to fill in the grid
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    let html = '<div class="calendar">';

    // Day headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        html += `<div class="calendar-header">${day}</div>`;
    });

    // Previous month's trailing days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        html += `<div class="calendar-day other-month"><div class="day-number">${day}</div></div>`;
    }

    // Current month's days
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = isCurrentMonth && day === today.getDate();
        const dayScreenings = screeningsData.filter(s => s.date === dateString);

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="day-number">${day}</div>
                <div class="day-screenings">
        `;

        // Sort screenings by time
        dayScreenings.sort((a, b) => a.time.localeCompare(b.time));

        // Group screenings by movie title and venue
        const groupedScreenings = groupScreeningsByMovie(dayScreenings);

        // Add screenings to this day
        groupedScreenings.forEach(group => {
            const venueClass = getVenueClass(group.venue);
            const times = group.times.map(t => formatTime(t)).join(', ');

            html += `
                <div class="day-screening ${venueClass}"
                     onclick="window.open('${group.ticketLink || '#'}', '_blank')"
                     title="${group.title} - ${group.venue} - ${times}">
                    <span class="screening-time">${times}</span>
                    <div class="screening-title">${group.title}</div>
                    <div class="screening-venue">${getVenueShortName(group.venue)}</div>
                </div>
            `;
        });

        html += '</div></div>';
    }

    // Next month's leading days to complete the grid
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells < 7) {
        for (let day = 1; day <= remainingCells; day++) {
            html += `<div class="calendar-day other-month"><div class="day-number">${day}</div></div>`;
        }
    }

    html += '</div>';

    document.getElementById('calendar-container').innerHTML = html;
}

// Group screenings by movie title and venue (combine multiple showtimes)
function groupScreeningsByMovie(screenings) {
    const grouped = {};

    screenings.forEach(screening => {
        // Create a unique key for each movie+venue combination
        const key = `${screening.title}|${screening.venue}`;

        if (!grouped[key]) {
            grouped[key] = {
                title: screening.title,
                venue: screening.venue,
                times: [],
                ticketLink: screening.ticketLink
            };
        }

        grouped[key].times.push(screening.time);
    });

    // Convert to array and sort by first showtime
    return Object.values(grouped).sort((a, b) =>
        a.times[0].localeCompare(b.times[0])
    );
}

// Get venue class for styling
function getVenueClass(venue) {
    const venueLower = venue.toLowerCase();
    if (venueLower.includes('afi')) return 'venue-afi';
    if (venueLower.includes('suns')) return 'venue-suns';
    if (venueLower.includes('miracle')) return 'venue-miracle';
    if (venueLower.includes('library')) return 'venue-library';
    if (venueLower.includes('angelika')) return 'venue-angelika';
    if (venueLower.includes('avalon')) return 'venue-avalon';
    if (venueLower.includes('national gallery')) return 'venue-nga';
    return '';
}

// Get shortened venue name for display
function getVenueShortName(venue) {
    const venueLower = venue.toLowerCase();
    if (venueLower.includes('afi')) return 'AFI';
    if (venueLower.includes('suns')) return 'Suns';
    if (venueLower.includes('miracle')) return 'Miracle';
    if (venueLower.includes('library')) return 'LOC';
    if (venueLower.includes('angelika')) return 'Angelika';
    if (venueLower.includes('avalon')) return 'Avalon';
    if (venueLower.includes('national gallery')) return 'NGA';
    return venue;
}

// Format time from 24-hour to 12-hour format
function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes}${ampm}`;
}

// Update last update time
function updateLastUpdateTime(timestamp) {
    const element = document.getElementById('last-update-time');
    if (timestamp) {
        const date = new Date(timestamp);
        element.textContent = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
}

// Month navigation
document.addEventListener('DOMContentLoaded', () => {
    loadScreenings();

    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
    });
});
