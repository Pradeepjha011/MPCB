const badgeStyles = {
  Pending: 'bg-slate-100 text-slate-700',
  Processing: 'bg-blue-100 text-blue-700',
  Downloading: 'bg-indigo-100 text-indigo-700',
  'OTP Required': 'bg-yellow-100 text-yellow-700',
  Downloaded: 'bg-emerald-100 text-emerald-700',
  Failed: 'bg-rose-100 text-rose-700'
};

const statusLabel = {
  Pending: 'Pending',
  Processing: 'Processing ?',
  Downloading: 'Downloading ??',
  'OTP Required': 'OTP Required',
  Downloaded: 'Downloaded ?',
  Failed: 'Failed ?'
};

function CompanyTable({ companies, onStartProcess, onViewPdf, onDownloadPdf, loading, processingCompanyId }) {
  if (loading) {
    return <div className="rounded-xl bg-white p-8 text-center text-slate-500">Loading companies...</div>;
  }

  if (!companies.length) {
    return <div className="rounded-xl bg-white p-8 text-center text-slate-500">No companies found.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="min-w-full">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-sm text-slate-600">
          <tr>
            <th className="px-4 py-3">Company Name</th>
            <th className="px-4 py-3">Phone Number</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const isProcessing = processingCompanyId === company._id;
            const isDownloaded = company.status === 'Downloaded' && company.pdfPath;

            return (
              <tr key={company._id} className="border-b border-slate-100 text-sm">
                <td className="px-4 py-3 font-medium text-slate-800">{company.companyName || '-'}</td>
                <td className="px-4 py-3 text-slate-600">{company.phoneNumber || company.fullPhoneNumber || '-'}</td>
                <td className="px-4 py-3 text-slate-600">{company.email || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles[company.status] || badgeStyles.Pending}`}>
                    {statusLabel[company.status] || company.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onStartProcess(company)}
                      disabled={isProcessing}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isProcessing ? 'Processing...' : 'Start Process'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewPdf(company)}
                      disabled={!isDownloaded}
                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      View PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadPdf(company)}
                      disabled={!isDownloaded}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Download PDF
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CompanyTable;