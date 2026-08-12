import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Check, Mic, Bell, ArrowRight, ArrowLeft } from 'lucide-react';

const questions = [
  { id: 'heard', label: 'Where did you hear about Umbra OS?', placeholder: 'e.g. a friend, Twitter, a newsletter…' },
  { id: 'use', label: 'What will you use Umbra OS for?', placeholder: 'e.g. ideas, notes, building things, assistant…' },
  { id: 'work', label: 'What do you do?', placeholder: 'e.g. designer, developer, student, founder…' },
  { id: 'self', label: 'How would you describe yourself?', placeholder: 'e.g. curious, calm, fast-paced, night owl…' },
] as const;

const PERMISSIONS = [
  { id: 'mic', label: 'Microphone', hint: 'so you can talk to your agent hands-free', icon: Mic },
  { id: 'notify', label: 'Notifications', hint: 'so Umbra can nudge you when something is done', icon: Bell },
] as const;

export function OnboardingScreen() {
  const { user, finishOnboarding, setProfile, addFact, addBrainFile, addJournal, setTalkAlways } = useAppStore();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(['', '', '', '']);
  const [granted, setGranted] = useState<{ mic: boolean; notify: boolean }>({ mic: false, notify: false });
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const animateIn = (dir: 1 | -1) => {
    gsap.fromTo(cardRef.current, { opacity: 0, x: 22 * dir }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
  };

  const requestPerms = async () => {
    const next = { mic: granted.mic, notify: granted.notify };
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        next.mic = true;
      }
    } catch {
      next.mic = false;
    }
    try {
      if ('Notification' in window) {
        const res = await Notification.requestPermission();
        next.notify = res === 'granted';
      }
    } catch {
      next.notify = false;
    }
    setGranted(next);
  };

  const next = () => {
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
      animateIn(1);
    } else {
      void finish();
    }
  };

  const prev = () => {
    if (step > 0) {
      setStep((s) => s - 1);
      animateIn(-1);
    }
  };

  const finish = async () => {
    setBusy(true);
    const [heard, use, work, self] = answers;
    const name = user?.name?.split(' ')[0]?.trim() || 'friend';
    const factList: { label: string; value: string }[] = [
      { label: 'heard about Umbra OS', value: heard },
      { label: 'will use it for', value: use },
      { label: 'does', value: work },
      { label: 'describes themself as', value: self },
    ].filter((a) => a.value.trim());
    const about = work.trim() ? `I work as ${work.trim()}.` : '';
    const profile = {
      name,
      about: (about + (self.trim() ? ` I'd describe myself as ${self.trim()}.` : '')).trim(),
      facts: factList.map((a) => `${a.label}: ${a.value.trim()}`),
    };
    setProfile(profile);
    for (const f of profile.facts) addFact(f);
    try {
      addBrainFile(
        `about_${name.toLowerCase()}.md`,
        `# ${name}\n\n${profile.about}\n\n## Umbra OS onboarding\n${factList.map((a) => `- ${a.label}: ${a.value.trim()}`).join('\n')}`,
        'text/markdown'
      );
    } catch {
      // ignore
    }
    addJournal('action', `Onboarding complete — brain writing started for ${name}`);
    setTalkAlways(true);
    await requestPerms();
    try {
      await finishOnboarding();
    } finally {
      setBusy(false);
    }
  };

  const q = questions[step];

  return (
    <div ref={rootRef} className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden" style={{ background: 'transparent' }}>
      <div
        className="absolute w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(37,99,235,0.06) 40%, transparent 70%)',
          top: '-25%',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      <div className="relative w-full max-w-lg px-6">
        <div ref={cardRef} className="glass rounded-3xl p-8" style={{ background: 'rgba(23,23,23,0.72)' }}>
          <div className="flex items-center justify-between mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
              Welcome, {user?.name ?? 'friend'} · step {step + 1} of {questions.length}
            </p>
            <span className="flex items-center gap-1">
              {questions.map((_, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= step ? 'var(--accent-a)' : 'var(--hairline-strong)' }} />
              ))}
            </span>
          </div>

          <h1 className="hero-heading font-black uppercase tracking-tight leading-none mb-3" style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)' }}>
            {step < questions.length ? q.label : 'Almost there'}
          </h1>
          <p className="text-sm font-light mb-6" style={{ color: 'var(--text-dim)' }}>
            {step < questions.length
              ? 'This helps Umbra build your memory and give you better answers later. You can change anything later.'
              : 'Let Umbra listen so it can talk with you hands-free — that’s how “talk mode always on” works.'}
          </p>

          {step < questions.length ? (
            <>
              <textarea
                autoFocus
                value={answers[step]}
                onChange={(e) => {
                  const next = answers.slice();
                  next[step] = e.target.value;
                  setAnswers(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    next();
                  }
                }}
                placeholder={q.placeholder}
                rows={3}
                className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <div className="flex items-center justify-between mt-6">
                <button onClick={prev} disabled={step === 0} className="btn-ghost flex items-center gap-1.5" style={{ height: 40, fontSize: 13 }}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  onClick={next}
                  disabled={busy || !answers[step].trim()}
                  className="flex items-center gap-1.5 rounded-2xl px-6 text-sm font-medium transition-transform hover:scale-[1.02] disabled:opacity-40"
                  style={{ height: 42, background: 'var(--accent-gradient)', color: '#fff', fontFamily: 'var(--font)' }}
                >
                  {step === questions.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {PERMISSIONS.map((p) => {
                  const Icon = p.icon;
                  const ok = p.id === 'mic' ? granted.mic : granted.notify;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl" style={{ background: 'var(--surface-2)', border: `1px solid ${ok ? 'rgba(129,199,132,0.4)' : 'var(--hairline-strong)'}` }}>
                      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-3)', color: ok ? '#81C784' : 'var(--text-dim)' }}>
                        <Icon size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.label}</p>
                        <p className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>{p.hint}</p>
                      </div>
                      {ok && <Check size={16} style={{ color: '#81C784' }} />}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-6">
                <button onClick={prev} className="btn-ghost flex items-center gap-1.5" style={{ height: 40, fontSize: 13 }}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  onClick={() => void finish()}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-2xl px-6 text-sm font-medium transition-transform hover:scale-[1.02] disabled:opacity-40"
                  style={{ height: 42, background: 'var(--accent-gradient)', color: '#fff', fontFamily: 'var(--font)' }}
                >
                  <Check size={14} /> Enter UmbraOS
                </button>
              </div>
              <p className="text-center text-xs mt-4" style={{ color: 'var(--text-faint)' }}>
                Talk mode stays on by default — say “{useAppStore.getState().avatarName}, open the brain” any time.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}