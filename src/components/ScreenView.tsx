import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable,
  screenState,
  screenLive,
  screenWatch,
  screenAsk,
  getGhostCapture,
  executeDesktop2,
} from '../lib/backend';
import {
  Monitor,
  Eye,
  EyeOff,
  Camera,
  Send,
  Globe,
  Image,
  Laptop,
  RefreshCw,
  Loader2,
  AlertCircle,
  MousePointer,
} from 'lucide-react';

export function ScreenView() {
  const { avatar, backendOnline, screenWatching, setScreenWatching, screenState: storeScreenState } = useAppStore();
  const accent = avatar.accent;

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [liveData, setLiveData] = useState<Record<string, unknown> | null>(null);
  const [ghostImage, setGhostImage] = useState<string | null>(null);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  // Refresh screen state
  const refreshState = async () => {
    if (!(await isBackendAvailable())) return;
    try {
      const s = await screenState();
      setLiveData(s);
      setStateError(null);
    } catch (e) {
      setStateError((e as Error).message);
    }
  };

  // Toggle watching
  const toggleWatch = async () => {
    if (!(await isBackendAvailable())) return;
    try {
      setWatchError(null);
      await screenWatch(!screenWatching);
      setScreenWatching(!screenWatching);
      if (!screenWatching) refreshState();
    } catch (e) {
      setWatchError((e as Error).message);
    }
  };

  // Fetch live data periodically when watching
  useEffect(() => {
    if (!screenWatching || !backendOnline) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const s = await screenLive();
        if (!cancelled) setLiveData(s as Record<string, unknown>);
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [screenWatching, backendOnline]);

  // Fetch ghost capture
  const fetchGhost = async () => {
    if (!(await isBackendAvailable())) return;
    setGhostLoading(true);
    try {
      const r = await getGhostCapture();
      setGhostImage(r.image);
    } catch { /* silent */ }
    setGhostLoading(false);
  };

  // Ask about screen
  const handleAsk = async () => {
    if (!askInput.trim() || !(await isBackendAvailable())) return;
    setAskLoading(true);
    setAskError(null);
    try {
      const r = await screenAsk(askInput.trim());
      setAskAnswer(r.answer);
    } catch (e) {
      setAskError((e as Error).message);
      setAskAnswer(null);
    }
    setAskLoading(false);
  };

  // Execute desktop action
  const execDesktop = async (action: string) => {
    if (!(await isBackendAvailable())) return;
    setActionLoading(action);
    setActionResult(null);
    try {
      const r = await executeDesktop2(action);
      setActionResult(String(r));
    } catch (e) {
      setActionResult(`Error: ${(e as Error).message}`);
    }
    setActionLoading(null);
  };

  // GSAP entrance
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current.querySelectorAll('.screen-block'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.06 }, '-=0.15');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  // Fetch initial state
  useEffect(() => {
    refreshState();
  }, []);

  const stateData = liveData || storeScreenState;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        ref={headerRef}
        className="px-6 py-5 hairline-b flex items-end justify-between gap-4"
        style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      >
        <div>
          <h1
            className="hero-heading font-black uppercase tracking-tight leading-none"
            style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}
          >
            Screen Awareness
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Live screen monitoring, ghost capture, and desktop actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg"
            style={{
              background: backendOnline ? '#22c55e1c' : 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              color: backendOnline ? '#22c55e' : 'var(--text-dim)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: backendOnline ? '#22c55e' : 'var(--text-faint)',
                boxShadow: backendOnline ? '0 0 8px rgba(34,197,94,0.9)' : 'none',
              }}
            />
            {backendOnline ? 'Backend online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>

        {/* Toggle watching */}
        <div
          className="screen-block card p-5 mb-5"
          style={{
            background: `linear-gradient(135deg, ${accent}1e, transparent 70%)`,
            border: `1px solid ${accent}44`,
          }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: accent, color: '#fff' }}
              >
                {screenWatching ? <Eye size={16} /> : <EyeOff size={16} />}
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-faint)' }}>
                  Screen watching
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                  {screenWatching ? 'Active' : 'Disabled'}
                </p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                  {screenWatching ? 'Polling screen state every 3 seconds' : 'Enable to monitor the active window and desktop state'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleWatch}
              className="h-10 px-5 rounded-xl flex items-center gap-2 text-sm font-semibold"
              style={{
                background: screenWatching ? '#ef4444' : accent,
                color: '#fff',
                border: 'none',
                fontFamily: 'var(--font)',
              }}
            >
              {screenWatching ? <EyeOff size={14} /> : <Eye size={14} />}
              {screenWatching ? 'Stop watching' : 'Start watching'}
            </button>
          </div>
          {watchError && (
            <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: '#ef4444' }}>
              <AlertCircle size={12} /> {watchError}
            </div>
          )}
        </div>

        {/* Screen state */}
        <div className="screen-block card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Monitor size={15} style={{ color: accent }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Screen State
              </p>
            </div>
            <button
              onClick={refreshState}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {stateError ? (
            <div className="flex items-center gap-2 text-[11px] px-3 py-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={12} /> {stateError}
            </div>
          ) : stateData ? (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
              {Object.entries(stateData).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-3 py-2.5 text-[12px]"
                  style={{ borderTop: '1px solid var(--hairline)', background: 'rgba(255,255,255,0.015)' }}
                >
                  <span className="font-medium" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
                    {key}
                  </span>
                  <span className="font-light text-right" style={{ color: 'var(--text-primary)' }}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] py-4 text-center" style={{ color: 'var(--text-faint)' }}>
              {screenWatching ? (
                <span className="flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Waiting for data…</span>
              ) : (
                'Enable screen watching to see live state data.'
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Ghost capture */}
          <div className="screen-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Camera size={15} style={{ color: accent }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Ghost Capture
              </p>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
              Discrete desktop screenshot for analysis.
            </p>
            <button
              onClick={fetchGhost}
              disabled={ghostLoading}
              className="w-full h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold mb-3"
              style={{
                background: accent,
                color: '#fff',
                border: 'none',
                fontFamily: 'var(--font)',
                opacity: ghostLoading ? 0.6 : 1,
              }}
            >
              {ghostLoading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {ghostLoading ? 'Capturing…' : 'Capture'}
            </button>
            {ghostImage ? (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
                <img
                  src={ghostImage.startsWith('data:') ? ghostImage : `data:image/png;base64,${ghostImage}`}
                  alt="Ghost capture"
                  className="w-full h-auto block"
                  style={{ maxHeight: 240, objectFit: 'contain', background: '#000' }}
                />
              </div>
            ) : (
              <div
                className="rounded-xl flex items-center justify-center py-10"
                style={{ border: '1px dashed var(--hairline-strong)', color: 'var(--text-faint)' }}
              >
                <span className="text-[11px] flex items-center gap-2">
                  <Image size={12} /> No capture yet
                </span>
              </div>
            )}
          </div>

          {/* Ask about screen */}
          <div className="screen-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Send size={15} style={{ color: accent }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Ask About Screen
              </p>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-faint)' }}>
              Ask the AI what it sees on your screen.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="e.g. What app is open?"
                className="flex-1 h-10 px-3 rounded-xl text-sm outline-none"
                style={{
                  background: 'rgba(0,0,0,0.28)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font)',
                }}
                disabled={askLoading}
              />
              <button
                onClick={handleAsk}
                disabled={!askInput.trim() || askLoading}
                className="h-10 px-4 rounded-xl flex items-center gap-1.5 text-sm font-semibold"
                style={{
                  background: accent,
                  color: '#fff',
                  border: 'none',
                  fontFamily: 'var(--font)',
                  opacity: !askInput.trim() || askLoading ? 0.5 : 1,
                }}
              >
                {askLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Ask
              </button>
            </div>
            {askError && (
              <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: '#ef4444' }}>
                <AlertCircle size={12} /> {askError}
              </div>
            )}
            {askAnswer && (
              <div
                className="rounded-xl p-3 text-[12px] leading-relaxed"
                style={{
                  background: 'rgba(0,0,0,0.28)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font)',
                }}
              >
                {askAnswer}
              </div>
            )}
          </div>
        </div>

        {/* Desktop actions */}
        <div className="screen-block card p-5 mt-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Laptop size={15} style={{ color: accent }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
              Desktop Actions
            </p>
          </div>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-faint)' }}>
            Quick actions for the ghost desktop browser.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'launchBrowser', label: 'Launch Browser', icon: Globe },
              { id: 'navigate', label: 'Navigate', icon: MousePointer },
              { id: 'screenshot', label: 'Screenshot', icon: Camera },
              { id: 'snapshot', label: 'Snapshot', icon: Camera },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => execDesktop(id)}
                disabled={actionLoading !== null}
                className="h-20 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors"
                style={{
                  background: actionLoading === id ? `${accent}22` : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${actionLoading === id ? `${accent}55` : 'var(--hairline-strong)'}`,
                  color: actionLoading === id ? accent : 'var(--text-primary)',
                  fontFamily: 'var(--font)',
                  opacity: actionLoading !== null && actionLoading !== id ? 0.4 : 1,
                }}
              >
                {actionLoading === id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Icon size={18} />
                )}
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>
          {actionResult && (
            <div
              className="mt-3 rounded-xl p-3 text-[11px] font-mono leading-relaxed"
              style={{
                background: 'rgba(0,0,0,0.28)',
                border: '1px solid var(--hairline)',
                color: 'var(--text-dim)',
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {actionResult}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
