import Sidebar from './Sidebar';
import Header from './Header';

function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />
      <main className="w-full p-4 md:p-6">
        <Header />
        <section className="mt-6">{children}</section>
      </main>
    </div>
  );
}

export default DashboardLayout;