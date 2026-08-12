import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { VerifyCodeBox } from './VerifyCodeBox';
import { Typewriter } from './Typewriter';
import { LogOut } from 'lucide-react';

export function CodeVerificationScreen() {
  const { user, logout } = useAppStore();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(rootRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden" style={{ background: 'transparent', opacity: 0 }}>
      <div
        className="absolute w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(37,99,235,0.06) 40%, transparent 70%)',
          top: '-25%',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      <div className="relative w-full max-w-md px-6">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 orb flex items-center justify-center"
            style={{ background: 'var(--accent-gradient)', border: 'none', boxShadow: '0 0 40px rgba(59,130,246,0.4)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 5vw, 2.6rem)' }}>
            One last step
          </h1>
          <div className="mt-3 flex justify-center" style={{ minHeight: 40 }}>
            <Typewriter texts={['verify it’s really you', 'secure your account', 'then let’s build your brain']} fontSize="clamp(0.9rem, 2.4vw, 1.1rem)" fontWeight={300} letterSpacing="0.02em" typedColor="var(--text-dim)" cursorColor="var(--accent-a)" />
          </div>
        </div>

        <div className="glass rounded-3xl p-8" style={{ background: 'rgba(23,23,23,0.7)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Verify {user?.email}
          </h2>
          <VerifyCodeBox email={user?.email ?? ''} />
        </div>

        <div className="flex justify-center mt-6">
          <button onClick={() => void logout()} className="btn-ghost flex items-center gap-1.5" style={{ height: 34, fontSize: 12 }}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}