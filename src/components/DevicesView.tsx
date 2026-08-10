import { useRef, useEffect, useState, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Smartphone, Tablet, Headphones, Watch, ArrowRight, Battery, CheckCircle2, QrCode, Bluetooth, Wifi, Usb, Cloud, Nfc, Router, Plug, Unplug } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  type: string;
  status: 'Connected' | 'Idle';
  battery: number;
  os: string;
  icon: string;
  via: string;
}

interface Connector {
  id: string;
  name: string;
  protocol: string;
  icon: JSX.Element;
  devices: string[];
  status: 'Connected' | 'Syncing' | 'Idle' | 'Off';
  latency: string;
}

const initialDevices: Device[] = [
  { id: 'pixel', name: 'Pixel 8 Pro', type: 'Phone', status: 'Connected', battery: 78, os: 'Android 15', icon: 'phone', via: 'Wi-Fi Direct' },
  { id: 'ipad', name: 'iPad Pro M4', type: 'Tablet', status: 'Connected', battery: 42, os: 'iPadOS 18', icon: 'tablet', via: 'USB-C · Thunderbolt' },
  { id: 'pixelbuds', name: 'Pixel Buds Pro 2', type: 'Audio', status: 'Connected', battery: 91, os: '—', icon: 'audio', via: 'Bluetooth LE' },
  { id: 'watch', name: 'Pixel Watch 3', type: 'Wearable', status: 'Idle', battery: 33, os: 'Wear OS 5', icon: 'watch', via: 'Bluetooth LE' },
];

const initialConnectors: Connector[] = [
  { id: 'bt', name: 'Bluetooth LE', protocol: 'BLE 5.3 · LE Audio', icon: <Bluetooth size={16} />, devices: ['Pixel Buds Pro 2', 'Pixel Watch 3'], status: 'Connected', latency: '6 ms' },
  { id: 'wifi', name: 'Wi-Fi Direct', protocol: '802.11ax · 6 GHz', icon: <Wifi size={16} />, devices: ['Pixel 8 Pro', 'iPad Pro M4'], status: 'Connected', latency: '4 ms' },
  { id: 'usb', name: 'USB-C · Thunderbolt', protocol: 'USB4 · 40 Gbit/s', icon: <Usb size={16} />, devices: ['iPad Pro M4'], status: 'Connected', latency: 'wired' },
  { id: 'cloud', name: 'Umbra Cloud sync', protocol: 'E2E encrypted · AES-256', icon: <Cloud size={16} />, devices: ['All devices'], status: 'Syncing', latency: 'queue 0' },
  { id: 'nfc', name: 'NFC pairing', protocol: 'ISO 14443 · tap to pair', icon: <Nfc size={16} />, devices: ['No pending taps'], status: 'Idle', latency: '—' },
  { id: 'matter', name: 'Matter · Thread hub', protocol: '802.15.4 · mesh', icon: <Router size={16} />, devices: ['Umbra Hub'], status: 'Off', latency: '—' },
];

const initialQueue = [
  { from: 'Pixel 8 Pro', to: 'Desktop', file: 'IMG_20260728_143205.jpg', size: '4.2 MB', progress: 100 },
  { from: 'Desktop', to: 'iPad Pro M4', file: 'storyboard_v1.pdf', size: '12 MB', progress: 63 },
  { from: 'Pixel 8 Pro', to: 'Umbra Cloud', file: 'backup_jul28.zip', size: '1.8 GB', progress: 100 },
];

function deviceIcon(icon: string, color: string) {
  const c = { size: 18, style: { color } };
  switch (icon) {
    case 'tablet': return <Tablet {...c} />;
    case 'audio': return <Headphones {...c} />;
    case 'watch': return <Watch {...c} />;
    default: return <Smartphone {...c} />;
  }
}

const CONN_COLORS: Record<Connector['status'], string> = {
  Connected: '#22c55e',
  Syncing: '#38bdf8',
  Idle: '#94a3b8',
  Off: '#64748b',
};

