const express = require('express');
const upload = require('../middleware/uploadMiddleware');
const {
  uploadExcel,
  getCompanies,
  getCompanyById,
  updateCompanyStatus,
  updateCompanyPdf,
  downloadCompanyFile
} = require('../controllers/companyController');
const { startAutomation, verifyOtp } = require('../controllers/automationController');

const router = express.Router();

router.post('/upload-excel', upload.single('file'), uploadExcel);
router.get('/companies', getCompanies);
router.get('/company/:id', getCompanyById);
router.patch('/company/:id/status', updateCompanyStatus);
router.patch('/company/:id/pdf', updateCompanyPdf);
router.post('/automation/start/:companyId', startAutomation);
router.post('/automation/verify-otp/:companyId', verifyOtp);
router.get('/files/download/:companyId', downloadCompanyFile);

module.exports = router;