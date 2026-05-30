import * as XLSX from 'xlsx';

export const parseExcelPreview = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => ({
    companyName: String(row.Name || '').trim(),
    fullPhoneNumber: String(row['Full Phone Number'] || '').trim(),
    phoneNumber: String(row['Phone Number'] || '').trim(),
    countryCode: String(row['Country Code'] || '').trim(),
    email: String(row['Email ID'] || '').trim().toLowerCase()
  }));
};