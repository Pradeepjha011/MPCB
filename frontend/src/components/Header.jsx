function Header() {
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <header className="flex items-center justify-between rounded-xl bg-white px-5 py-4 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Automation Dashboard</h1>
        <p className="text-sm text-slate-500">Monitor and manage company document downloads</p>
      </div>
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{dateLabel}</div>
    </header>
  );
}

export default Header;