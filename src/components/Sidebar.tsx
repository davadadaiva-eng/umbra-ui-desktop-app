import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useAppStore, type View } from '../stores/appStore';
import { Bookmark, Brain, Settings, LogOut, Bot, Smartphone, Wrench, Lock, Plug, BarChart3, Phone, Monitor, Video, ChevronLeft, ChevronRight } from 'lucide-react';

const navItems: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'agent', label: 'Agent', icon: <Bot size={16} /> },
  { id: 'connectors', label: 'Connectors', icon: <Plug size={16} /> },
  { id: 'vault', label: 'Vault', icon: <Lock size={16} /> },
  { id: 'devices', label: 'Devices', icon: <Smartphone size={16} /> },
  { id: 'brain', label: 'Brain', icon: <Brain size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  { id: 'meetings', label: 'Meetings', icon: <Video size={16} /> },
  { id: 'recall', label: 'Recall', icon: <Bookmark size={16} /> },
  { id: 'skills', label: 'Skills', icon: <Wrench size={16} /> },
  { id: 'usage', label: 'Usage', icon: <BarChart3 size={16} /> },
  { id: 'phone', label: 'AgentPhone', icon: <Phone size={16} /> },
  { id: 'desktop2', label: 'Desktop 2', icon: <Monitor size={16} /> },
];

export function Sidebar() {
  const { currentView, setView, user, logout, avatar, isSidebarCollapsed, toggleSidebar } = useAppStore();
  const navRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const collapsed = isSidebarCollapsed;

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (navRef.current) {
        const items = navRef.current.querySelectorAll('.nav-item');
        gsap.fromTo(items, { opacity: 0, x: -10 }, { opacity: 1, x: 0, stagger: 0.04, duration: 0.35, ease: 'power2.out' });
      }
      if (bottomRef.current) {
        gsap.fromTo(bottomRef.current, { opacity: 0 }, { opacity: 1, duration: 0.35, delay: 0.25, ease: 'power2.out' });
      }
    }, [navRef, bottomRef]);
    return () => ctx.revert();
  }, []);

  return (
    <div
      className="flex flex-col h-full hairline-r relative"
      style={{
        width: collapsed ? 58 : 220,
        background: 'rgba(6,7,9,0.7)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        transition: 'width 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        flexShrink: 0,
      }}
    >
      <div
        ref={navRef}
        className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden"
        style={{ display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch' }}
      >
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              title={collapsed ? item.label : undefined}
              className="nav-item relative flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl transition-all duration-150"
              style={{
                background: isActive ? 'var(--surface-3)' : 'transparent',
                border: isActive ? `1px solid ${avatar.accent}55` : '1px solid transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-dim)',
                fontWeight: isActive ? 500 : 400,
                justifyContent: collapsed ? 'center' : undefined,
                paddingLeft: collapsed ? 0 : undefined,
                paddingRight: collapsed ? 0 : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--veil)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                  style={{ height: 18, background: avatar.accent, boxShadow: `0 0 10px ${avatar.accent}66` }}
                />
              )}
              <span className="flex-shrink-0" style={{ color: isActive ? avatar.accent : 'var(--text-faint)' }}>{item.icon}</span>
              {!collapsed && (
                <span className="text-sm truncate min-w-0" style={{ fontFamily: 'var(--font)' }}>{item.label}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        ref={bottomRef}
        className="px-3 py-3 hairline-b"
        style={{ background: 'transparent', display: 'flex', justifyContent: collapsed ? 'center' : undefined }}
      >
        <div className="flex items-center gap-3 px-1.5 py-2" style={{ width: collapsed ? undefined : '100%' }}>
          <span
            className="flex-shrink-0 rounded-full"
            style={{
              width: 34,
              height: 34,
              background: `radial-gradient(circle at 32% 30%, ${avatar.accent}, ${avatar.accent}55 70%, transparent 75%), var(--surface-2)`,
              border: `1px solid ${avatar.accent}44`,
              boxShadow: `0 0 14px ${avatar.accent}33`,
            }}
          />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.name || 'User'}</p>
                <p className="text-[11px] truncate font-light" style={{ color: 'var(--text-faint)' }}>{user?.email || ''}</p>
              </div>
              <button
                onClick={logout}
                className="btn-ghost flex-shrink-0"
                style={{ width: 30, height: 30, padding: 0 }}
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      <button
        onClick={toggleSidebar}
        className="absolute flex items-center justify-center rounded-full z-50"
        style={{
          top: '50%',
          right: -15,
          transform: 'translateY(-50%)',
          width: 28,
          height: 28,
          background: 'var(--surface-3)',
          border: '1px solid var(--hairline-strong)',
          color: 'var(--text-dim)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          transition: 'color 0.2s',
        }}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
        onMouseEnter={(e) => (e.currentTarget.style.color = avatar.accent)}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </div>
  );
}
