import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
});

export const uploadExcel = (formData) =>
  api.post('/upload-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const fetchCompanies = () => api.get('/companies');
export const updateCompanyStatus = (id, status) => api.patch(`/company/${id}/status`, { status });
export const updateCompanyPdf = (id, pdfPath) => api.patch(`/company/${id}/pdf`, { pdfPath });
export const startAutomation = (companyId) => api.post(`/automation/start/${companyId}`);
export const verifyOtp = (companyId, otp = '') => api.post(`/automation/verify-otp/${companyId}`, { otp });
export const getCompanyFileUrl = (companyId) =>
  `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/files/download/${companyId}`;

export default api;