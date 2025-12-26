// Test Suns date parsing

function parseSunsDate(dateText) {
  if (!dateText) return null;

  // Match pattern like "Nov 22", "Dec 5", or "Sat, Dec 27"
  // First try to match with optional day of week prefix
  const match = dateText.match(/(?:[A-Z][a-z]+,?\s+)?([A-Z][a-z]+)\s+(\d{1,2})/);
  if (!match) return null;

  const monthStr = match[1];
  const day = match[2].padStart(2, '0');

  // Month mapping
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

const testDates = [
  "Sat,  Dec 27",
  "Sun,  Dec 28",
  "Tue,  Dec 30",
  "Wed,  Jan 1",
  "Thu,  Jan 2"
];

console.log('Testing Suns date parsing:');
testDates.forEach(dateText => {
  const result = parseSunsDate(dateText);
  console.log(`  "${dateText}" => ${result}`);
});
