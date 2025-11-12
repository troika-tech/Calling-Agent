import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  FiHome,
  FiUsers,
  FiPhone,
  FiLogOut,
  FiMenu,
  FiX,
  FiPhoneCall,
  FiTarget,
} from 'react-icons/fi';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: FiHome },
    { name: 'Agents', href: '/agents', icon: FiUsers },
    { name: 'Campaigns', href: '/campaigns', icon: FiTarget },
    { name: 'Phone Numbers', href: '/phones', icon: FiPhone },
    { name: 'Call Logs', href: '/calls', icon: FiPhoneCall },
  ];
  const userInitial =
    (user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? '').toUpperCase() || 'U';
  const displayName = user?.name || user?.email || 'User';
  const displayEmail = user?.email || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-primary-50/10">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-white/80 backdrop-blur-xl border-r border-neutral-200/50
          shadow-xl
          transform transition-all duration-300 ease-in-out lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-neutral-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30">
                <FiPhone className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                  AI Calling
                </h1>
                <p className="text-xs text-neutral-500">Agent Platform</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex items-center px-4 py-3.5 rounded-xl transition-all duration-200
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-50 to-primary-100/50 text-primary-700 font-semibold shadow-soft'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} className="mr-3" />
                  <span className="text-sm">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-600"></div>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-neutral-100 p-4 bg-neutral-50/50">
            <div className="flex items-center mb-3 px-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md">
                <span className="text-white font-semibold text-sm">
                  {userInitial}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{displayName}</p>
                <p className="text-xs text-neutral-500 truncate">{displayEmail}</p>
                {(user?.role === 'admin' || user?.role === 'super_admin') && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 mt-1">
                    {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white rounded-xl hover:bg-neutral-100 transition-all duration-200 shadow-soft hover:shadow-medium border border-neutral-200"
            >
              <FiLogOut size={16} className="mr-2" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 shadow-soft">
          <div className="h-20 flex items-center px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors mr-4"
            >
              <FiMenu size={24} />
            </button>
            <div className="flex items-center flex-1">
              <h2 className="text-xl font-bold text-neutral-900">
                {navigation.find((item) => item.href === location.pathname)?.name || 'Dashboard'}
              </h2>
            </div>
            {/* Optional: Add search or other actions here */}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 lg:p-8 max-w-[1600px] mx-auto">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
