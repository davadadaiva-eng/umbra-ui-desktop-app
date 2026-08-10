import { useRef, useEffect, useState, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Search, Settings2, Plug, ExternalLink, Zap, Cloud, Globe, BarChart3, MessageSquare, CreditCard, Database, Music, Video, Clock, Code2, Video as VideoIcon, Phone, Headphones } from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'connected' | 'disconnected';
}

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  Cloud: <Cloud size={13} />,
  Data: <Database size={13} />,
  Sales: <MessageSquare size={13} />,
  Media: <Video size={13} />,
  Finance: <CreditCard size={13} />,
  Dev: <Code2 size={13} />,
};

const CATEGORIES = ['All', 'Cloud', 'Data', 'Sales', 'Media', 'Finance', 'Dev'];

const ICONS: Record<string, JSX.Element> = {
  'Google Drive': <Cloud size={16} />, 'Dropbox': <Cloud size={16} />, 'OneDrive': <Cloud size={16} />,
  'Google Calendar': <Clock size={16} />, 'Notion': <Globe size={16} />,
  'Supabase': <Database size={16} />, 'PostgreSQL': <Database size={16} />, 'BigQuery': <BarChart3 size={16} />,
  'Neon': <Database size={16} />, 'TencentDB': <Database size={16} />,
  'HubSpot': <MessageSquare size={16} />, 'Salesforce': <MessageSquare size={16} />, 'Attio': <MessageSquare size={16} />,
  'Slack': <MessageSquare size={16} />, 'Intercom': <MessageSquare size={16} />,
  'YouTube Studio': <Video size={16} />, 'Twitch': <Video size={16} />, 'Spotify': <Music size={16} />,
  'Adobe Premiere': <Video size={16} />, 'Descript': <Video size={16} />,
  'Stripe': <CreditCard size={16} />, 'PayPal': <CreditCard size={16} />, 'QuickBooks': <BarChart3 size={16} />,
  'Xero': <BarChart3 size={16} />, 'Revolut': <CreditCard size={16} />,
  'GitHub': <Code2 size={16} />, 'GitLab': <Code2 size={16} />, 'Linear': <Plug size={16} />,
  'Figma': <Plug size={16} />, 'Vercel': <Zap size={16} />,
};

const SEED: Integration[] = [
  { id: 'drive', name: 'Google Drive', category: 'Cloud', description: 'File ops — read, write, sync with Workspace', status: 'connected' },
  { id: 'supabase', name: 'Supabase', category: 'Data', description: 'Postgres + auth + realtime over direct DB pool', status: 'connected' },
  { id: 'slack', name: 'Slack', category: 'Sales', description: 'Message, thread, canvas and workflow publishing', status: 'connected' },
  { id: 'stripe', name: 'Stripe', category: 'Finance', description: 'Payments, subscriptions, refunds and payouts', status: 'connected' },
  { id: 'github', name: 'GitHub', category: 'Dev', description: 'Repos, PRs, issues and Actions orchestration', status: 'connected' },
  { id: 'notion', name: 'Notion', category: 'Cloud', description: 'Pages, databases and workspace search', status: 'connected' },
  { id: 'bigquery', name: 'BigQuery', category: 'Data', description: 'Serverless analytics at petabyte scale', status: 'connected' },
  { id: 'hubspot', name: 'HubSpot', category: 'Sales', description: 'CRM objects, deals and sequences', status: 'connected' },
  { id: 'figma', name: 'Figma', category: 'Dev', description: 'Design tokens and component inspection', status: 'connected' },
  { id: 'youtube', name: 'YouTube Studio', category: 'Media', description: 'Upload, schedule and community posts', status: 'connected' },
  { id: 'spotify', name: 'Spotify', category: 'Media', description: 'Playlists, release scheduling, analytics', status: 'connected' },
  { id: 'vercel', name: 'Vercel', category: 'Dev', description: 'Deployments, previews and env variables', status: 'connected' },
  { id: 'intercom', name: 'Intercom', category: 'Sales', description: 'Inbox, auto-resolve and support flows', status: 'connected' },
  { id: 'quickbooks', name: 'QuickBooks', category: 'Finance', description: 'Bookkeeping, invoices and tax reports', status: 'connected' },
  { id: 'drive-backup', name: 'OneDrive', category: 'Cloud', description: 'Personal cloud file sync', status: 'disconnected' },
  { id: 'postgres', name: 'PostgreSQL', category: 'Data', description: 'Direct connection — own host or VPS', status: 'disconnected' },
  { id: 'salesforce', name: 'Salesforce', category: 'Sales', description: 'Enterprise CRM and marketing cloud', status: 'disconnected' },
  { id: 'twitch', name: 'Twitch', category: 'Media', description: 'Go live, clips and chat moderation', status: 'disconnected' },
  { id: 'paypal', name: 'PayPal', category: 'Finance', description: 'Payments and marketplace payouts', status: 'disconnected' },
  { id: 'linear', name: 'Linear', category: 'Dev', description: 'Issues, cycles and roadmap automation', status: 'disconnected' },
  { id: 'dropbox', name: 'Dropbox', category: 'Cloud', description: 'File storage and paper docs', status: 'disconnected' },
  { id: 'neon', name: 'Neon', category: 'Data', description: 'Serverless Postgres with branching', status: 'disconnected' },
  { id: 'attio', name: 'Attio', category: 'Sales', description: 'Modern relationship CRM', status: 'disconnected' },
  { id: 'descript', name: 'Descript', category: 'Media', description: 'Audio/video editing by transcript', status: 'disconnected' },
  { id: 'xero', name: 'Xero', category: 'Finance', description: 'Small business accounting', status: 'disconnected' },
  { id: 'gitlab', name: 'GitLab', category: 'Dev', description: 'DevOps with built-in CI/CD', status: 'disconnected' },
  { id: 'calendar', name: 'Google Calendar', category: 'Cloud', description: 'Events, availability and reminders', status: 'disconnected' },
  { id: 'premiere', name: 'Adobe Premiere', category: 'Media', description: 'Programmatic video editing via .prproj', status: 'disconnected' },
  { id: 'revolut', name: 'Revolut', category: 'Finance', description: 'Business cards, FX and multi-currency', status: 'disconnected' },
  { id: 'tencentdb', name: 'TencentDB', category: 'Data', description: 'China-region relational database', status: 'disconnected' },
];

