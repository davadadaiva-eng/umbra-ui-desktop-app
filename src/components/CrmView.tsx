import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, twentyStart, twentyStop, twentyStatus, twentyGraphql,
} from '../lib/backend';
import {
  Database, Play, Square, PlaySquare, Code,
  Loader2, WifiOff, X, ChevronRight, Zap, Users, Building2,
  FileText, Globe, Mail,
} from 'lucide-react';

interface TwentyStatus {
  running: boolean;
  uptime?: string;
  version?: string;
  port?: number;
  url?: string;
}

interface QueryResult {
  data: unknown;
  errors?: Array<{ message: string }>;
  extensions?: Record<string, unknown>;
  elapsed?: number;
}

interface QuickQuery {
  label: string;
  icon: typeof Database;
  query: string;
  color: string;
}

const QUICK_QUERIES: QuickQuery[] = [
  {
    label: 'List Contacts',
    icon: Users,
    query: `query ListContacts {
  people {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
        phones { phoneNumber }
        createdAt
      }
    }
  }
}`,
    color: '#38bdf8',
  },
  {
    label: 'List Companies',
    icon: Building2,
    query: `query ListCompanies {
  companies {
    edges {
      node {
        id
        name
        domainName
        employeesCount
        createdAt
      }
    }
  }
}`,
    color: '#a78bfa',
  },
  {
    label: 'List Opportunities',
    icon: Zap,
    query: `query ListOpportunities {
  opportunities {
    edges {
      node {
        id
        name
        amount { amount currencyCode }
        stage
        createdAt
      }
    }
  }
}`,
    color: '#f59e0b',
  },
  {
    label: 'List Notes',
    icon: FileText,
    query: `query ListNotes {
  notes {
    edges {
      node {
        id
        title
        body
        createdAt
      }
    }
  }
}`,
    color: '#22c55e',
  },
  {
    label: 'List Emails',
    icon: Mail,
    query: `query ListEmails {
  messages {
    edges {
      node {
        id
        subject
        receivedAt
        from { address name }
        to { address name }
      }
    }
  }
}`,
    color: '#ef4444',
  },
  {
    label: 'Search People',
    icon: Globe,
    query: `query SearchPeople($filter: PeopleFilterInput) {
  people(filter: $filter) {
    edges {
      node {
        id
        name { firstName lastName }
        emails { primaryEmail }
      }
    }
  }
}`,
    color: '#06b6d4',
  },
];

