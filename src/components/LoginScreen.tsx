import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { resetPassword } from '../lib/auth';
import { Typewriter } from './Typewriter';

type Mode = 'signin' | 'signup';

export function LoginScreen() {
  const { login, signup, isAuthReady } = useAppStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isAuthReady) {
      const t = setTimeout(() => setReady(true), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isAuthReady]);

  useEffect(() => {
    if (error && errRef.current) {
      gsap.fromTo(
        errRef.current,
        { x: 0 },
        { x: 8, duration: 0.05, repeat: 5, yoyo: true, ease: 'power1.inOut', onComplete: () => gsap.set(errRef.current, { x: 0 }) }
      );
      if (cardRef.current) {
        gsap.fromTo(cardRef.current, { x: 0 }, { x: 6, duration: 0.05, repeat: 3, yoyo: true, clearProps: 'x' });
      }
    }
  }, [error]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'signup' && !name.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setIsLoading(true);
    const res = mode === 'signin' ? await login(email, password) : await signup(name, email, password);
    setIsLoading(false);

    if (!res.ok) {
      setError(res.error ?? 'Something went wrong.');
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap “Forgot password”.');
      return;
    }
    setError('');
    setInfo('');
    setIsLoading(true);
    const res = await resetPassword(email);
    setIsLoading(false);
    if (res.ok) setInfo('Password reset link sent — check your inbox.');
    else setError(res.error ?? 'Could not send a reset link.');
  };

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div
          className="orb"
          style={{ width: 56, height: 56, background: 'var(--accent-gradient)', border: 'none', boxShadow: '0 0 40px rgba(59,130,246,0.35)' }}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'transparent' }}
    >
      <div
        className="absolute w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.16) 0%, rgba(37, 99, 235, 0.07) 40%, transparent 70%)',
          top: '-30%',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      <div
        ref={cardRef}
        className="relative w-full max-w-md px-6"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.98)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <div className="text-center mb-10">
          <div
            className="w-24 h-24 rounded-full mx-auto mb-6 orb flex items-center justify-center"
            style={{
              background: 'var(--accent-gradient)',
              border: 'none',
              boxShadow: '0 0 60px rgba(59, 130, 246, 0.45), inset 0 2px 8px rgba(255,255,255,0.25)',
            }}
          >
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="hero-heading text-6xl font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)' }}>
            UmbraOS
          </h1>
          <div className="mt-5 flex justify-center" style={{ minHeight: 64 }}>
            <Typewriter
              texts={['your digital self', 'your agents', 'your voice', 'your second brain']}
              fontSize="clamp(1.1rem, 3vw, 1.6rem)"
              fontWeight={300}
              letterSpacing="0.02em"
              typedColor="var(--text-dim)"
              cursorColor="var(--accent-a)"
            />
          </div>
        </div>

        <>
          <form ref={formRef} onSubmit={handleSubmit} className="glass rounded-3xl p-8 space-y-4" style={{ background: 'rgba(23, 23, 23, 0.7)' }}>
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Davide"
                className="input-field"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field"
              autoFocus={mode === 'signin'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-field"
            />
          </div>

          <div className="flex items-center justify-between" style={{ minHeight: 22 }}>
            <div className="flex-1">
              {error ? (
                <p ref={errRef} className="text-sm" style={{ color: '#FF6B6B' }}>
                  {error}
                </p>
              ) : info ? (
                <p className="text-sm" style={{ color: '#81C784' }}>
                  {info}
                </p>
              ) : null}
            </div>
            {mode === 'signin' && (
              <button type="button" onClick={handleForgot} disabled={isLoading} className="text-xs whitespace-nowrap ml-3" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>
                Forgot password?
              </button>
            )}
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full" style={{ height: 46 }}>
            {isLoading ? (
              <span className="inline-block w-4 h-4 rounded-full border border-current border-t-transparent animate-spin" />
            ) : mode === 'signin' ? (
              'Enter UmbraOS'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <div className="flex items-center justify-center gap-3 mt-8">
          {mode === 'signin' ? (
            <button onClick={() => switchMode('signup')} className="text-sm" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
              No account yet? <span style={{ color: '#60A5FA' }}>Create one</span>
            </button>
          ) : (
            <button onClick={() => switchMode('signin')} className="text-sm" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
              Already have an account? <span style={{ color: '#60A5FA' }}>Sign in</span>
            </button>
          )}
        </div>
        <p className="text-center text-xs mt-3" style={{ color: 'var(--text-faint)' }}>
          Your account lives in the cloud — your conversations and brain stay on this device.
        </p>
          </>
      </div>
    </div>
  );
}