const CONNECTOR_GROUP: { id: string; name: string; desc: string; icon: React.ReactNode; accent: string; connected: boolean }[] = [
  { id: 'meet', name: 'Google Meet', desc: 'Join calls, take minutes, store them in the brain', icon: <VideoIcon size={15} />, accent: '#22C55E', connected: true },
  { id: 'zoom', name: 'Zoom', desc: 'Attend meetings and auto-summarize', icon: <VideoIcon size={15} />, accent: '#3B82F6', connected: true },
  { id: 'teams', name: 'Microsoft Teams', desc: 'Channels, calls and transcript capture', icon: <VideoIcon size={15} />, accent: '#8B5CF6', connected: false },
  { id: 'phone', name: 'Phone calls', desc: 'Take calls and keep the minutes in the vault', icon: <Phone size={15} />, accent: '#F59E0B', connected: true },
  { id: 'voice', name: 'Umbra voice', desc: 'Always-listening wake word and tap-to-talk', icon: <Headphones size={15} />, accent: '#60A5FA', connected: true },
];

export function ConnectorsView() {
  const { avatar, setView } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [integrations, setIntegrations] = useState<Integration[]>(SEED);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (gridRef.current) {
        tl.fromTo(gridRef.current.querySelectorAll('.integration-card'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.03 }, '-=0.15');
      }
    }, [headerRef, gridRef]);
    return () => ctx.revert();
  }, []);

  const connectedCount = integrations.filter((i) => i.status === 'connected').length;
  const filtered = integrations.filter((i) => {
    const matchesCategory = category === 'All' || i.category === category;
    const matchesQuery = `${i.name} ${i.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const toggle = (id: string) => {
    setIntegrations((cur) => cur.map((i) => (i.id === id ? { ...i, status: i.status === 'connected' ? 'disconnected' : 'connected' } : i)));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Connectors</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {connectedCount} of {integrations.length} MCP servers connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations…"
              className="bg-transparent outline-none text-sm w-40"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
          </div>
          <button className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }}>
            <Settings2 size={13} /> Manage MCP
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <p className="text-[11px] font-medium uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Meetings & voice</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {CONNECTOR_GROUP.map((c) => (
            <button
              key={c.id}
              onClick={() => c.id === 'phone' || c.id === 'meet' || c.id === 'zoom' || c.id === 'teams' ? setView('meetings') : setView('agent')}
              className="integration-card card flex items-start gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${c.accent}66`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}
            >
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c.accent}16`, color: c.accent, border: `1px solid ${c.accent}44` }}>
                {c.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{c.name}</span>
                <span className="block text-[11px] font-light mt-1 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{c.desc}</span>
                <span className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: c.connected ? '#22c55e' : 'var(--text-faint)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.connected ? '#22c55e' : 'var(--text-faint)', boxShadow: c.connected ? '0 0 6px rgba(34,197,94,0.8)' : 'none' }} />
                  {c.connected ? 'Ready' : 'Add'}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>MCP servers</p>
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{
                  background: category === c ? avatar.accent : 'var(--surface-2)',
                  color: category === c ? '#fff' : 'var(--text-dim)',
                  border: `1px solid ${category === c ? 'transparent' : 'var(--hairline-strong)'}`,
                  fontFamily: 'var(--font)',
                }}
              >
                {c !== 'All' && CATEGORY_ICONS[c]}
                {c}
              </button>
            ))}
          </div>
        </div>

        <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((i) => {
            const connected = i.status === 'connected';
            return (
              <div key={i.id} className="integration-card card flex items-start gap-3 p-4" style={{ background: 'var(--surface-1)' }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                  {ICONS[i.name] ?? <Plug size={15} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{i.name}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
                        {CATEGORY_ICONS[i.category]} {i.category}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] font-light mt-1 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{i.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: connected ? '#22c55e' : 'var(--text-faint)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : 'var(--text-faint)', boxShadow: connected ? '0 0 6px rgba(34,197,94,0.8)' : 'none' }} />
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}
                        title="Open docs"
                      >
                        <ExternalLink size={10} /> Docs
                      </button>
                      <button
                        onClick={() => toggle(i.id)}
                        className="relative rounded-full transition-colors"
                        style={{ width: 32, height: 18, background: connected ? avatar.accent : 'var(--surface-3)', border: '1px solid var(--hairline-strong)' }}
                        title={connected ? 'Disconnect' : 'Connect'}
                      >
                        <span
                          className="absolute rounded-full"
                          style={{
                            width: 12, height: 12, top: 2,
                            left: connected ? 16 : 2,
                            background: connected ? '#fff' : 'var(--text-faint)',
                            transition: 'left 0.18s ease',
                          }}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm font-light text-center py-16" style={{ color: 'var(--text-faint)' }}>No integrations match this filter.</p>
        )}
      </div>
    </div>
  );
}
