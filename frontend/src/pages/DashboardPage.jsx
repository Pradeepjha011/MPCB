import { useMemo, useState } from 'react';
import CompanyTable from '../components/CompanyTable';
import SummaryCards from '../components/SummaryCards';
import { fetchCompanies, getCompanyFileUrl, startAutomation, updateCompanyStatus, verifyOtp, uploadExcel } from '../services/api';
import { parseExcelPreview } from '../utils/excelParser';
import { useEffect } from 'react';

const filters = ['All', 'Pending', 'Downloaded', 'Failed'];

function DashboardPage() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [processingCompanyId, setProcessingCompanyId] = useState('');
  const [otpModal, setOtpModal] = useState({ isOpen: false, companyId: '', companyName: '' });
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const { data } = await fetchCompanies();
      setCompanies(data.data || []);
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'Failed to fetch companies' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await parseExcelPreview(file);

      const formData = new FormData();
      formData.append('file', file);
      const { data } = await uploadExcel(formData);
      setNotice({
        type: 'success',
        message: `Upload successful. Inserted: ${data.data.inserted}, Duplicates: ${data.data.duplicates}`
      });
      await loadCompanies();
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'Excel upload failed' });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleStartProcess = async (company) => {
    try {
      setProcessingCompanyId(company._id);
      await updateCompanyStatus(company._id, 'Processing');

      const { data } = await startAutomation(company._id);
      if (data.message === 'OTP Required' || data.manualActionRequired) {
        setOtpModal({ isOpen: true, companyId: company._id, companyName: company.companyName || 'Company' });
      }

      setNotice({ type: 'success', message: data.message || 'Automation started successfully' });
      await loadCompanies();
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'Automation failed to start' });
      await loadCompanies();
    } finally {
      setProcessingCompanyId('');
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setOtpLoading(true);
      if (!otp.trim()) {
        setNotice({ type: 'success', message: 'Waiting for OTP from phone via ADB...' });
      }
      const { data } = await verifyOtp(otpModal.companyId, otp.trim());
      setNotice({ type: 'success', message: data.message || 'Verification completed' });
      setOtpModal({ isOpen: false, companyId: '', companyName: '' });
      setOtp('');
      await loadCompanies();
    } catch (error) {
      setNotice({ type: 'error', message: error.response?.data?.message || 'OTP verification failed' });
      await loadCompanies();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleViewPdf = (company) => {
    if (!company.pdfPath) {
      setNotice({ type: 'error', message: 'No PDF found for this company.' });
      return;
    }

    window.open(getCompanyFileUrl(company._id), '_blank');
  };

  const handleDownloadPdf = (company) => {
    if (!company.pdfPath) {
      setNotice({ type: 'error', message: 'No PDF found for this company.' });
      return;
    }

    const link = document.createElement('a');
    link.href = getCompanyFileUrl(company._id);
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const visibleCompanies = useMemo(() => {
    return companies.filter((company) => {
      const searchText = search.toLowerCase();
      const searchMatched =
        company.companyName?.toLowerCase().includes(searchText) ||
        company.phoneNumber?.toLowerCase().includes(searchText) ||
        company.email?.toLowerCase().includes(searchText);

      const filterMatched = activeFilter === 'All' ? true : company.status === activeFilter;
      return searchMatched && filterMatched;
    });
  }, [companies, search, activeFilter]);

  const stats = useMemo(() => {
    return {
      total: companies.length,
      completed: companies.filter((c) => c.status === 'Downloaded').length,
      pending: companies.filter((c) => ['Pending', 'Processing', 'Downloading', 'OTP Required'].includes(c.status)).length,
      failed: companies.filter((c) => c.status === 'Failed').length
    };
  }, [companies]);

  return (
    <div className="space-y-5">
      {notice.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {notice.message}
        </div>
      )}

      <SummaryCards stats={stats} />

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Excel Upload</h2>
        <p className="mt-1 text-sm text-slate-500">Upload company sheet to start automation tracking.</p>
        <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {uploading ? 'Uploading...' : 'Select Excel File'}
          <input
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={handleExcelUpload}
            disabled={uploading}
          />
        </label>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name, phone number, email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="flex gap-2">
            {filters.map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  activeFilter === filter ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      <CompanyTable
        companies={visibleCompanies}
        onStartProcess={handleStartProcess}
        onViewPdf={handleViewPdf}
        onDownloadPdf={handleDownloadPdf}
        loading={loading}
        processingCompanyId={processingCompanyId}
      />

      {otpModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800">OTP Verification</h3>
            <p className="mt-1 text-sm text-slate-500">Enter OTP for {otpModal.companyName}</p>
            <p className="mt-1 text-xs text-slate-500">Leave empty to auto-read OTP from connected phone.</p>

            <input
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter OTP"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOtpModal({ isOpen: false, companyId: '', companyName: '' });
                  setOtp('');
                }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otpLoading}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {otpLoading ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;