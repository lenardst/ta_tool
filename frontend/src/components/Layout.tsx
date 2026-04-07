import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Class } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import { useAuth } from '../context/AuthContext';
import { localISODate } from '../utils/calendar';
import {
  AcademicCapIcon,
  ArrowRightStartOnRectangleIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  TableCellsIcon,
  QueueListIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { to: '/',             label: 'Dashboard',    Icon: ChartBarIcon },
  { to: '/sessions',     label: 'Sessions',     Icon: QueueListIcon },
  { to: '/session',      label: 'Record',       Icon: CalendarDaysIcon },
  { to: '/grades',       label: 'Grades',       Icon: TableCellsIcon },
  { to: '/participants', label: 'Participants', Icon: UserGroupIcon },
  { to: '/settings',     label: 'Settings',     Icon: Cog6ToothIcon },
];

export default function Layout() {
  const { activeClass, setActiveClass } = useActiveClass();
  const { username, logout, is_admin } = useAuth();
  const navigate = useNavigate();
  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: api.classes.list });
  const todayStr = localISODate();
  const { data: sessionsToday = [], isSuccess: todaySessionsReady } = useQuery({
    queryKey: ['sessions', 'by-date', todayStr],
    queryFn: () => api.sessions.listByDate(todayStr),
    enabled: classes.length > 0,
  });
  const autoClassAppliedRef = useRef(false);

  useEffect(() => {
    if (autoClassAppliedRef.current || !todaySessionsReady || classes.length === 0) return;
    autoClassAppliedRef.current = true;
    if (sessionsToday.length === 0) return;
    const todayClassIds = new Set(sessionsToday.map((s) => s.class_id));
    const preferredId = sessionsToday[0].class_id;
    if (!activeClass || !todayClassIds.has(activeClass.id)) {
      const cls = classes.find((c: Class) => c.id === preferredId);
      if (cls) setActiveClass(cls);
    }
  }, [todaySessionsReady, sessionsToday, classes, activeClass, setActiveClass]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-indigo-900 text-white shadow-xl">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-indigo-700">
          <AcademicCapIcon className="h-7 w-7 text-indigo-300" />
          <span className="text-lg font-bold tracking-tight">TA Tool</span>
        </div>

        {/* Class switcher */}
        <div className="px-3 py-3 border-b border-indigo-700">
          <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">
            Active class
          </label>
          <select
            className="w-full rounded-md bg-indigo-800 px-2 py-1.5 text-sm text-white border border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={activeClass?.id ?? ''}
            onChange={(e) => {
              const cls = classes.find((c: Class) => c.id === Number(e.target.value));
              setActiveClass(cls ?? null);
            }}
          >
            <option value="">— select a class —</option>
            {classes.map((c: Class) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-200 hover:bg-indigo-700 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
          {is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-200 hover:bg-indigo-700 hover:text-white'
                }`
              }
            >
              <ShieldCheckIcon className="h-5 w-5 flex-shrink-0" />
              Admin
            </NavLink>
          )}
        </nav>

        {/* User / logout */}
        <div className="px-3 py-3 border-t border-indigo-700">
          <div className="text-xs text-indigo-400 mb-1 truncate">{username}</div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-700 hover:text-white transition-colors"
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
