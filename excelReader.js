const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, 'companies.xlsx');

const safeString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeCompany = (row) => ({
  companyName: safeString(row.Name),
  fullPhoneNumber: safeString(row['Full Phone Number']),
  phoneNumber: safeString(row['Phone Number']),
  countryCode: safeString(row['Country Code']),
  email: safeString(row['Email ID']).toLowerCase()
});

const readCompanies = () => {
  const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: false, raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('companies.xlsx has no sheets');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: '',
    blankrows: false
  });

  return rows.map(normalizeCompany).filter((item) => item.companyName);
};

module.exports = {
  readCompanies
};