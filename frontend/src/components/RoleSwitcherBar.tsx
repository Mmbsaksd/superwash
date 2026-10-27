import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { User, Truck, Scale, Shield, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const RoleSwitcherBar: React.FC = () => {
  const { currentUser, switchDemoRole, logout } = useAuth();
  const navigate = useNavigate();

  const [isSwitching, setIsSwitching] = React.useState(false);

  // Role switching controls are enabled strictly in development/demo mode
  const isDemoOrDev = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
  if (!isDemoOrDev) {
    return null;
  }

  const roles: { role: UserRole; label: string; icon: any; route: string; color: string }[] = [
    { role: 'customer', label: 'Customer', icon: User, route: '/customer', color: 'bg-blue-600 text-white' },
    { role: 'delivery', label: 'Delivery Staff', icon: Truck, route: '/delivery', color: 'bg-emerald-600 text-white' },
    { role: 'manager', label: 'Store Manager', icon: Scale, route: '/manager', color: 'bg-purple-600 text-white' },
    { role: 'owner', label: 'Owner / Admin', icon: Shield, route: '/admin', color: 'bg-amber-600 text-white' },
  ];

  const handleRoleChange = async (role: UserRole, route: string) => {
    setIsSwitching(true);
    try {
      await switchDemoRole(role);
      navigate(route);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="bg-slate-900 text-slate-200 text-xs py-2 px-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
          Active Role:
        </span>
        <span className="font-bold text-white capitalize bg-slate-800 px-2 py-0.5 rounded text-[11px] border border-slate-700">
          {currentUser?.full_name || 'Guest'} ({currentUser?.role || 'customer'})
        </span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          title="View Public Landing Page"
        >
          <span>🌐 Public Website</span>
        </button>
        <span className="text-slate-400 text-[10px] hidden sm:inline">| Switch Demo Role:</span>
        {roles.map((r) => {
          const Icon = r.icon;
          const isActive = currentUser?.role === r.role;
          return (
            <button
              key={r.role}
              onClick={() => handleRoleChange(r.role, r.route)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                isActive
                  ? `${r.color} font-bold shadow-sm`
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{r.label}</span>
            </button>
          );
        })}

        {currentUser && (
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Log Out"
            className="p-1 text-slate-400 hover:text-red-400 ml-1 rounded hover:bg-slate-800 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
