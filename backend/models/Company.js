const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  companyName: { type: String, trim: true, required: true },
  fullPhoneNumber: { type: String, trim: true, default: '' },
  phoneNumber: { type: String, trim: true, default: '' },
  countryCode: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Downloading', 'OTP Required', 'Downloaded', 'Failed'],
    default: 'Pending'
  },
  pdfPath: { type: String, default: '' },
  downloadDate: { type: Date, default: null },
  errorMessage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

companySchema.index(
  { companyName: 1, phoneNumber: 1, email: 1 },
  { unique: true, partialFilterExpression: { companyName: { $exists: true } } }
);

module.exports = mongoose.model('Company', companySchema);