export function CrmView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<TwentyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(QUICK_QUERIES[0].query);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [queryError, setQueryError] = useState('');

  const [backendOnline, setBackendOnline] = useState(false);

  // Entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current.querySelectorAll('.crm-block'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.06 }, '-=0.15');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  // Check backend + fetch status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      const available = await isBackendAvailable();
      if (cancelled) return;
      setBackendOnline(available);
      if (!available) { setStatusLoading(false); return; }
      try {
        const data = await twentyStatus();
        if (cancelled) return;
        const s = data.status as TwentyStatus;
        setStatus(s);
      } catch {
        if (!cancelled) setStatus({ running: false });
      }
      if (!cancelled) setStatusLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const running = status?.running ?? false;

  const handleToggle = async () => {
    setToggling(true);
    setError('');
    try {
      if (running) {
        await twentyStop();
        setStatus({ running: false });
      } else {
        await twentyStart();
        // Poll briefly for startup
        let attempts = 0;
        const poll = async (): Promise<void> => {
          if (attempts > 8) return;
          attempts++;
          await new Promise((r) => setTimeout(r, 1200));
          try {
            const s = await twentyStatus();
            const st = s.status as TwentyStatus;
            if (st.running) { setStatus(st); return; }
          } catch { /* retry */ }
          if (attempts <= 8) await poll();
        };
        await poll();
        // Final check
        try {
          const s = await twentyStatus();
          setStatus(s.status as TwentyStatus);
        } catch { setStatus({ running: true }); }
      }
    } catch (e) {
      setError(`Operation failed: ${(e as Error).message}`);
    }
    setToggling(false);
  };

  const handleExecute = async () => {
    if (!query.trim()) return;
    setExecuting(true);
    setQueryError('');
    setQueryResult(null);
    try {
      const start = Date.now();
      const res = await twentyGraphql(query);
      const elapsed = Date.now() - start;
      const result = res.result as { data?: unknown; errors?: Array<{ message: string }> };
      setQueryResult({
        data: result?.data ?? res.result,
        errors: result?.errors,
        elapsed,
      });
    } catch (e) {
      setQueryError((e as Error).message);
    }
    setExecuting(false);
  };

  const handleQuickQuery = (qq: QuickQuery) => {
    setQuery(qq.query);
    setQueryResult(null);
    setQueryError('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>CRM</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Twenty CRM · contacts, companies & pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg" style={{
            background: running ? '#22c55e1c' : 'var(--surface-2)',
            border: '1px solid var(--hairline-strong)',
            color: running ? '#22c55e' : 'var(--text-dim)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? '#22c55e' : 'var(--text-faint)', boxShadow: running ? '0 0 8px rgba(34,197,94,0.9)' : 'none' }} />
            {running ? 'Running' : statusLoading ? 'Checking…' : 'Stopped'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]" style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}>
          <WifiOff size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto" style={{ color: '#FF8A8A' }}><X size={12} /></button>
        </div>
      )}

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>

        {/* Stack Status Card */}
        <div className="crm-block card p-5 mb-5" style={{ background: `linear-gradient(135deg, ${avatar.accent}1e, transparent 70%)`, border: `1px solid ${avatar.accent}44` }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: avatar.accent, color: '#fff' }}>
                <Database size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Twenty CRM Stack</p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                  {running ? `Online${status?.port ? ` · port ${status.port}` : ''}${status?.version ? ` · v${status.version}` : ''}` : 'Container stopped · start to access CRM'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggle}
                disabled={toggling || statusLoading}
                className="h-9 px-4 rounded-xl flex items-center gap-2 text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  background: running ? '#ef4444' : '#22c55e',
                  color: '#fff',
                  border: 'none',
                  fontFamily: 'var(--font)',
                }}
              >
                {toggling ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : running ? (
                  <Square size={13} />
                ) : (
                  <Play size={13} />
                )}
                {toggling ? (running ? 'Stopping…' : 'Starting…') : (running ? 'Stop CRM' : 'Start CRM')}
              </button>
            </div>
          </div>
          {/* Status detail row */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: 'Status', value: running ? 'Active' : 'Offline', color: running ? '#22c55e' : 'var(--text-faint)' },
              { label: 'Backend', value: backendOnline ? 'Connected' : 'Unavailable', color: backendOnline ? '#38bdf8' : '#ef4444' },
              { label: 'API', value: running ? `localhost:${status?.port ?? '—'}` : '—', color: running ? avatar.accent : 'var(--text-faint)' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--hairline)' }}>
                <p className="text-base font-bold tabular-nums" style={{ color: s.color, fontFamily: 'var(--font)' }}>{s.value}</p>
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-faint)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* GraphQL Query Card */}
        <div className="crm-block card p-5 mb-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Code size={15} style={{ color: avatar.accent }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>GraphQL Query</p>
            </div>
            <button
              onClick={handleExecute}
              disabled={executing || !running || !query.trim()}
              className="h-8 px-3.5 rounded-xl flex items-center gap-1.5 text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
            >
              {executing ? <Loader2 size={12} className="animate-spin" /> : <PlaySquare size={12} />}
              {executing ? 'Executing…' : 'Execute'}
            </button>
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="query { people { edges { node { id name } } } }"
            spellCheck={false}
            className="w-full rounded-xl px-4 py-3 text-[12px] leading-relaxed resize-y outline-none"
            style={{
              minHeight: 160,
              maxHeight: 360,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid var(--hairline-strong)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
              tabSize: 2,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleExecute();
              }
            }}
          />
          <p className="text-[10px] mt-1.5 font-light" style={{ color: 'var(--text-faint)' }}>
            Ctrl+Enter to execute · JSON variables supported
          </p>

          {/* Query Error */}
          {queryError && (
            <div className="mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]" style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}>
              <WifiOff size={13} /> {queryError}
            </div>
          )}

          {/* Query Results */}
          {queryResult && (
            <div className="mt-3 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--hairline-strong)' }}>
              <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--hairline)' }}>
                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-faint)' }}>Result</span>
                <div className="flex items-center gap-3">
                  {queryResult.elapsed !== undefined && (
                    <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>{queryResult.elapsed}ms</span>
                  )}
                  {queryResult.errors?.length ? (
                    <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>{queryResult.errors.length} error{queryResult.errors.length > 1 ? 's' : ''}</span>
                  ) : (
                    <span className="text-[10px] font-medium" style={{ color: '#22c55e' }}>OK</span>
                  )}
                </div>
              </div>
              <pre className="px-4 py-3 text-[11px] leading-relaxed overflow-x-auto" style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
                maxHeight: 400,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {JSON.stringify(queryResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Quick Queries Card */}
        <div className="crm-block card p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={15} style={{ color: '#f59e0b' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Quick Queries</p>
            </div>
            <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>Click to load</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {QUICK_QUERIES.map((qq) => {
              const Icon = qq.icon;
              const isActive = query.trim() === qq.query.trim();
              return (
                <button
                  key={qq.label}
                  onClick={() => handleQuickQuery(qq)}
                  disabled={!running}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-left transition-all hover:opacity-90 disabled:opacity-40"
                  style={{
                    background: isActive ? `${qq.color}16` : 'rgba(255,255,255,0.022)',
                    border: `1px solid ${isActive ? `${qq.color}44` : 'var(--hairline)'}`,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font)',
                  }}
                >
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                    background: `${qq.color}16`,
                    color: qq.color,
                    border: `1px solid ${qq.color}33`,
                  }}>
                    <Icon size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{qq.label}</p>
                  </div>
                  <ChevronRight size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
