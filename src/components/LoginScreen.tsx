import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Typewriter } from './Typewriter';

export function LoginScreen() {
  const { login } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.5 } });
      tl.fromTo(cardRef.current, { opacity: 0, y: 18, scale: 0.98 }, { opacity: 1, y: 0, scale: 1 });
      if (formRef.current) {
        const inputs = formRef.current.querySelectorAll('input, button');
        tl.fromTo(inputs, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.35 }, '-=0.2');
      }
    }, rootRef);
    return () => ctx.revert();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    const success = await login(email, password);
    if (!success) setError('Invalid credentials');
    setIsLoading(false);
  };

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

      <div ref={cardRef} className="relative w-full max-w-md px-6" style={{ opacity: 0 }}>
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

        <form ref={formRef} onSubmit={handleSubmit} className="glass rounded-3xl p-8 space-y-4" style={{ background: 'rgba(23, 23, 23, 0.7)' }}>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="davide@gmail.com"
              className="input-field"
              autoFocus
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
              placeholder="davide"
              className="input-field"
            />
          </div>

          <div style={{ minHeight: 22 }}>
            {error && (
              <p ref={errRef} className="text-sm" style={{ color: '#FF6B6B' }}>
                Invalid credentials — try again
              </p>
            )}
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full" style={{ height: 46 }}>
            {isLoading ? (
              <span className="inline-block w-4 h-4 rounded-full border border-current border-t-transparent animate-spin" />
            ) : (
              'Enter UmbraOS'
            )}
          </button>
        </form>

        <div className="flex items-center justify-center gap-3 mt-8 opacity-70">
          <span
            className="rounded-full"
            style={{
              width: 30,
              height: 30,
              background: 'radial-gradient(circle at 32% 30%, #3B82F6, #3B82F655 70%, transparent 75%), var(--surface-2)',
              border: '1px solid #3B82F644',
              boxShadow: '0 0 12px #3B82F633',
            }}
          />
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
            demo · davide@gmail.com / davide
          </p>
        </div>
      </div>
    </div>
  );
}
