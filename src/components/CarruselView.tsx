import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable,
  carruselStart, carruselStop, carruselStatus,
  carruselCreate, carruselList,
  carruselChat, carruselExport,
  carruselBrand, carruselDelete, carruselDuplicate,
} from '../lib/backend';
import {
  Play, Square, Plus, MessageSquare, Palette, Loader2, Images, LayoutGrid,
  Trash2, FileDown, Copy, WifiOff, X, Send,
} from 'lucide-react';

interface CarruselStatus {
  running: boolean;
  uptimeMs?: number;
  pid?: number;
}

interface CarouselItem {
  id: string;
  name: string;
  slideCount: number;
  aspectRatio: string;
  createdAt: string;
}

interface BrandConfig {
  fonts?: string[];
  colors?: string[];
  logo?: string;
  companyName?: string;
  tone?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const ASPECT_RATIOS = ['1:1', '4:5', '9:16'] as const;

export function CarruselView() {
  const { avatar } = useAppStore();
  const accent = avatar.accent;
  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  // Server state
  const [serverStatus, setServerStatus] = useState<CarruselStatus | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [backendOk, setBackendOk] = useState(true);

  // Carousels
  const [carousels, setCarousels] = useState<CarouselItem[]>([]);
  const [carouselsLoading, setCarouselsLoading] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createAspect, setCreateAspect] = useState<string>('1:1');
  const [creating, setCreating] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatTarget, setChatTarget] = useState<string | undefined>(undefined);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Brand
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);

  // Export
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Error
  const [error, setError] = useState('');

  // ── GSAP entrance ────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
      if (cardsRef.current) {
        gsap.fromTo(
          cardsRef.current.querySelectorAll(':scope > div'),
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.07, delay: 0.15 }
        );
      }
    }, []);
    return () => ctx.revert();
  }, []);

  // ── Backend check + auto-refresh ─────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!(await isBackendAvailable())) {
      setBackendOk(false);
      setServerStatus(null);
      return;
    }
    setBackendOk(true);
    try {
      const data = await carruselStatus() as { status: CarruselStatus };
      setServerStatus(data.status);
    } catch {
      setServerStatus(null);
    }
  }, []);

  const refreshCarousels = useCallback(async () => {
    if (!(await isBackendAvailable())) return;
    try {
      setCarouselsLoading(true);
      const data = await carruselList() as { carousels: CarouselItem[] };
      setCarousels(data.carousels ?? []);
    } catch {
      // keep existing
    }
    setCarouselsLoading(false);
  }, []);

  const refreshBrand = useCallback(async () => {
    if (!(await isBackendAvailable())) return;
    try {
      setBrandLoading(true);
      const data = await carruselBrand() as { brand: BrandConfig };
      setBrand(data.brand ?? null);
    } catch {
      setBrand(null);
    }
    setBrandLoading(false);
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshCarousels();
    refreshBrand();
  }, [refreshStatus, refreshCarousels, refreshBrand]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ── Server toggle ────────────────────────────────────────────────
  const handleToggleServer = async () => {
    if (!backendOk) return;
    setServerLoading(true);
    setError('');
    try {
      if (serverStatus?.running) {
        await carruselStop();
      } else {
        await carruselStart();
      }
      await refreshStatus();
    } catch (e) {
      setError(`Server toggle failed: ${(e as Error).message}`);
    }
    setServerLoading(false);
  };

  // ── Create carousel ──────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createName.trim() || !backendOk) return;
    setCreating(true);
    setError('');
    try {
      await carruselCreate(createName.trim(), createAspect);
      setCreateName('');
      await refreshCarousels();
    } catch (e) {
      setError(`Create failed: ${(e as Error).message}`);
    }
    setCreating(false);
  };

  // ── Delete carousel ──────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!backendOk) return;
    try {
      setCarousels((prev) => prev.filter((c) => c.id !== id));
      await carruselDelete(id);
    } catch (e) {
      setError(`Delete failed: ${(e as Error).message}`);
      await refreshCarousels();
    }
  };

  // ── Duplicate carousel ───────────────────────────────────────────
  const handleDuplicate = async (id: string) => {
    if (!backendOk) return;
    try {
      await carruselDuplicate(id);
      await refreshCarousels();
    } catch (e) {
      setError(`Duplicate failed: ${(e as Error).message}`);
    }
  };

  // ── Export carousel ──────────────────────────────────────────────
  const handleExport = async (id: string) => {
    if (!backendOk) return;
    setExportingId(id);
    setError('');
    try {
      const data = await carruselExport(id) as { zipBase64: string; carouselId: string };
      const byteChars = atob(data.zipBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carousel-${id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    }
    setExportingId(null);
  };

  // ── Chat ─────────────────────────────────────────────────────────
  const handleSendChat = async () => {
    if (!chatInput.trim() || !backendOk) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setChatLoading(true);
    setError('');
    try {
      const data = await carruselChat(msg, chatTarget) as { response: unknown };
      const resp = typeof data.response === 'string'
        ? data.response
        : JSON.stringify(data.response, null, 2);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: resp }]);
    } catch (e) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${(e as Error).message}` }]);
    }
    setChatLoading(false);
  };

  const serverRunning = serverStatus?.running ?? false;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div
        ref={headerRef}
        className="px-6 py-5 hairline-b flex items-end justify-between gap-4"
        style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)' }}
      >
        <div>
          <h1
            className="hero-heading font-black uppercase tracking-tight leading-none"
            style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}
          >
            Carousel Designer
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            AI-powered carousel creation and export
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium"
            style={{
              height: 34,
              background: serverRunning ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)',
              border: `1px solid ${serverRunning ? 'rgba(34,197,94,0.35)' : 'var(--hairline-strong)'}`,
              color: serverRunning ? '#22C55E' : 'var(--text-faint)',
              fontFamily: 'var(--font)',
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: serverRunning ? '#22c55e' : 'var(--text-faint)',
                boxShadow: serverRunning ? '0 0 6px rgba(34,197,94,0.8)' : 'none',
              }}
            />
            {serverRunning ? 'Server running' : 'Server stopped'}
          </span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>
            {carousels.length} carousel{carousels.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────── */}
      {error && (
        <div
          className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]"
          style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}
        >
          <WifiOff size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto" style={{ color: '#FF8A8A' }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div ref={cardsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Server Status Card ───────────────────────── */}
          <div className="card p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: serverRunning ? 'rgba(34,197,94,0.12)' : 'var(--surface-2)',
                    color: serverRunning ? '#22C55E' : 'var(--text-dim)',
                    border: `1px solid ${serverRunning ? 'rgba(34,197,94,0.3)' : 'var(--hairline-strong)'}`,
                  }}
                >
                  {serverRunning ? <Play size={16} /> : <Square size={16} />}
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    Open Carrusel
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    {serverRunning ? 'Rendering engine active' : 'Click start to begin'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleServer}
                disabled={serverLoading || !backendOk}
                className="flex items-center gap-1.5 px-4 rounded-xl text-[11px] font-medium transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  height: 34,
                  background: serverRunning ? 'rgba(239,68,68,0.15)' : accent,
                  color: serverRunning ? '#EF4444' : '#fff',
                  border: serverRunning ? '1px solid rgba(239,68,68,0.3)' : 'none',
                  fontFamily: 'var(--font)',
                }}
              >
                {serverLoading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : serverRunning ? (
                  <Square size={12} />
                ) : (
                  <Play size={12} />
                )}
                {serverLoading ? 'Working…' : serverRunning ? 'Stop' : 'Start'}
              </button>
            </div>
            {serverRunning && (
              <div className="flex items-center gap-4 text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {serverStatus?.uptimeMs != null && (
                  <span>Uptime: {Math.round(serverStatus.uptimeMs / 1000)}s</span>
                )}
                {serverStatus?.pid != null && (
                  <span>PID: {serverStatus.pid}</span>
                )}
              </div>
            )}
          </div>

          {/* ── Create Carousel Card ─────────────────────── */}
          <div className="card p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${accent}16`, color: accent, border: `1px solid ${accent}44` }}
              >
                <Plus size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                  New Carousel
                </p>
                <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                  Create from scratch or via AI chat
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Carousel name…"
                className="input-field"
                style={{ height: 38, fontSize: 13 }}
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 flex-1">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar}
                      onClick={() => setCreateAspect(ar)}
                      className="flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors"
                      style={{
                        flex: 1,
                        height: 34,
                        background: createAspect === ar ? accent : 'var(--surface-2)',
                        color: createAspect === ar ? '#fff' : 'var(--text-dim)',
                        border: `1px solid ${createAspect === ar ? 'transparent' : 'var(--hairline-strong)'}`,
                        fontFamily: 'var(--font)',
                      }}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating || !backendOk}
                  className="flex items-center justify-center gap-1.5 px-4 rounded-xl text-[11px] font-medium transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ height: 34, background: accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
                >
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>

          {/* ── AI Chat Card ────────────────────────────── */}
          <div className="card p-5 flex flex-col" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', minHeight: 340 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(168,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(168,139,250,0.3)' }}
                >
                  <MessageSquare size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    AI Designer
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    Describe what you want to create
                  </p>
                </div>
              </div>
              {carousels.length > 0 && (
                <select
                  value={chatTarget ?? ''}
                  onChange={(e) => setChatTarget(e.target.value || undefined)}
                  className="select-field text-[11px]"
                  style={{ height: 30, padding: '0 28px 0 8px', background: 'var(--surface-2)' }}
                >
                  <option value="">General chat</option>
                  {carousels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Messages */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto mb-3 rounded-xl p-3 space-y-2.5"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', maxHeight: 240 }}
            >
              {chatMessages.length === 0 && (
                <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-faint)' }}>
                  Ask me to design a carousel — e.g. "Create a 5-slide product launch carousel for a SaaS tool"
                </p>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap"
                    style={{
                      background: m.role === 'user' ? accent : 'var(--surface-1)',
                      color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--hairline-strong)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div
                    className="rounded-xl px-3 py-2 text-[11px] flex items-center gap-1.5"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', color: 'var(--text-faint)' }}
                  >
                    <Loader2 size={11} className="animate-spin" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                placeholder="Describe your carousel…"
                className="input-field flex-1"
                style={{ height: 38, fontSize: 13 }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || chatLoading || !backendOk}
                className="flex items-center justify-center rounded-xl transition-all hover:opacity-90 disabled:opacity-40"
                style={{ width: 38, height: 38, background: accent, color: '#fff', border: 'none' }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>

          {/* ── Brand Config Card ────────────────────────── */}
          <div className="card p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.3)' }}
              >
                <Palette size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                  Brand Config
                </p>
                <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                  Fonts, colors, and logo defaults
                </p>
              </div>
            </div>
            {brandLoading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: accent }} />
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>Loading brand…</span>
              </div>
            ) : brand ? (
              <div className="space-y-3">
                {brand.companyName && (
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Company</p>
                    <p className="text-[12px]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{brand.companyName}</p>
                  </div>
                )}
                {brand.colors && brand.colors.length > 0 && (
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-faint)' }}>Colors</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {brand.colors.map((c, i) => (
                        <span
                          key={i}
                          className="swatch"
                          style={{ background: c, width: 22, height: 22 }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {brand.fonts && brand.fonts.length > 0 && (
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Fonts</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {brand.fonts.map((f, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-md"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {brand.tone && (
                  <div>
                    <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Tone</p>
                    <p className="text-[12px]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>{brand.tone}</p>
                  </div>
                )}
                {!brand.companyName && (!brand.colors || brand.colors.length === 0) && (!brand.fonts || brand.fonts.length === 0) && !brand.tone && (
                  <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-faint)' }}>No brand config set</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-center py-4" style={{ color: 'var(--text-faint)' }}>
                No brand config available
              </p>
            )}
          </div>

          {/* ── Carousels List Card (full width) ─────────── */}
          <div className="card p-5 lg:col-span-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(56,189,248,0.12)', color: '#38BDF8', border: '1px solid rgba(56,189,248,0.3)' }}
                >
                  <Images size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    Your Carousels
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    {carousels.length} total
                  </p>
                </div>
              </div>
              <button
                onClick={refreshCarousels}
                disabled={carouselsLoading || !backendOk}
                className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium transition-colors"
                style={{
                  height: 30,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--hairline-strong)',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font)',
                }}
              >
                <Loader2 size={11} className={carouselsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {carouselsLoading && carousels.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Loader2 size={16} className="animate-spin" style={{ color: accent }} />
                <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Loading carousels…</span>
              </div>
            ) : carousels.length === 0 ? (
              <div className="text-center py-12">
                <Images size={36} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
                <p className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>No carousels yet</p>
                <p className="text-[11px] mt-1" style={{ color: '#444' }}>Create one above or ask the AI designer</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {carousels.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col p-4 rounded-xl transition-all hover:border-opacity-40"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--hairline-strong)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${accent}44`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${accent}16`, color: accent, border: `1px solid ${accent}44` }}
                      >
                        <LayoutGrid size={15} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                          {c.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
                            {c.slideCount} slide{c.slideCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: `${accent}12`, border: `1px solid ${accent}33`, color: accent }}>
                            {c.aspectRatio}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-auto">
                      <button
                        onClick={() => handleExport(c.id)}
                        disabled={exportingId === c.id || !backendOk}
                        className="flex items-center gap-1 flex-1 justify-center py-1.5 rounded-lg text-[10px] font-medium transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E', fontFamily: 'var(--font)' }}
                        title="Export as PNG ZIP"
                      >
                        {exportingId === c.id ? <Loader2 size={10} className="animate-spin" /> : <FileDown size={10} />}
                        {exportingId === c.id ? 'Exporting…' : 'Export'}
                      </button>
                      <button
                        onClick={() => handleDuplicate(c.id)}
                        disabled={!backendOk}
                        className="flex items-center justify-center py-1.5 rounded-lg text-[10px] transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ width: 32, background: 'var(--surface-3)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}
                        title="Duplicate"
                      >
                        <Copy size={10} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={!backendOk}
                        className="flex items-center justify-center py-1.5 rounded-lg text-[10px] transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ width: 32, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
                        title="Delete"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
