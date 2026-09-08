import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable,
  requestConsent,
  armEmergencyStop,
  disarmEmergencyStop,
} from '../lib/backend';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Clock,
  Info,
  Zap,
} from 'lucide-react';

interface LogEntry {
  id: number;
  action: string;
  detail: string;
  ts: number;
  success: boolean;
}

export function ConsentView() {
  const { avatar, consentState, refreshConsent } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reasonInput, setReasonInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  const addLog = useCallback((action: string, detail: string, success: boolean) => {
    logIdRef.current += 1;
    setLogs((prev) => [{ id: logIdRef.current, action, detail, ts: Date.now(), success }, ...prev].slice(0, 50));
  }, []);

  const fetchConsent = useCallback(async () => {
    if (!(await isBackendAvailable())) {
      setError('Backend offline — start the backend to manage consent.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await refreshConsent();
    } catch (e) {
      setError((e as Error).message || 'Failed to fetch consent state');
    } finally {
      setLoading(false);
    }
  }, [refreshConsent]);

  useEffect(() => {
    fetchConsent();
  }, [fetchConsent]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.45 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        const cards = bodyRef.current.querySelectorAll('.consent-card');
        tl.fromTo(cards, { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.06 }, '-=0.15');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  const handleArmDisarm = async () => {
    if (!consentState || toggling) return;
    setToggling(true);
    try {
      if (consentState.emergencyStopArmed) {
        await disarmEmergencyStop();
        addLog('Disarm', 'Emergency stop disarmed', true);
      } else {
        await armEmergencyStop();
        addLog('Arm', 'Emergency stop armed', true);
      }
      await refreshConsent();
    } catch (e) {
      addLog('Toggle', (e as Error).message || 'Toggle failed', false);
    } finally {
      setToggling(false);
    }
  };

  const handleRequestConsent = async () => {
    if (requesting || !reasonInput.trim()) return;
    setRequesting(true);
    try {
      const res = await requestConsent(reasonInput.trim());
      addLog('Request', res.result || 'Consent requested', true);
      setReasonInput('');
      await refreshConsent();
    } catch (e) {
      addLog('Request', (e as Error).message || 'Request failed', false);
    } finally {
      setRequesting(false);
    }
  };

  const consentLabel = consentState
    ? consentState.granted
      ? 'Granted'
      : consentState.denied
        ? 'Denied'
        : consentState.askOncePerSession
          ? 'Ask once per session'
          : 'No consent'
    : '—';

  const consentColor = consentState
    ? consentState.granted
      ? '#22C55E'
      : consentState.denied
        ? '#EF4444'
        : '#F59E0B'
    : 'var(--text-faint)';

  const consentIcon = consentState
    ? consentState.granted
      ? <ShieldCheck size={15} />
      : consentState.denied
        ? <XCircle size={15} />
        : <AlertTriangle size={15} />
    : <Shield size={15} />;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>
          Consent & Safety
        </h1>
        <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>Emergency stop, consent management and safety controls</p>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>

        {/* Emergency Stop Card */}
        <div className="consent-card card p-5 mb-4" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: consentState?.emergencyStopArmed ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: consentState?.emergencyStopArmed ? '#EF4444' : '#22C55E',
                border: `1px solid ${consentState?.emergencyStopArmed ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
              }}
            >
              {consentState?.emergencyStopArmed ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Emergency Stop</p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                {consentState?.emergencyStopArmed
                  ? 'Armed — will halt all active tasks and agent actions immediately'
                  : 'Disarmed — agent operates normally'}
              </p>
            </div>
            <span
              className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: consentState?.emergencyStopArmed ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: consentState?.emergencyStopArmed ? '#EF4444' : '#22C55E',
                border: `1px solid ${consentState?.emergencyStopArmed ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              }}
            >
              {consentState?.emergencyStopArmed ? 'ARMED' : 'DISARMED'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleArmDisarm}
              disabled={!consentState || toggling}
              className="flex items-center gap-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
              style={{
                height: 42,
                padding: '0 24px',
                background: consentState?.emergencyStopArmed ? '#22C55E' : '#EF4444',
                color: '#fff',
                border: 'none',
                fontFamily: 'var(--font)',
                boxShadow: `0 0 20px ${consentState?.emergencyStopArmed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              {toggling ? (
                <Loader2 size={15} className="animate-spin" />
              ) : consentState?.emergencyStopArmed ? (
                <ShieldCheck size={15} />
              ) : (
                <ShieldAlert size={15} />
              )}
              {consentState?.emergencyStopArmed ? 'Disarm Emergency Stop' : 'Arm Emergency Stop'}
            </button>
          </div>
        </div>

        {/* Consent State Card */}
        <div className="consent-card card p-5 mb-4" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${consentColor}1c`, color: consentColor, border: `1px solid ${consentColor}44` }}
            >
              {consentIcon}
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consent State</p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                Current consent grant status for agent operations
              </p>
            </div>
            <span
              className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: `${consentColor}18`, color: consentColor, border: `1px solid ${consentColor}33` }}
            >
              {consentLabel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {consentState?.granted ? (
                  <CheckCircle2 size={13} style={{ color: '#22C55E' }} />
                ) : (
                  <XCircle size={13} style={{ color: 'var(--text-faint)' }} />
                )}
                <span className="text-xs font-semibold" style={{ color: consentState?.granted ? '#22C55E' : 'var(--text-dim)' }}>
                  Granted
                </span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Agent can proceed</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {consentState?.denied ? (
                  <XCircle size={13} style={{ color: '#EF4444' }} />
                ) : (
                  <XCircle size={13} style={{ color: 'var(--text-faint)' }} />
                )}
                <span className="text-xs font-semibold" style={{ color: consentState?.denied ? '#EF4444' : 'var(--text-dim)' }}>
                  Denied
                </span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Agent blocked</p>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {consentState?.askOncePerSession ? (
                  <AlertTriangle size={13} style={{ color: '#F59E0B' }} />
                ) : (
                  <AlertTriangle size={13} style={{ color: 'var(--text-faint)' }} />
                )}
                <span className="text-xs font-semibold" style={{ color: consentState?.askOncePerSession ? '#F59E0B' : 'var(--text-dim)' }}>
                  Ask Once
                </span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Per session</p>
            </div>
          </div>

          <button
            onClick={fetchConsent}
            disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            style={{ height: 32 }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: '#EF4444' }}>
              <XCircle size={12} />
              {error}
            </p>
          )}
        </div>

        {/* Request Consent Card */}
        <div className="consent-card card p-5 mb-4" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}
            >
              <Zap size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Request Consent</p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                Send a consent request to the backend with a reason
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRequestConsent(); }}
              placeholder="Reason for consent request…"
              className="flex-1 px-3 rounded-lg text-sm outline-none"
              style={{
                height: 38,
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline-strong)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font)',
              }}
            />
            <button
              onClick={handleRequestConsent}
              disabled={requesting || !reasonInput.trim()}
              className="flex items-center gap-1.5 text-sm font-medium rounded-lg transition-opacity disabled:opacity-50"
              style={{ height: 38, padding: '0 16px', background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
            >
              {requesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Request
            </button>
          </div>
        </div>

        {/* Safety Info Card */}
        <div className="consent-card card p-5 mb-4" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--surface-2)', color: '#60A5FA', border: '1px solid var(--hairline-strong)' }}
            >
              <Info size={15} />
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>How Safety Works</p>
          </div>

          <div className="space-y-3">
            {[
              {
                title: 'Emergency Stop',
                desc: 'When armed, all active tasks, agent actions and background processes are halted immediately. Arm it before any sensitive operation. Disarm to resume normal behavior.',
                icon: <ShieldAlert size={13} />,
                tone: '#EF4444',
              },
              {
                title: 'Consent State',
                desc: 'Controls whether the agent is allowed to take actions on your behalf. "Granted" means full access, "Denied" blocks all actions, "Ask Once Per Session" prompts you before each action.',
                icon: <Shield size={13} />,
                tone: '#60A5FA',
              },
              {
                title: 'Request Consent',
                desc: 'Send a request to the backend with a reason. The backend will evaluate it and update the consent state. Use this to proactively grant or request access for specific operations.',
                icon: <Zap size={13} />,
                tone: avatar.accent,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}
              >
                <span className="mt-0.5 flex-shrink-0" style={{ color: item.tone }}>{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{item.title}</p>
                  <p className="text-[11px] font-light leading-snug mt-0.5" style={{ color: 'var(--text-dim)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Consent Log */}
        <div className="consent-card card p-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--hairline-strong)' }}
            >
              <Clock size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activity Log</p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>Recent consent and safety actions</p>
            </div>
          </div>

          {logs.length === 0 ? (
            <p className="text-[12px] font-light leading-relaxed py-3 text-center" style={{ color: 'var(--text-faint)' }}>
              No activity yet — arm/disarm the emergency stop or request consent to see events here.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}
                >
                  <span className="flex-shrink-0" style={{ color: log.success ? '#22C55E' : '#EF4444' }}>
                    {log.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                      {log.action}
                    </span>
                    <span className="text-[11px] font-light ml-2" style={{ color: 'var(--text-dim)' }}>
                      {log.detail}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    {formatTime(log.ts)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