export function DevicesView() {
  const { avatar } = useAppStore();
  const [devices, setDevices] = useState(initialDevices);
  const [connectors, setConnectors] = useState(initialConnectors);
  const [queue, setQueue] = useState(initialQueue);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<HTMLDivElement>(null);
  const pairRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (gridRef.current) {
        const cards = gridRef.current.querySelectorAll('.device-card');
        tl.fromTo(cards, { opacity: 0, y: 16, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, stagger: 0.07 }, '-=0.15');
      }
      if (connRef.current) {
        const rows = connRef.current.querySelectorAll('.connector-row');
        tl.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.04 }, '-=0.2');
      }
      if (pairRef.current) {
        tl.fromTo(pairRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0 }, '-=0.15');
      }
      if (queueRef.current) {
        const rows = queueRef.current.querySelectorAll('.queue-row');
        tl.fromTo(rows, { opacity: 0, x: -8 }, { opacity: 1, x: 0, stagger: 0.05 }, '-=0.15');
      }
    }, [headerRef, gridRef, connRef, pairRef, queueRef]);
    return () => ctx.revert();
  }, []);

  const toggleDevice = (id: string) => {
    setDevices((cur) =>
      cur.map((d) => (d.id === id ? { ...d, status: d.status === 'Connected' ? 'Idle' : 'Connected' } : d))
    );
  };

  const toggleConnector = (id: string) => {
    setConnectors((cur) =>
      cur.map((c) => (c.id === id ? { ...c, status: c.status === 'Connected' ? 'Off' : 'Connected' } : c))
    );
  };

  const connected = devices.filter((d) => d.status === 'Connected').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Devices</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {connected} of {devices.length} devices online · {connectors.filter((c) => c.status === 'Connected').length} connectors active
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }}>
          <Plug size={13} /> Manage connections
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {devices.map((d) => (
            <div key={d.id} className="device-card card card-hover p-4" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                  {deviceIcon(d.icon, d.status === 'Connected' ? avatar.accent : 'var(--text-faint)')}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px]" style={{ color: d.status === 'Connected' ? '#22c55e' : 'var(--text-faint)' }}>
                    {d.status === 'Connected' ? '●' : '○'}
                  </span>
                  <Battery size={16} style={{ color: d.battery > 30 ? avatar.accent : '#FF6B6B' }} />
                </div>
              </div>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
              <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>
                {d.type} — {d.status}
              </p>
              <p className="text-[10px] font-light mt-1 flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                <Plug size={9} /> via {d.via}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${d.battery}%`, background: d.battery > 30 ? 'var(--accent-gradient)' : '#FF6B6B' }} />
                </div>
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{d.battery}%</span>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <p className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>{d.os}</p>
                <button
                  onClick={() => toggleDevice(d.id)}
                  className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                  style={{
                    background: d.status === 'Connected' ? `${avatar.accent}1c` : 'var(--surface-2)',
                    color: d.status === 'Connected' ? avatar.accent : 'var(--text-dim)',
                    border: `1px solid ${d.status === 'Connected' ? `${avatar.accent}44` : 'var(--hairline-strong)'}`,
                    fontFamily: 'var(--font)',
                  }}
                >
                  {d.status === 'Connected' ? <Unplug size={9} /> : <Plug size={9} />}
                  {d.status === 'Connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div ref={connRef} className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connectors</h2>
              <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>
                Every link from your brain to the physical world — toggle any channel on or off.
              </p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}>
              {connectors.filter((c) => c.status === 'Connected').length}/{connectors.length} active
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {connectors.map((c) => {
              const color = CONN_COLORS[c.status];
              return (
                <div key={c.id} className="connector-row flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: c.status === 'Off' ? 'var(--text-faint)' : avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                    {c.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
                        {c.protocol}
                      </span>
                    </div>
                    <p className="text-[10px] font-light mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                      {c.devices.join(' · ')} · {c.latency}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleConnector(c.id)}
                    className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    style={{
                      background: c.status === 'Connected' ? `${color}1c` : 'var(--surface-2)',
                      color,
                      border: `1px solid ${c.status === 'Connected' ? `${color}55` : 'var(--hairline-strong)'}`,
                      fontFamily: 'var(--font)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: c.status === 'Connected' ? `0 0 6px ${color}` : 'none' }} />
                    {c.status}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div ref={pairRef} className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px dashed var(--hairline-strong)' }}>
              <QrCode size={44} style={{ color: 'var(--text-faint)' }} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Pair a new device</h2>
              <p className="text-xs mt-1 font-light leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                Install the Umbra app on your device, then scan the code to link it to your brain.
                Your avatar, agents, and settings will follow it instantly.
              </p>
            </div>
            <button className="btn-ghost flex-shrink-0" style={{ height: 32, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Get the app
            </button>
          </div>
        </div>

        <div ref={queueRef} className="card p-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-dim)' }}>Transfer queue</h2>
            <button
              className="btn-ghost"
              style={{ height: 28, fontSize: 11, paddingInline: 12 }}
              onClick={() => setQueue((q) => q.filter((t) => t.progress < 100))}
              disabled={!queue.some((t) => t.progress === 100)}
            >
              Clear completed
            </button>
          </div>
          <div className="space-y-0">
            {queue.length === 0 && (
              <p className="text-sm py-6 text-center font-light" style={{ color: 'var(--text-faint)' }}>
                No transfers in queue
              </p>
            )}
            {queue.map((t, i) => (
              <div key={i} className="queue-row flex items-center gap-4 py-3" style={{ borderBottom: i < queue.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t.from}</span>
                    <ArrowRight size={10} style={{ color: 'var(--text-faint)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t.to}</span>
                    {t.progress === 100 && <CheckCircle2 size={12} style={{ color: avatar.accent }} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-light" style={{ color: 'var(--text-dim)' }}>{t.file}</span>
                    <span className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>{t.size}</span>
                  </div>
                </div>
                <div className="w-24">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: t.progress === 100 ? 'var(--text-dim)' : 'var(--accent-gradient)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
