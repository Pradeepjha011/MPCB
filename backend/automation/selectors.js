const selectors = {
  searchPlaceholders: [
    'Search by name/UAN No',
    'Enter company name to search',
    'Search Company by Name',
    'Search company',
    'Search companies',
    'Search'
  ],
  searchRoles: [
    { role: 'textbox', name: /search/i },
    { role: 'searchbox', name: /search/i }
  ],
  searchInputLocators: [
    'td:has-text("Search by name/UAN No") + td input',
    'td:has-text("Search by name/UAN No") ~ td input',
    'tr:has(td:has-text("Search by name/UAN No")) input[type="text"]',
    'input[placeholder*="name/UAN"]',
    'input[placeholder*="Search by name"]',
    'input[name*="name"]',
    '#searchid',
    'input[name="search"]',
    'input[name*="company"]',
    'input[type="search"]',
    'input[placeholder*="company"]',
    'input[placeholder*="Search"]'
  ],
  searchButtonRoles: [
    { role: 'button', name: /search/i },
    { role: 'button', name: /find/i },
    { role: 'button', name: /submit/i }
  ],
  searchButtonLocators: [
    'button:has-text("Go")',
    'input[value*="Go"]',
    '#search',
    'button[name="search"]',
    'button[type="submit"]',
    'input[type="submit"]'
  ],
  resultLocators: [
    'table tbody tr',
    'table tr',
    'table a[href^="/company/"]',
    'a[href^="/company/"]',
    '.list-group a[href*="/company/"]',
    '[data-testid*="result"]',
    '[class*="result"] a',
    '.company-result-item',
    '.search-result-item',
    'a:has-text("PVT")',
    'a:has-text("PRIVATE")'
  ],
  otpInputLocators: [
    'input[name="otp"]',
    'input[name="otp_number"]',
    '#otp_number',
    'input[autocomplete="one-time-code"]',
    'input[maxlength="6"]',
    'input[maxlength="4"]'
  ],
  otpSubmitLocators: [
    'button:has-text("Verify")',
    'button:has-text("Submit")',
    'button:has-text("Continue")',
    'input[type="submit"]'
  ],
  downloadButtonLocators: [
    'a:has-text("Download")',
    'button:has-text("Download")',
    'a[href*="download"]',
    'button[title*="Download"]',
    '[role="button"]:has-text("Download")'
  ]
};

module.exports = selectors;