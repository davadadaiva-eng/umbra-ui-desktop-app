import { useRef, useEffect, useState, useCallback, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, getMcpConnectors, getMcpCatalog,
  connectMcp, disconnectMcp, mcpOauthStart, mcpSyncRegistry,
  type McpCatalogEntry,
} from '../lib/backend';
import {
  Search, Plug, Cloud, Database, MessageSquare, CreditCard, Code2, Globe,
  X, Loader2, Check, Key, Shield, Unlock, RefreshCw, WifiOff, Share2, LayoutGrid,
  Download,
} from 'lucide-react';
import { CrmView } from './CrmView';
import { SocialView } from './SocialView';
import { CarruselView } from './CarruselView';

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  'AI & ML': <Cloud size={13} />, 'Cloud & DevOps': <Cloud size={13} />,
  'Data & Analytics': <Database size={13} />, 'Communication': <MessageSquare size={13} />,
  'Productivity': <Globe size={13} />, 'Developer': <Code2 size={13} />,
  'Payments & Finance': <CreditCard size={13} />,
};

const PAGE_SIZE = 80;

type ConnView = 'connected' | 'catalog' | 'crm' | 'social' | 'carrusel';

const CONN_TABS: { id: ConnView; label: string; icon: JSX.Element }[] = [
  { id: 'connected', label: 'Connected', icon: <Plug size={12} /> },
  { id: 'catalog', label: 'Catalog', icon: <Cloud size={12} /> },
  { id: 'crm', label: 'CRM · Twenty', icon: <Database size={12} /> },
  { id: 'social', label: 'Social', icon: <Share2 size={12} /> },
  { id: 'carrusel', label: 'Carrusel', icon: <LayoutGrid size={12} /> },
];

