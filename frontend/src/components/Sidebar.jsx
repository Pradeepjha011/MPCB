import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/companies', label: 'Companies' },
  { to: '/downloads', label: 'Downloads' },
  { to: '/settings', label: 'Settings' }
];

function Sidebar() {
  return (
    <aside className="w-full border-r border-slate-200 bg-white p-4 md:min-h-screen md:w-64">
      <div className="mb-8 rounded-lg bg-brand-500 px-4 py-3 text-lg font-bold text-white">Doc Automator</div>
      <nav className="space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;