function SummaryCards({ stats }) {
  const cardItems = [
    { label: 'Total Companies', value: stats.total, color: 'text-slate-800' },
    { label: 'Completed Downloads', value: stats.completed, color: 'text-emerald-600' },
    { label: 'Pending Companies', value: stats.pending, color: 'text-amber-600' },
    { label: 'Failed Companies', value: stats.failed, color: 'text-rose-600' }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cardItems.map((item) => (
        <div key={item.label} className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{item.label}</p>
          <p className={`mt-2 text-2xl font-semibold ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default SummaryCards;