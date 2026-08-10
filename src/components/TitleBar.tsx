import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';

export function TitleBar() {
  const { avatar, agents } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  const desktopPlatform = (window as unknown as { umbraDesktop?: { platform?: string } }).umbraDesktop?.platform;

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-center justify-between px-4 select-none hairline-b"
      style={{ height: 44, background: 'rgba(6,7,9,0.7)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full" style={{ background: '#C0443C' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#C09A3C' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#3FA354' }} />
      </div>

      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full accent-fill flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="hero-heading text-sm font-bold uppercase tracking-[0.25em]">UmbraOS</span>
      </div>

      <div className="flex items-center gap-2">
        {desktopPlatform && (
          <span
            className="text-[11px] font-medium uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--hairline)' }}
            title="Running as a desktop app — F12 for DevTools, Ctrl+R to reload"
          >
            desktop
          </span>
        )}
        <span className="text-[11px] font-medium uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--hairline)' }}>
          {agents.length} agents
        </span>
        <span
          className="text-[11px] font-medium uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5"
          style={{ background: 'var(--surface-2)', color: avatar.accent, border: `1px solid ${avatar.accent}44` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: avatar.accent, animation: 'titlebar-pulse 1.4s infinite' }} />
          online
        </span>
      </div>

      <style>{`
        @keyframes titlebar-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
