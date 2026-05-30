const path = require('path');
const XLSX = require('xlsx');
const Company = require('../models/Company');

const toSafeString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const getValueByAliases = (row, aliases) => {
  const normalizedAliasSet = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliasSet.has(normalizeKey(key))) {
      return value;
    }
  }

  return '';
};

const normalizeRow = (row) => ({
  companyName: toSafeString(getValueByAliases(row, ['Name', 'Company Name', 'companyName'])),
  fullPhoneNumber: toSafeString(getValueByAliases(row, ['Full Phone Number', 'fullPhoneNumber'])),
  phoneNumber: toSafeString(getValueByAliases(row, ['Phone Number', 'phoneNumber', 'Mobile Number'])),
  countryCode: toSafeString(getValueByAliases(row, ['Country Code', 'countryCode'])),
  email: toSafeString(getValueByAliases(row, ['Email ID', 'Email', 'emailId', 'email'])).toLowerCase()
});

const uploadExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error('Excel file is required');
    }

    const workbook = XLSX.readFile(req.file.path, { cellDates: false, raw: false });
    const firstSheet = workbook.SheetNames[0];

    if (!firstSheet) {
      res.status(400);
      throw new Error('Excel file has no sheets');
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
      defval: '',
      blankrows: false
    });

    const validCompanies = rows.map(normalizeRow).filter((item) => item.companyName);

    if (!validCompanies.length) {
      res.status(400);
      throw new Error('No valid rows found in the Excel file');
    }

    let inserted = 0;
    let duplicates = 0;

    for (const company of validCompanies) {
      try {
        await Company.create(company);
        inserted += 1;
      } catch (error) {
        if (error.code === 11000) {
          duplicates += 1;
          continue;
        }
        throw error;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Excel processed successfully',
      data: {
        totalRows: validCompanies.length,
        inserted,
        duplicates
      }
    });
  } catch (error) {
    next(error);
  }
};

const getCompanies = async (_req, res, next) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json({ success: true, data: companies });
  } catch (error) {
    next(error);
  }
};

const getCompanyById = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      res.status(404);
      throw new Error('Company not found');
    }

    res.json({ success: true, data: company });
  } catch (error) {
    next(error);
  }
};

const updateCompanyStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatus = ['Pending', 'Processing', 'Downloading', 'OTP Required', 'Downloaded', 'Failed'];

    if (!validStatus.includes(status)) {
      res.status(400);
      throw new Error('Invalid status value');
    }

    const company = await Company.findByIdAndUpdate(req.params.id, { status }, { new: true });

    if (!company) {
      res.status(404);
      throw new Error('Company not found');
    }

    res.json({ success: true, message: 'Status updated', data: company });
  } catch (error) {
    next(error);
  }
};

const updateCompanyPdf = async (req, res, next) => {
  try {
    const { pdfPath } = req.body;

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { pdfPath: toSafeString(pdfPath), status: 'Downloaded', downloadDate: new Date(), errorMessage: '' },
      { new: true }
    );

    if (!company) {
      res.status(404);
      throw new Error('Company not found');
    }

    res.json({ success: true, message: 'PDF path updated', data: company });
  } catch (error) {
    next(error);
  }
};

const downloadCompanyFile = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.companyId);

    if (!company) {
      res.status(404);
      throw new Error('Company not found');
    }

    if (!company.pdfPath) {
      res.status(404);
      throw new Error('No PDF found for this company');
    }

    const absolutePath = path.join(__dirname, '..', company.pdfPath);
    return res.download(absolutePath);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadExcel,
  getCompanies,
  getCompanyById,
  updateCompanyStatus,
  updateCompanyPdf,
  downloadCompanyFile
};