export function ConnectorsView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [view, setView] = useState<ConnView>('catalog');

  const [connected, setConnected] = useState<ConnectedItem[]>([]);
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const offsetRef = useRef(0);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectModal, setConnectModal] = useState<{ entry: McpCatalogEntry; credential: string; baseUrl: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [addAll, setAddAll] = useState<{ running: boolean; added: number; noKey: number; oauth: number; failed: number } | null>(null);

  interface ConnectedItem { id: string; name: string; category: string; connected: boolean; tools?: number; }

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    }, [headerRef]);
    return () => ctx.revert();
  }, []);

  // Fetch connected connectors
  const loadConnected = useCallback(async () => {
    if (!(await isBackendAvailable())) return;
    try {
      const data = await getMcpConnectors();
      const conns = data.connectors as unknown as { entries: Array<{ id: string; name: string; kind: string; connected: boolean; tools: number }> };
      if (conns?.entries?.length) {
        setConnected(conns.entries.map((c) => ({
          id: c.id, name: c.name, category: c.kind || 'Other',
          connected: c.connected, tools: c.tools,
        })));
      }
    } catch { /* keep empty */ }
  }, []);

  // Fetch connected connectors on mount
  useEffect(() => {
    void loadConnected();
  }, [loadConnected]);

  // Load a page of catalog entries
  const loadCatalogPage = useCallback(async (reset: boolean) => {
    if (reset) {
      offsetRef.current = 0;
      setCatalog([]);
      setHasMore(true);
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }
    try {
      if (!(await isBackendAvailable())) { setError('Backend not available'); setLoading(false); setLoadingMore(false); return; }
      setError('');
      const opts: { q?: string; category?: string; limit: number; offset: number } = {
        limit: PAGE_SIZE, offset: offsetRef.current,
      };
      if (query.trim()) opts.q = query.trim();
      if (category !== 'All') opts.category = category;
      const result = await getMcpCatalog(opts);
      const newEntries = result.entries ?? [];
      setCatalogTotal(result.total);
      if (result.categories?.length) setCategories(result.categories);
      setCatalog((prev) => reset ? newEntries : [...prev, ...newEntries]);
      offsetRef.current += newEntries.length;
      setHasMore(newEntries.length >= PAGE_SIZE);
    } catch (e) {
      setError(`Failed to load: ${(e as Error).message}`);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [query, category]);

  // Load on mount and when switching to catalog
  useEffect(() => {
    if (view === 'catalog') loadCatalogPage(true);
  }, [view, loadCatalogPage]);

  // Infinite scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || view !== 'catalog') return;
    const onScroll = () => {
      if (loadingMore || !hasMore || loading) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
        loadCatalogPage(false);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [view, loadingMore, hasMore, loading, loadCatalogPage]);

  // Debounced search
  const searchTimerRef = useRef<number | null>(null);
  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      if (view === 'catalog') loadCatalogPage(true);
    }, 500);
  };

  // Sync registry
  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      if (await isBackendAvailable()) {
        try {
          await mcpSyncRegistry();
        } catch { /* registry pull may partially fail; still reload the catalog */ }
        await loadCatalogPage(true);
      }
    } catch { /* ok */ }
    setSyncing(false);
  };

  // Add every connectable connector from the catalog: no-auth servers and
  // servers whose API key is already in the vault connect immediately; the
  // rest are reported back so the user can fill keys / do OAuth sign-in.
  const handleAddAll = async () => {
    setError('');
    setAddAll({ running: true, added: 0, noKey: 0, oauth: 0, failed: 0 });
    try {
      if (!(await isBackendAvailable())) {
        setError('Backend not available');
        setAddAll(null);
        return;
      }
      // Pull the full catalog in pages
      const entries: McpCatalogEntry[] = [];
      for (let offset = 0; ; ) {
        const page = await getMcpCatalog({ limit: 200, offset });
        entries.push(...page.entries);
        if (page.entries.length === 0 || entries.length >= page.total) break;
        offset += page.entries.length;
      }
      // Skip only already-active connectors. Registered-but-inactive entries
      // still get attempted when they need no key (or the key is in the vault).
      const already = new Set<string>();
      connected.forEach((c) => already.add(c.id));
      entries.forEach((e) => { if (e.connected) already.add(e.id); });
      const targets = entries.filter((e) => !already.has(e.id));
      let added = 0, noKey = 0, oauth = 0, failed = 0;
      for (const e of targets) {
        if (e.authType === 'oauth') { oauth++; continue; }
        if ((e.authType === 'apiKey' || e.authType === 'bearer') && !e.apiKeyConfigured) { noKey++; continue; }
        try {
          await connectMcp(e.id, { baseUrl: e.baseUrl || undefined, enabled: true });
          added++;
          setAddAll((s) => s && { ...s, added });
        } catch {
          failed++;
        }
      }
      await Promise.all([loadCatalogPage(true), loadConnected()]);
      setAddAll({ running: false, added, noKey, oauth, failed });
    } catch (e) {
      setError(`Add all failed: ${(e as Error).message}`);
      setAddAll(null);
    }
  };

  const connectedCount = connected.filter((c) => c.connected).length;

  // Toggle connected
  const toggleConnect = async (id: string) => {
    const item = connected.find((c) => c.id === id);
    if (!item) return;
    const wasConnected = item.connected;
    setConnected((cur) => cur.map((c) => c.id === id ? { ...c, connected: !wasConnected } : c));
    if (await isBackendAvailable()) {
      try {
        if (wasConnected) await disconnectMcp(id);
        else await connectMcp(id);
      } catch {
        setConnected((cur) => cur.map((c) => c.id === id ? { ...c, connected: wasConnected } : c));
      }
    }
  };

  // Connect from catalog
  const handleConnect = async (entry: McpCatalogEntry, credential?: string, baseUrl?: string) => {
    setConnectingId(entry.id);
    try {
      if (!(await isBackendAvailable())) return;
      if (entry.authType === 'oauth') {
        // OAuth flow — get authorize URL and open in new window
        const { authorizeUrl } = await mcpOauthStart(entry.id);
        window.open(authorizeUrl, '_blank', 'width=600,height=700');
        setConnectModal(null);
      } else {
        const opts: { apiKey?: string; baseUrl?: string; enabled: boolean } = { enabled: true };
        if (credential) opts.apiKey = credential;
        if (baseUrl) opts.baseUrl = baseUrl;
        await connectMcp(entry.id, opts);
        setConnected((cur) => [...cur, { id: entry.id, name: entry.name, category: entry.category, connected: true }]);
        setConnectModal(null);
      }
    } catch (e) {
      setError(`Connect failed: ${(e as Error).message}`);
    }
    setConnectingId(null);
  };

  const allCategories = ['All', ...categories.filter((c) => c !== 'All')];

  // Catalog items not yet connected
  const catalogFiltered = catalog.filter((e) => !connected.some((c) => c.id === e.id));
  const isFeature = view === 'crm' || view === 'social' || view === 'carrusel';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Connectors</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {view === 'catalog' ? `${catalogTotal} connectors available` : view === 'connected' ? `${connectedCount} of ${connected.length} connected` : view === 'crm' ? 'Twenty CRM workspace' : view === 'social' ? 'Social media automation' : 'Carousel builder'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isFeature && (
            <>
              {view === 'catalog' && (
                <>
                  <button onClick={handleAddAll} disabled={syncing || Boolean(addAll?.running)}
                    className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-semibold"
                    style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', opacity: syncing || addAll?.running ? 0.6 : 1, fontFamily: 'var(--font)' }}>
                    {addAll?.running ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {addAll?.running ? `Adding… ${addAll.added}` : 'Add All'}
                  </button>
                  <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
                    <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync
                  </button>
                </>
              )}
              <div className="flex items-center gap-2 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                <Search size={13} style={{ color: 'var(--text-faint)' }} />
                <input value={query} onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={view === 'catalog' ? 'Search 1000+ connectors…' : 'Search…'}
                  className="bg-transparent outline-none text-sm w-44" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-2 hairline-b flex-wrap" style={{ background: 'rgba(6,7,9,0.5)', borderBottom: '1px solid var(--hairline)' }}>
        {CONN_TABS.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="flex items-center gap-1.5 px-3.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                height: 30,
                background: active ? avatar.accent : 'transparent',
                color: active ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${active ? 'transparent' : 'var(--hairline-strong)'}`,
                fontFamily: 'var(--font)',
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]" style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}>
          <WifiOff size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto" style={{ color: '#FF8A8A' }}><X size={12} /></button>
        </div>
      )}

      {/* Add All result banner */}
      {addAll && !addAll.running && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#7EE2A8' }}>
          <Check size={13} />
          <span>
            Added {addAll.added} connector{addAll.added === 1 ? '' : 's'}
            {addAll.noKey > 0 && <> · {addAll.noKey} need an API key</>}
            {addAll.oauth > 0 && <> · {addAll.oauth} need OAuth sign-in</>}
            {addAll.failed > 0 && <> · {addAll.failed} failed</>}
          </span>
          <button onClick={() => setAddAll(null)} className="ml-auto" style={{ color: '#7EE2A8' }}><X size={12} /></button>
        </div>
      )}

      {/* Body */}
      {isFeature ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          {view === 'crm' && <CrmView />}
          {view === 'social' && <SocialView />}
          {view === 'carrusel' && <CarruselView />}
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {/* Category pills */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {allCategories.slice(0, 30).map((c) => (
            <button key={c} onClick={() => { setCategory(c); if (view === 'catalog') setTimeout(() => loadCatalogPage(true), 50); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: category === c ? avatar.accent : 'var(--surface-2)',
                color: category === c ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${category === c ? 'transparent' : 'var(--hairline-strong)'}`,
                fontFamily: 'var(--font)',
              }}>
              {c !== 'All' && (CATEGORY_ICONS[c] ?? <Plug size={11} />)} {c}
            </button>
          ))}
        </div>

        {/* CONNECTED VIEW */}
        {view === 'connected' && (
          <>
            {connected.length === 0 && (
              <div className="text-center py-16">
                <p className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>No connectors configured yet.</p>
                <button onClick={() => setView('catalog')} className="mt-4 flex items-center gap-1.5 px-4 rounded-xl text-sm font-medium mx-auto" style={{ height: 38, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                  <Plug size={14} /> Browse Catalog
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connected.filter((c) => category === 'All' || c.category === category).map((i) => (
                <div key={i.id} className="conn-card card flex items-start gap-3 p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)' }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: i.connected ? '#22C55E16' : 'var(--surface-2)', color: i.connected ? '#22C55E' : avatar.accent, border: `1px solid ${i.connected ? '#22C55E44' : 'var(--hairline-strong)'}` }}>
                    {i.connected ? <Check size={15} /> : <Plug size={15} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate block" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{i.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md mt-1 inline-block" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{i.category}</span>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10px]" style={{ color: i.connected ? '#22c55e' : 'var(--text-faint)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: i.connected ? '#22c55e' : 'var(--text-faint)', boxShadow: i.connected ? '0 0 6px rgba(34,197,94,0.8)' : 'none' }} />
                        {i.connected ? 'Connected' : 'Disconnected'}
                      </span>
                      <button onClick={() => toggleConnect(i.id)} className="relative rounded-full" style={{ width: 32, height: 18, background: i.connected ? avatar.accent : 'var(--surface-3)', border: '1px solid var(--hairline-strong)' }}>
                        <span className="absolute rounded-full" style={{ width: 12, height: 12, top: 2, left: i.connected ? 16 : 2, background: i.connected ? '#fff' : 'var(--text-faint)', transition: 'left 0.18s ease' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CATALOG VIEW */}
        {view === 'catalog' && (
          <>
            {loading && catalog.length === 0 && (
              <div className="flex items-center justify-center py-16 gap-2">
                <Loader2 size={16} className="animate-spin" style={{ color: avatar.accent }} />
                <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Loading catalog…</span>
              </div>
            )}
            {!loading && catalogFiltered.length === 0 && !error && (
              <div className="text-center py-16">
                <p className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>{query ? `No connectors match "${query}"` : 'No connectors found.'}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {catalogFiltered.map((entry) => {
                const isConn = connected.some((c) => c.id === entry.id && c.connected);
                const isConnecting = connectingId === entry.id;
                const isOAuth = entry.authType === 'oauth';
                const isNoAuth = entry.authType === 'none';
                return (
                  <div key={entry.id} className="conn-card card flex flex-col p-4" style={{ background: 'var(--surface-1)', border: `1px solid ${isConn ? '#22c55E44' : 'var(--hairline-strong)'}` }}
                    onMouseEnter={(e) => { if (!isConn) e.currentTarget.style.borderColor = `${avatar.accent}44`; }}
                    onMouseLeave={(e) => { if (!isConn) e.currentTarget.style.borderColor = isConn ? '#22c55E44' : 'var(--hairline-strong)'; }}>
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isConn ? '#22C55E16' : `${avatar.accent}16`, color: isConn ? '#22C55E' : avatar.accent, border: `1px solid ${isConn ? '#22C55E44' : `${avatar.accent}44`}` }}>
                        {isConn ? <Check size={15} /> : (CATEGORY_ICONS[entry.category] ?? <Plug size={15} />)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate block" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{entry.name}</span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{entry.category}</span>
                          <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: isOAuth ? '#22C55E14' : isNoAuth ? '#9CA3AF14' : '#60A5FA14', border: `1px solid ${isOAuth ? '#22C55E33' : isNoAuth ? '#9CA3AF33' : '#60A5FA33'}`, color: isOAuth ? '#22C55E' : isNoAuth ? '#9CA3AF' : '#60A5FA' }}>
                            {isOAuth ? <Shield size={10} /> : isNoAuth ? <Unlock size={10} /> : <Key size={10} />}
                            {isOAuth ? 'OAuth' : isNoAuth ? 'No auth' : 'API Key'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 mt-2" />
                    <div className="flex items-center gap-2 mt-3">
                      {isConn ? (
                        <span className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium" style={{ background: '#22C55E16', color: '#22C55E', border: '1px solid #22C55E33', fontFamily: 'var(--font)' }}>
                          <Check size={12} /> Connected
                        </span>
                      ) : isNoAuth ? (
                        <button onClick={() => handleConnect(entry)} disabled={isConnecting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: '#22C55E', color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                          {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          {isConnecting ? 'Connecting…' : 'Connect'}
                        </button>
                      ) : isOAuth ? (
                        <button onClick={() => handleConnect(entry)} disabled={isConnecting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                          {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                          {isConnecting ? 'Authorizing…' : `Sign in with ${entry.name}`}
                        </button>
                      ) : (
                        <button onClick={() => setConnectModal({ entry, credential: '', baseUrl: entry.baseUrl || '' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
                          style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                          <Key size={12} /> Enter API Key
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {loadingMore && (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 size={14} className="animate-spin" style={{ color: avatar.accent }} />
                <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Loading more…</span>
              </div>
            )}
            {!loading && !loadingMore && hasMore && catalogFiltered.length > 0 && (
              <p className="text-center text-[10px] py-4" style={{ color: '#555' }}>Scroll for more</p>
            )}
            {!loading && !loadingMore && !hasMore && catalogFiltered.length > 0 && (
              <p className="text-center text-[10px] py-4" style={{ color: '#555' }}>All {catalogTotal} connectors loaded</p>
            )}
          </>
        )}
      </div>

      )}

      {/* API Key Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-[440px] rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${avatar.accent}16`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
                  <Key size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Connect {connectModal.entry.name}</p>
                  <p className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>
                    {connectModal.entry.authType === 'bearer' ? 'Enter your bearer token' : 'Enter your API key'}
                  </p>
                </div>
              </div>
              <button onClick={() => setConnectModal(null)} style={{ color: 'var(--text-faint)' }}><X size={16} /></button>
            </div>
            {connectModal.entry.baseUrl && (
              <div className="mb-3">
                <label className="text-[10px] font-medium uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-faint)' }}>Base URL</label>
                <input value={connectModal.baseUrl} onChange={(e) => setConnectModal({ ...connectModal, baseUrl: e.target.value })}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
              </div>
            )}
            <div className="mb-4">
              <label className="text-[10px] font-medium uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-faint)' }}>
                {connectModal.entry.authType === 'bearer' ? 'Bearer Token' : 'API Key'}
              </label>
              <input value={connectModal.credential} onChange={(e) => setConnectModal({ ...connectModal, credential: e.target.value })}
                placeholder={connectModal.entry.authType === 'bearer' ? 'Bearer eyJhbG…' : 'sk-…'}
                type="password"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
              <p className="text-[10px] mt-1 font-light" style={{ color: '#666' }}>Stored encrypted in your local keychain.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConnectModal(null)} className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-medium" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>Cancel</button>
              <button onClick={() => handleConnect(connectModal.entry, connectModal.credential, connectModal.baseUrl)}
                disabled={!connectModal.credential}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
                style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                <Plug size={13} /> Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
