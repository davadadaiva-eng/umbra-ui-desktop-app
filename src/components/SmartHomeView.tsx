import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  fetchSmartHomeDevices,
  sendSwitchCommand,
  isSmartThingsConfigured,
  type SmartHomeDevice,
  type SwitchCommand,
  SmartThingsError,
} from '../lib/smartthings';
import {
  Lightbulb, Plug, ToggleLeft, Thermometer, Lock, Radio, HelpCircle, RefreshCw,
  Loader2, House, Wifi, WifiOff, AlertCircle, X,
} from 'lucide-react';

const KIND_ICONS: Record<SmartHomeDevice['kind'], typeof Lightbulb> = {
  light: Lightbulb,
  switch: ToggleLeft,
  plug: Plug,
  thermostat: Thermometer,
  lock: Lock,
  sensor: Radio,
  device: HelpCircle,
};

type FilterId = 'all' | 'switch' | 'light' | 'plug' | 'thermostat' | 'lock' | 'sensor';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'switch', label: 'Switches' },
  { id: 'light', label: 'Lights' },
  { id: 'plug', label: 'Plugs' },
  { id: 'thermostat', label: 'Climate' },
  { id: 'lock', label: 'Locks' },
  { id: 'sensor', label: 'Sensors' },
];

export function SmartHomeView() {
  const { avatar, addJournal } = useAppStore();
  const [devices, setDevices] = useState<SmartHomeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      setConfigured(isSmartThingsConfigured());
      const data = await fetchSmartHomeDevices();
      setDevices(data);
    } catch (e) {
      const msg = e instanceof SmartThingsError ? e.message : 'Failed to reach SmartThings';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Entrance animation matching the other views.
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (gridRef.current) {
        const cards = gridRef.current.querySelectorAll('.sm-card');
        tl.fromTo(cards, { opacity: 0, y: 16, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, stagger: 0.05 }, '-=0.15');
      }
    }, [headerRef, gridRef]);
    return () => ctx.revert();
  }, [devices.length > 0, filter]);

  const filtered = useMemo(
    () => (filter === 'all' ? devices : devices.filter((d) => d.kind === filter)),
    [devices, filter],
  );

  const onlineCount = devices.filter((d) => d.online).length;
  const switchCount = devices.filter((d) => d.switchCapable).length;
  const onCount = devices.filter((d) => d.switchState === 'on').length;
  const availableFilters = FILTERS.filter((f) =>
    f.id === 'all' || devices.some((d) => d.kind === f.id),
  );

  const handleToggle = async (device: SmartHomeDevice, next: SwitchCommand) => {
    if (!device.switchCapable || pending.has(device.id)) return;
    // Optimistic update
    setDevices((cur) => cur.map((d) => (d.id === device.id ? { ...d, switchState: next } : d)));
    setPending((cur) => new Set(cur).add(device.id));
    try {
      await sendSwitchCommand(device.id, next);
      addJournal('action', `Smart home: turned ${next} ${device.name}`);
    } catch (e) {
      // Revert on failure and show the real state
      setDevices((cur) => cur.map((d) => (d.id === device.id ? { ...d, switchState: device.switchState } : d)));
      const msg = e instanceof SmartThingsError ? e.message : 'Command failed';
      showToast('error', `${device.name}: ${msg}`);
    } finally {
      setPending((cur) => {
        const nextSet = new Set(cur);
        nextSet.delete(device.id);
        return nextSet;
      });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <div
        ref={headerRef}
        className="px-6 py-5 hairline-b flex items-end justify-between gap-4 flex-shrink-0"
        style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      >
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>
            Smart Home
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {loading ? 'Connecting to SmartThings…' : `${devices.length} devices · ${onCount} on · ${onlineCount}/${devices.length} online · ${switchCount} controllable`}
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3.5 rounded-xl flex-shrink-0"
          style={{
            height: 34,
            background: `${avatar.accent}1c`,
            color: avatar.accent,
            border: `1px solid ${avatar.accent}44`,
            fontFamily: 'var(--font)',
            fontSize: 12,
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>
        {/* ═══ NOT CONFIGURED ═══ */}
        {!loading && !configured && (
          <div className="card p-6 flex items-start gap-3" style={{ background: 'var(--surface-1)' }}>
            <AlertCircle size={18} style={{ color: '#fbbf24', marginTop: 2, flexShrink: 0 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>SmartThings token missing</p>
              <p className="text-xs mt-1 font-light leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                Create a personal access token at <span style={{ color: avatar.accent }}>account.smartthings.com/tokens</span> (scopes: <b>devices</b> and <b>rooms</b>),
                then set <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}>SMARTTHINGS_TOKEN</code> in the app environment
                (or <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-primary)' }}>VITE_SMARTTHINGS_TOKEN</code> for browser dev) and restart.
              </p>
            </div>
          </div>
        )}

        {/* ═══ ERROR BANNER ═══ */}
        {error && (
          <div className="card p-4 mb-4 flex items-center justify-between" style={{ background: 'var(--surface-1)', borderColor: 'rgba(239,68,68,0.35)' }}>
            <div className="flex items-center gap-2.5">
              <WifiOff size={15} style={{ color: '#ef4444' }} />
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{error}</p>
            </div>
            <button
              onClick={() => void load(true)}
              className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontFamily: 'var(--font)' }}
            >
              <RefreshCw size={10} /> Retry
            </button>
          </div>
        )}

        {/* ═══ FILTER CHIPS ═══ */}
        {!loading && devices.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {availableFilters.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    background: active ? `${avatar.accent}1c` : 'var(--surface-2)',
                    color: active ? avatar.accent : 'var(--text-dim)',
                    border: `1px solid ${active ? `${avatar.accent}44` : 'var(--hairline-strong)'}`,
                    fontFamily: 'var(--font)',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ═══ DEVICE GRID ═══ */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card p-4" style={{ background: 'var(--surface-1)' }}>
                <div className="w-10 h-10 rounded-full mb-3 animate-pulse" style={{ background: 'var(--surface-3)' }} />
                <div className="h-3 rounded mb-2 animate-pulse" style={{ background: 'var(--surface-3)', width: '70%' }} />
                <div className="h-2.5 rounded animate-pulse" style={{ background: 'var(--surface-2)', width: '45%' }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 flex flex-col items-center justify-center text-center" style={{ background: 'var(--surface-1)' }}>
            <House size={30} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {devices.length === 0 ? 'No devices found' : `No ${filter === 'all' ? '' : filter + ' '}devices`}
            </p>
            <p className="text-xs mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
              {devices.length === 0 ? 'Connect devices in the SmartThings app and press Refresh.' : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((d) => {
              const Icon = KIND_ICONS[d.kind];
              const isOn = d.switchState === 'on';
              const busy = pending.has(d.id);
              return (
                <div key={d.id} className="sm-card card card-hover p-4 flex flex-col" style={{ background: 'var(--surface-1)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: isOn ? `${avatar.accent}1c` : 'var(--surface-2)',
                        border: `1px solid ${isOn ? `${avatar.accent}44` : 'var(--hairline)'}`,
                      }}
                    >
                      <Icon size={18} style={{ color: isOn ? avatar.accent : 'var(--text-faint)' }} />
                    </div>
                    <span
                      title={d.online ? 'Online' : 'Status unknown'}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: d.online ? '#22c55e' : 'var(--text-faint)', boxShadow: d.online ? '0 0 6px rgba(34,197,94,0.5)' : 'none' }}
                    />
                  </div>

                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                  <p className="text-[11px] font-light mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                    {d.room} · {d.kind !== 'device' ? d.kind : d.manufacturer}
                  </p>

                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                      {!d.switchCapable ? 'No switch' : d.switchState === null ? '—' : isOn ? 'ON' : 'OFF'}
                    </span>
                    {d.switchCapable ? (
                      <button
                        onClick={() => void handleToggle(d, isOn ? 'off' : 'on')}
                        disabled={busy}
                        className="relative rounded-full transition-all"
                        style={{
                          width: 42,
                          height: 24,
                          background: isOn ? 'var(--accent-gradient)' : 'var(--surface-3)',
                          border: `1px solid ${isOn ? 'transparent' : 'var(--hairline-strong)'}`,
                          boxShadow: isOn ? '0 0 14px rgba(59,130,246,0.35)' : 'none',
                          cursor: busy ? 'wait' : 'pointer',
                          opacity: busy ? 0.7 : 1,
                        }}
                        aria-label={`Turn ${isOn ? 'off' : 'on'} ${d.name}`}
                      >
                        <span
                          className="absolute top-1/2 rounded-full"
                          style={{
                            width: 18,
                            height: 18,
                            background: '#fff',
                            transform: `translate(${isOn ? 20 : 2}px, -50%)`,
                            transition: 'transform 0.18s ease',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                          }}
                        />
                      </button>
                    ) : (
                      <Wifi size={13} style={{ color: 'var(--text-faint)' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{
            transform: 'translateX(-50%)',
            background: 'var(--surface-3)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}
        >
          {toast.type === 'success'
            ? <Wifi size={13} style={{ color: '#22c55e' }} />
            : <X size={13} style={{ color: '#ef4444' }} />}
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
