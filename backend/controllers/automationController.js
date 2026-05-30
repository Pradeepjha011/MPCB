const mongoose = require('mongoose');
const Company = require('../models/Company');
const {
  startCompanyAutomation,
  continueWithOtp,
  closeSession
} = require('../automation/companyAutomation');

const markFailedIfPossible = async (companyId, errorMessage = '') => {
  if (mongoose.Types.ObjectId.isValid(companyId)) {
    await Company.findByIdAndUpdate(companyId, { status: 'Failed', errorMessage: String(errorMessage || '') });
  }
};

const startAutomation = async (req, res, next) => {
  const { companyId } = req.params;

  try {
    const company = await Company.findById(companyId);

    if (!company) {
      await markFailedIfPossible(companyId, 'Company not found');
      res.status(404);
      throw new Error('Company not found');
    }

    await Company.findByIdAndUpdate(companyId, { status: 'Processing', errorMessage: '' });
    console.log(`Starting automation for: ${company.companyName || '[EMPTY COMPANY NAME]'}`);

    const result = await startCompanyAutomation(company);

    if (result.manualActionRequired) {
      await Company.findByIdAndUpdate(companyId, { status: 'Processing' });
      return res.status(202).json({
        success: true,
        manualActionRequired: true,
        message: result.message
      });
    }

    if (result.otpRequired) {
      await Company.findByIdAndUpdate(companyId, { status: 'OTP Required' });
      return res.json({ success: true, message: 'OTP Required' });
    }

    return res.json({ success: true, message: result.message || 'Automation completed' });
  } catch (error) {
    await markFailedIfPossible(companyId, error.message);
    await closeSession(companyId);

    if (/timeout/i.test(error.message)) {
      res.status(504);
      return next(new Error('Automation timed out while processing the website'));
    }

    return next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  const { companyId } = req.params;
  const { otp } = req.body;

  try {
    const company = await Company.findById(companyId);

    if (!company) {
      await markFailedIfPossible(companyId, 'Company not found');
      res.status(404);
      throw new Error('Company not found');
    }

    await Company.findByIdAndUpdate(companyId, { status: 'Downloading', errorMessage: '' });

    const result = await continueWithOtp(companyId, otp || '', company.companyName);

    await Company.findByIdAndUpdate(companyId, {
      status: 'Downloaded',
      pdfPath: result.pdfPath || '',
      downloadDate: result.downloadDate || new Date(),
      errorMessage: ''
    });

    console.log('MongoDB updated');
    return res.json({
      success: true,
      message: result.message || 'Verification completed',
      pdfPath: result.pdfPath || ''
    });
  } catch (error) {
    await markFailedIfPossible(companyId, error.message);

    if (/timeout/i.test(error.message)) {
      res.status(504);
      return next(new Error('OTP verification timed out'));
    }

    return next(error);
  }
};

module.exports = {
  startAutomation,
  verifyOtp
};