import { useRef, useEffect, useState, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { isBackendAvailable, backendFetch, deviceInvite, deviceJoin, deviceRevoke, deviceSend, getMeshStatus, meshPair, meshPairDemo, getChromeStatus, getChromeLogins, getChromeSites, getConnectors, disconnectConnector, BackendError } from '../lib/backend';
import { Smartphone, Tablet, Headphones, Watch, Battery, CheckCircle2, QrCode, Bluetooth, Usb, Cloud, Nfc, Router, Plug, Unplug, UserPlus, Send, XCircle, RefreshCw, Globe, KeyRound, Link2, ChevronDown, ChevronUp, Loader2, Copy, Check, Wifi, ArrowRight } from 'lucide-react';
import { DockerView } from './DockerView';

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
  const meshRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);

  // Device invite/join state
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Device send state
  const [sendDevice, setSendDevice] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mesh state
  const [meshInfo, setMeshInfo] = useState<Record<string, unknown> | null>(null);
  const [meshLoading, setMeshLoading] = useState(false);
  const [meshPairResult, setMeshPairResult] = useState<{ pairingCode?: string; token?: string } | null>(null);

  // Chrome extension state
  const [chromeStatus, setChromeStatus] = useState<Record<string, unknown> | null>(null);
  const [chromeLogins, setChromeLogins] = useState<unknown[]>([]);
  const [chromeSites, setChromeSites] = useState<unknown[]>([]);
  const [chromeLoading, setChromeLoading] = useState(false);
  const [chromeExpanded, setChromeExpanded] = useState(false);

  // Backend connectors state
  const [backendConnectors, setBackendConnectors] = useState<Array<Record<string, unknown>>>([]);

  // Fetch real devices from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const data = await backendFetch<{ devices: { registered?: Array<{ id: string; name: string; type: string; online: boolean; lastSeen?: string }>; hub?: { onlineDevices?: Array<{ id: string; name: string; type: string; online: boolean }> } } }>('/api/devices');
        if (cancelled) return;
        const registered = data.devices?.registered ?? [];
        const onlineDevices = data.devices?.hub?.onlineDevices ?? [];
        const allDevices = [...registered, ...onlineDevices];
        if (allDevices.length === 0) return;
        const mapped = allDevices.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type || 'Device',
          status: d.online ? 'Connected' as const : 'Idle' as const,
          battery: 100,
          os: '—',
          icon: d.type === 'phone' ? 'phone' : d.type === 'tablet' ? 'tablet' : 'phone',
          via: 'Cloud',
        }));
        setDevices(mapped);
      } catch { /* keep seed data */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
      if (meshRef.current) {
        tl.fromTo(meshRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0 }, '-=0.1');
      }
      if (chromeRef.current) {
        tl.fromTo(chromeRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0 }, '-=0.1');
      }
    }, [headerRef, gridRef, connRef, pairRef, queueRef, meshRef, chromeRef]);
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

  // ── Device Invite ──────────────────────────────────────────────
  const handleInvite = async () => {
    setInviteLoading(true);
    try {
      const data = await deviceInvite();
      setInviteCode(data.code);
    } catch {
      // fallback demo code
      setInviteCode('UMBRA-' + Math.random().toString(36).substring(2, 8).toUpperCase());
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch { /* noop */ }
  };

  // ── Device Join ────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinLoading(true);
    setJoinMessage(null);
    try {
      await deviceJoin(joinCode.trim(), { name: joinName.trim() || undefined });
      setJoinMessage({ type: 'success', text: 'Joined successfully!' });
      setJoinCode('');
      setJoinName('');
      setTimeout(() => setJoinMessage(null), 4000);
    } catch (e) {
      const err = e instanceof BackendError ? e.message : 'Join failed';
      setJoinMessage({ type: 'error', text: err });
      setTimeout(() => setJoinMessage(null), 4000);
    } finally {
      setJoinLoading(false);
    }
  };

  // ── Device Revoke ──────────────────────────────────────────────
  const handleRevoke = async (deviceId: string) => {
    setRevokeLoading(true);
    setRevokeTarget(deviceId);
    try {
      await deviceRevoke(deviceId);
      setDevices((cur) => cur.filter((d) => d.id !== deviceId));
    } catch { /* keep list */ }
    finally {
      setRevokeLoading(false);
      setRevokeTarget(null);
    }
  };

  // ── Device Send ────────────────────────────────────────────────
  const handleSend = async () => {
    if (!sendDevice.trim() || !sendMsg.trim()) return;
    setSendLoading(true);
    setSendResult(null);
    try {
      await deviceSend(sendDevice.trim(), sendMsg.trim());
      setSendResult({ type: 'success', text: 'Message sent' });
      setSendMsg('');
      setTimeout(() => setSendResult(null), 3000);
    } catch (e) {
      const err = e instanceof BackendError ? e.message : 'Send failed';
      setSendResult({ type: 'error', text: err });
      setTimeout(() => setSendResult(null), 3000);
    } finally {
      setSendLoading(false);
    }
  };

  // ── Mesh ───────────────────────────────────────────────────────
  const loadMesh = async () => {
    setMeshLoading(true);
    try {
      const data = await getMeshStatus();
      setMeshInfo(data as Record<string, unknown>);
    } catch {
      setMeshInfo({ running: false, peers: 0 });
    } finally {
      setMeshLoading(false);
    }
  };

  useEffect(() => {
    loadMesh();
  }, []);

  const handleMeshPair = async () => {
    try {
      const data = await meshPair();
      setMeshPairResult(data.pair as { pairingCode?: string; token?: string });
    } catch {
      const data = await meshPairDemo();
      setMeshPairResult(data.pair as { pairingCode?: string; token?: string });
    }
  };

  // ── Chrome ─────────────────────────────────────────────────────
  const loadChrome = async () => {
    setChromeLoading(true);
    try {
      const [status, logins, sites] = await Promise.all([
        getChromeStatus().catch(() => ({ connected: false })),
        getChromeLogins().catch(() => ({ logins: [] })),
        getChromeSites().catch(() => ({ sites: [] })),
      ]);
      setChromeStatus(status);
      setChromeLogins((logins as { logins: unknown[] }).logins || []);
      setChromeSites((sites as { sites: unknown[] }).sites || []);
    } catch { /* noop */ }
    finally {
      setChromeLoading(false);
    }
  };

  useEffect(() => {
    loadChrome();
  }, []);

  // ── Backend Connectors ─────────────────────────────────────────
  const loadConnectors = async () => {
    try {
      const data = await getConnectors();
      setBackendConnectors((data.connectors || []) as Array<Record<string, unknown>>);
    } catch { /* noop */ }
  };

  useEffect(() => {
    loadConnectors();
  }, []);

  const handleDisconnectConnector = async (connectorId: string) => {
    try {
      await disconnectConnector(connectorId);
      setBackendConnectors((prev) => prev.filter((c) => c.id !== connectorId));
    } catch { /* noop */ }
  };

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

        {/* ═══ DEVICES SECTION ═══ */}
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
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRevoke(d.id)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                    style={{
                      background: revokeTarget === d.id ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                      color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.3)',
                      fontFamily: 'var(--font)',
                    }}
                    disabled={revokeLoading && revokeTarget === d.id}
                  >
                    {revokeLoading && revokeTarget === d.id ? <Loader2 size={9} className="animate-spin" /> : <XCircle size={9} />}
                    Revoke
                  </button>
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
            </div>
          ))}
        </div>

        {/* ═══ DEVICE INVITE / JOIN ═══ */}
        <div className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Invite */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <UserPlus size={14} style={{ color: avatar.accent }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Invite a device</h2>
              </div>
              <p className="text-[11px] font-light mb-3" style={{ color: 'var(--text-dim)' }}>
                Generate a one-time code to share with another device.
              </p>
              {inviteCode ? (
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-mono font-bold tracking-widest"
                    style={{ background: 'var(--surface-2)', border: `1px solid ${avatar.accent}55`, color: avatar.accent }}
                  >
                    {inviteCode}
                  </div>
                  <button
                    onClick={handleCopyInvite}
                    className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-2 rounded-lg transition-colors"
                    style={{
                      background: inviteCopied ? 'rgba(34,197,94,0.15)' : 'var(--surface-2)',
                      color: inviteCopied ? '#22c55e' : 'var(--text-dim)',
                      border: '1px solid var(--hairline-strong)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {inviteCopied ? <Check size={11} /> : <Copy size={11} />}
                    {inviteCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleInvite}
                  disabled={inviteLoading}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: `${avatar.accent}1c`,
                    color: avatar.accent,
                    border: `1px solid ${avatar.accent}44`,
                    fontFamily: 'var(--font)',
                  }}
                >
                  {inviteLoading ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                  Generate invite code
                </button>
              )}
            </div>

            {/* Join */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <QrCode size={14} style={{ color: avatar.accent }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Join with code</h2>
              </div>
              <p className="text-[11px] font-light mb-3" style={{ color: 'var(--text-dim)' }}>
                Enter a code from another device to join it.
              </p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter invite code"
                  className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--hairline-strong)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font)',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Device name"
                  className="w-32 px-3 py-2 rounded-lg text-xs outline-none"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--hairline-strong)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font)',
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
                <button
                  onClick={handleJoin}
                  disabled={joinLoading || !joinCode.trim()}
                  className="flex items-center gap-1 text-[11px] font-medium px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: joinCode.trim() ? `${avatar.accent}1c` : 'var(--surface-2)',
                    color: joinCode.trim() ? avatar.accent : 'var(--text-faint)',
                    border: `1px solid ${joinCode.trim() ? `${avatar.accent}44` : 'var(--hairline-strong)'}`,
                    fontFamily: 'var(--font)',
                  }}
                >
                  {joinLoading ? <Loader2 size={11} className="animate-spin" /> : <QrCode size={11} />}
                  Join
                </button>
              </div>
              {joinMessage && (
                <p className="text-[11px] font-medium mt-1" style={{ color: joinMessage.type === 'success' ? '#22c55e' : '#ef4444' }}>
                  {joinMessage.text}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ DEVICE SEND ═══ */}
        <div className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Send size={14} style={{ color: avatar.accent }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Send message to device</h2>
          </div>
          <p className="text-[11px] font-light mb-3" style={{ color: 'var(--text-dim)' }}>
            Push a message to any connected device by ID or name.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sendDevice}
              onChange={(e) => setSendDevice(e.target.value)}
              placeholder="Device ID"
              className="w-36 px-3 py-2 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline-strong)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <input
              type="text"
              value={sendMsg}
              onChange={(e) => setSendMsg(e.target.value)}
              placeholder="Message to send"
              className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--hairline-strong)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={sendLoading || !sendDevice.trim() || !sendMsg.trim()}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3.5 py-2 rounded-lg transition-colors"
              style={{
                background: sendDevice.trim() && sendMsg.trim() ? `${avatar.accent}1c` : 'var(--surface-2)',
                color: sendDevice.trim() && sendMsg.trim() ? avatar.accent : 'var(--text-faint)',
                border: `1px solid ${sendDevice.trim() && sendMsg.trim() ? `${avatar.accent}44` : 'var(--hairline-strong)'}`,
                fontFamily: 'var(--font)',
              }}
            >
              {sendLoading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Send
            </button>
          </div>
          {sendResult && (
            <p className="text-[11px] font-medium mt-2" style={{ color: sendResult.type === 'success' ? '#22c55e' : '#ef4444' }}>
              {sendResult.text}
            </p>
          )}
        </div>

        {/* ═══ CONNECTORS ═══ */}
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

        {/* ═══ PAIR NEW DEVICE ═══ */}
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

        {/* ═══ MESH SECTION ═══ */}
        <div ref={meshRef} className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mesh Network</h2>
              <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>
                Peer-to-peer device mesh for offline and local communication.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadMesh}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg transition-colors"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--hairline-strong)',
                  fontFamily: 'var(--font)',
                }}
              >
                <RefreshCw size={10} />
                Refresh
              </button>
            </div>
          </div>

          {/* Mesh status card */}
          {meshLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Status</p>
                <div className="flex items-center gap-2">
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: meshInfo?.running ? '#22c55e' : '#ef4444', boxShadow: meshInfo?.running ? '0 0 6px #22c55e' : 'none' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{meshInfo?.running ? 'Online' : 'Offline'}</p>
                </div>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Peers</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{String(meshInfo?.peers ?? 0)}</p>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Transport</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{String(meshInfo?.transport ?? '—')}</p>
              </div>
            </div>
          )}

          {/* Mesh pair */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={handleMeshPair}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-2 rounded-lg transition-colors"
              style={{
                background: `${avatar.accent}1c`,
                color: avatar.accent,
                border: `1px solid ${avatar.accent}44`,
                fontFamily: 'var(--font)',
              }}
            >
              <Link2 size={12} />
              Pair via mesh
            </button>
            {meshPairResult && (
              <div className="flex items-center gap-2 flex-1">
                <div className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider" style={{ background: 'var(--surface-2)', border: `1px solid ${avatar.accent}55`, color: avatar.accent }}>
                  {meshPairResult.pairingCode || meshPairResult.token || 'paired'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ CHROME EXTENSION SECTION ═══ */}
        <div ref={chromeRef} className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <button
            onClick={() => { setChromeExpanded(!chromeExpanded); if (!chromeStatus) loadChrome(); }}
            className="w-full flex items-center justify-between"
            style={{ background: 'none', border: 'none', fontFamily: 'var(--font)', cursor: 'pointer', padding: 0 }}
          >
            <div className="flex items-center gap-2">
              <Globe size={14} style={{ color: avatar.accent }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Chrome Extension</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-md" style={{
                background: chromeStatus?.connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)',
                color: chromeStatus?.connected ? '#22c55e' : '#ef4444',
                border: `1px solid ${chromeStatus?.connected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
              }}>
                {chromeStatus?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {chromeExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />}
          </button>

          {chromeExpanded && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
              {chromeLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-faint)' }} />
                </div>
              ) : (
                <>
                  {/* Logins */}
                  {chromeLogins.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <KeyRound size={12} style={{ color: avatar.accent }} />
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Detected Logins</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                          {chromeLogins.length}
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {chromeLogins.map((login, i) => {
                          const l = login as Record<string, unknown>;
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                              <KeyRound size={11} style={{ color: 'var(--text-faint)' }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{String(l.provider || l.url || 'Unknown')}</p>
                                <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>{String(l.username || l.email || '—')}</p>
                              </div>
                              <span className="text-[9px] font-light" style={{ color: 'var(--text-faint)' }}>{String(l.timestamp || '')}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sites */}
                  {chromeSites.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Globe size={12} style={{ color: avatar.accent }} />
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Active Sites</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                          {chromeSites.length}
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {chromeSites.map((site, i) => {
                          const s = site as Record<string, unknown>;
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                              <Globe size={11} style={{ color: 'var(--text-faint)' }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{String(s.title || s.url || 'Unknown')}</p>
                                <p className="text-[10px] font-light truncate" style={{ color: 'var(--text-faint)' }}>{String(s.url || '')}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {chromeLogins.length === 0 && chromeSites.length === 0 && (
                    <p className="text-xs py-4 text-center font-light" style={{ color: 'var(--text-faint)' }}>
                      No data detected yet. Install the Chrome extension to begin.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ═══ BACKEND CONNECTORS ═══ */}
        {backendConnectors.length > 0 && (
          <div className="card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Link2 size={14} style={{ color: avatar.accent }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connected Services</h2>
              </div>
              <button
                onClick={loadConnectors}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg transition-colors"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--hairline-strong)',
                  fontFamily: 'var(--font)',
                }}
              >
                <RefreshCw size={10} />
                Refresh
              </button>
            </div>
            <div className="space-y-2">
              {backendConnectors.map((c) => (
                <div key={String(c.id)} className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                    <Link2 size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{String(c.name || c.id)}</p>
                    <p className="text-[10px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {String(c.kind || c.type || 'service')} · {String(c.tools || 0)} tools
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{
                      background: c.connected ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
                      color: c.connected ? '#22c55e' : '#94a3b8',
                      border: `1px solid ${c.connected ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.25)'}`,
                    }}>
                      {c.connected ? 'Active' : 'Inactive'}
                    </span>
                    {!!c.connected && (
                      <button
                        onClick={() => handleDisconnectConnector(String(c.id))}
                        className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.3)',
                          fontFamily: 'var(--font)',
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ DOCKER WORKERS ═══ */}
        <div className="mb-5 overflow-hidden rounded-2xl" style={{ height: 560, border: '1px solid var(--hairline-strong)', background: 'var(--surface-1)' }}>
          <DockerView />
        </div>

        {/* ═══ TRANSFER QUEUE ═══ */}
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
