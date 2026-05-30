import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import DashboardPage from './pages/DashboardPage';

function PlaceholderPage({ title }) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-800">{title}</h2>
      <p className="mt-2 text-slate-500">This module is ready for your next workflow step.</p>
    </div>
  );
}

function App() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/companies" element={<PlaceholderPage title="Companies" />} />
        <Route path="/downloads" element={<PlaceholderPage title="Downloads" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default App;