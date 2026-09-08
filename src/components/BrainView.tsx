import { useEffect, useMemo, useState, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, searchKnowledge, recallMemory, rememberMemory,
  getMacros, getSessions, getActivitySummary, getPrivacyStats,
  generateJournal,
  type KnowledgeResult,
} from '../lib/backend';
import { Search, X, Bot, FileText, Brain, ChevronRight, MessageSquare, Database, Bookmark, Sparkles, Zap, Clock, BarChart3, Shield, RefreshCw } from 'lucide-react';

interface AgentMemoryBlock {
  agentId: string;
  agentName: string;
  icon: React.ReactNode;
  accent: string;
  memories: { id: string; title: string; snippet: string; kind: string; ts?: number }[];
}

const AGENT_COLORS: Record<string, string> = {
  'Umbra': '#3B82F6',
  'Maya': '#A78BFA',
  'Leo': '#22D3EE',
  'Nova': '#F472B6',
  'Atlas': '#FB923C',
  'default': '#60A5FA',
};

function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? AGENT_COLORS['default'];
}

type TabId = 'memory' | 'macros' | 'sessions' | 'activity' | 'privacy';

interface MacroEntry {
  id: string;
  name: string;
  description?: string;
  trigger?: string;
  steps?: number;
  runs?: number;
  enabled?: boolean;
}

interface SessionEntry {
  id: string;
  agent?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  status?: string;
}

export function BrainView({ recallOpen = false, onRecallOpenChange }: { recallOpen?: boolean; onRecallOpenChange?: (v: boolean) => void }) {
  const { agents, profile, journal, brainFiles, avatar, clearBrain } = useAppStore();
  const accent = avatar.accent;
  const [search, setSearch] = useState('');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(() => new Set(['you', 'umbra']));
  const [backendKnowledge, setBackendKnowledge] = useState<KnowledgeResult[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<TabId>('memory');

  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activitySummary, setActivitySummary] = useState<Record<string, unknown>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [privacyStats, setPrivacyStats] = useState<Record<string, unknown>>({});
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const [journalGenerating, setJournalGenerating] = useState(false);
  const [rememberText, setRememberText] = useState('');
  const [remembering, setRemembering] = useState(false);
  const [rememberSuccess, setRememberSuccess] = useState<string | null>(null);

  // Fetch knowledge from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const q = search.trim() || 'all';
        const { results } = await searchKnowledge(q);
        if (!cancelled && results.length) setBackendKnowledge(results);
      } catch { /* keep local data */ }
    })();
    return () => { cancelled = true; };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable()) || !search.trim()) return;
      try {
        const { results } = await recallMemory(search.trim());
        if (!cancelled && results.length) {
          const mapped: KnowledgeResult[] = results.map((r: unknown) => {
            const obj = r as Record<string, unknown>;
            return {
              id: String(obj.id ?? `recall-${Date.now()}`),
              name: String(obj.name ?? obj.text ?? 'Memory'),
              kind: String(obj.kind ?? 'memory'),
              snippet: String(obj.snippet ?? obj.text ?? ''),
              score: Number(obj.score ?? 0.5),
            };
          });
          setBackendKnowledge((prev) => [...prev, ...mapped]);
        }
      } catch { /* keep local data */ }
    })();
    return () => { cancelled = true; };
  }, [search]);

  const toggleAgent = (id: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fetch data for each backend tab
  const fetchMacros = async () => {
    setMacrosLoading(true);
    try {
      if (!(await isBackendAvailable())) { setMacros([]); return; }
      const data = await getMacros();
      setMacros((data.macros ?? []) as MacroEntry[]);
    } catch { setMacros([]); }
    setMacrosLoading(false);
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      if (!(await isBackendAvailable())) { setSessions([]); return; }
      const data = await getSessions();
      setSessions((data.sessions ?? []) as SessionEntry[]);
    } catch { setSessions([]); }
    setSessionsLoading(false);
  };

  const fetchActivity = async () => {
    setActivityLoading(true);
    try {
      if (!(await isBackendAvailable())) { setActivitySummary({}); return; }
      const data = await getActivitySummary();
      setActivitySummary(data ?? {});
    } catch { setActivitySummary({}); }
    setActivityLoading(false);
  };

  const fetchPrivacy = async () => {
    setPrivacyLoading(true);
    try {
      if (!(await isBackendAvailable())) { setPrivacyStats({}); return; }
      const data = await getPrivacyStats();
      setPrivacyStats(data ?? {});
    } catch { setPrivacyStats({}); }
    setPrivacyLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'macros') fetchMacros();
    else if (activeTab === 'sessions') fetchSessions();
    else if (activeTab === 'activity') fetchActivity();
    else if (activeTab === 'privacy') fetchPrivacy();
  }, [activeTab]);

  const handleGenerateJournal = async () => {
    setJournalGenerating(true);
    try {
      if (await isBackendAvailable()) {
        await generateJournal();
        window.location.reload();
      }
    } catch { /* ignore */ }
    setJournalGenerating(false);
  };

  const handleRemember = async () => {
    if (!rememberText.trim()) return;
    setRemembering(true);
    setRememberSuccess(null);
    try {
      if (await isBackendAvailable()) {
        await rememberMemory(rememberText.trim());
        setRememberSuccess('Saved to memory.');
        setRememberText('');
      } else {
        setRememberSuccess('Backend unavailable.');
      }
    } catch {
      setRememberSuccess('Failed to save.');
    }
    setRemembering(false);
    setTimeout(() => setRememberSuccess(null), 3000);
  };

  // Build agent memory blocks
  const agentBlocks: AgentMemoryBlock[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const blocks: AgentMemoryBlock[] = [];

    // 1) Profile (You)
    const profileMemories: AgentMemoryBlock['memories'] = [];
    if (profile) {
      if (profile.name) profileMemories.push({ id: 'profile-name', title: 'Name', snippet: profile.name, kind: 'profile' });
      if (profile.about) profileMemories.push({ id: 'profile-about', title: 'About', snippet: profile.about, kind: 'profile' });
      for (const f of profile.facts) {
        profileMemories.push({ id: `fact-${f}`, title: 'Fact', snippet: f, kind: 'fact' });
      }
    }
    if (profileMemories.length) {
      blocks.push({ agentId: 'you', agentName: 'You', icon: <Sparkles size={15} />, accent: accent, memories: profileMemories });
    }

    // 2) Umbra core memory
    const umbraMemories: AgentMemoryBlock['memories'] = [];
    for (const f of brainFiles) {
      umbraMemories.push({ id: `file-${f.id}`, title: f.name, snippet: f.content.slice(0, 200), kind: 'file', ts: f.id.includes('_') ? undefined : undefined });
    }
    const backendMapped = backendKnowledge.map((k) => ({
      id: `bk-${k.id}`, title: k.name, snippet: k.snippet.slice(0, 200), kind: k.kind,
    }));
    const allUmbra = [...umbraMemories, ...backendMapped];
    if (allUmbra.length) {
      blocks.push({ agentId: 'umbra', agentName: 'Umbra', icon: <Brain size={15} />, accent: agentColor('Umbra'), memories: allUmbra });
    }

    // 3) Each spawned agent
    for (const a of agents) {
      const agentMems: AgentMemoryBlock['memories'] = [];
      agentMems.push({ id: `task-${a.id}`, title: 'Task', snippet: a.task, kind: 'task' });
      agentMems.push({ id: `status-${a.id}`, title: 'Status', snippet: a.status, kind: 'status' });
      // Find journal entries from this agent
      const agentJournal = journal.filter((e) => e.type === 'agent').slice(-10);
      for (const j of agentJournal) {
        agentMems.push({ id: `j-${j.id}`, title: j.type, snippet: j.text.slice(0, 200), kind: 'journal', ts: j.ts });
      }
      if (agentMems.length) {
        blocks.push({ agentId: a.id, agentName: a.name, icon: <Bot size={15} />, accent: agentColor(a.name), memories: agentMems });
      }
    }

    // 4) Journal entries (unassigned)
    const recentJournal = journal.slice(-20);
    if (recentJournal.length && blocks.length <= 1) {
      const journalMems: AgentMemoryBlock['memories'] = recentJournal.map((e) => ({
        id: `j-${e.id}`,
        title: `${e.type === 'user' ? 'You' : e.type === 'agent' ? 'Agent' : 'Action'}`,
        snippet: e.text.slice(0, 200),
        kind: 'journal',
        ts: e.ts,
      }));
      blocks.push({ agentId: 'journal', agentName: 'Journal', icon: <MessageSquare size={15} />, accent: '#9CA3AF', memories: journalMems });
    }

    // Filter by search
    if (q) {
      return blocks.map((b) => ({
        ...b,
        memories: b.memories.filter((m) => `${m.title} ${m.snippet} ${m.kind}`.toLowerCase().includes(q)),
      })).filter((b) => b.memories.length > 0);
    }

    return blocks;
  }, [agents, profile, journal, brainFiles, backendKnowledge, search, accent]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? `${hh}:${mm}` : `${d.toLocaleDateString()} ${hh}:${mm}`;
  };

  const kindColor = (kind: string) => {
    switch (kind) {
      case 'profile': return '#22C55E';
      case 'fact': return '#A78BFA';
      case 'file': return '#3B82F6';
      case 'knowledge': return '#60A5FA';
      case 'memory': return '#22D3EE';
      case 'task': return '#F472B6';
      case 'status': return '#FB923C';
      case 'journal': return '#9CA3AF';
      default: return '#60A5FA';
    }
  };

  const kindIcon = (kind: string) => {
    switch (kind) {
      case 'profile': return <Sparkles size={11} />;
      case 'fact': return <Bookmark size={11} />;
      case 'file': return <FileText size={11} />;
      case 'knowledge': return <Database size={11} />;
      case 'memory': return <Brain size={11} />;
      case 'task': return <Bot size={11} />;
      case 'journal': return <MessageSquare size={11} />;
      default: return <FileText size={11} />;
    }
  };

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'memory', label: 'Memory', icon: <Brain size={13} /> },
    { id: 'macros', label: 'Macros', icon: <Zap size={13} /> },
    { id: 'sessions', label: 'Sessions', icon: <Clock size={13} /> },
    { id: 'activity', label: 'Activity', icon: <BarChart3 size={13} /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield size={13} /> },
  ];

  const fmtMs = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  const renderKeyValue = (obj: Record<string, unknown>, indent = 0) => {
    return Object.entries(obj).map(([k, v]) => {
      const display = typeof v === 'object' && v !== null
        ? JSON.stringify(v)
        : String(v ?? '');
      return (
        <div key={k} className="flex justify-between gap-4 py-1.5" style={{ paddingLeft: indent * 12 }}>
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>{k}</span>
          <span className="text-[11px] font-light text-right truncate max-w-[260px]" style={{ color: 'var(--text-faint)' }}>{display}</span>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Memory</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Everything your agents remember — organized by who knows it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory…"
              className="bg-transparent outline-none text-sm w-40"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--text-faint)' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => onRecallOpenChange?.(!recallOpen)}
            className="flex items-center gap-1.5 px-3.5 rounded-xl text-[11px] font-medium"
            style={{
              height: 34,
              color: recallOpen ? accent : 'var(--text-dim)',
              background: recallOpen ? `${accent}18` : 'var(--surface-2)',
              border: `1px solid ${recallOpen ? `${accent}55` : 'var(--hairline-strong)'}`,
              fontFamily: 'var(--font)',
            }}
          >
            <Bookmark size={12} /> Recall
          </button>
          <button
            onClick={() => {
              if (window.confirm("Clear all memory? This wipes the journal, your profile and agent data — only this app's data.")) {
                clearBrain();
                window.location.reload();
              }
            }}
            className="flex items-center justify-center rounded-xl"
            style={{ height: 34, width: 34, color: '#8a5a5a', border: '1px solid var(--hairline-strong)', background: 'var(--surface-2)' }}
            title="Clear all memory"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1 hairline-b" style={{ background: 'rgba(6,7,9,0.45)', backdropFilter: 'blur(12px)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium rounded-t-lg transition-colors"
            style={{
              color: activeTab === tab.id ? accent : 'var(--text-faint)',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.03)' : 'transparent',
              borderBottom: `2px solid ${activeTab === tab.id ? accent : 'transparent'}`,
              fontFamily: 'var(--font)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>

        {/* ── Memory Tab ──────────────────────────────────────────── */}
        {activeTab === 'memory' && (
          <>
            {/* Remember via backend */}
            <div className="mb-5 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline-strong)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Brain size={13} style={{ color: accent }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>Remember something</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={rememberText}
                  onChange={(e) => setRememberText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRemember(); }}
                  placeholder="Add a fact to memory…"
                  className="flex-1 bg-transparent outline-none text-[12px] px-3 py-2 rounded-lg"
                  style={{ color: 'var(--text-primary)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
                  disabled={remembering}
                />
                <button
                  onClick={handleRemember}
                  disabled={remembering || !rememberText.trim()}
                  className="flex items-center gap-1.5 px-3.5 rounded-lg text-[11px] font-medium transition-opacity"
                  style={{
                    height: 34,
                    color: accent,
                    background: `${accent}14`,
                    border: `1px solid ${accent}44`,
                    opacity: remembering || !rememberText.trim() ? 0.5 : 1,
                    fontFamily: 'var(--font)',
                  }}
                >
                  <Bookmark size={11} />
                  {remembering ? 'Saving…' : 'Remember'}
                </button>
              </div>
              {rememberSuccess && (
                <p className="text-[10px] mt-1.5 font-light" style={{ color: rememberSuccess === 'Saved to memory.' ? '#22C55E' : '#F87171' }}>
                  {rememberSuccess}
                </p>
              )}
            </div>

            {/* Journal generation button */}
            <div className="mb-5 flex items-center gap-2">
              <button
                onClick={handleGenerateJournal}
                disabled={journalGenerating}
                className="flex items-center gap-1.5 px-3.5 rounded-lg text-[11px] font-medium transition-opacity"
                style={{
                  height: 34,
                  color: '#A78BFA',
                  background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  opacity: journalGenerating ? 0.5 : 1,
                  fontFamily: 'var(--font)',
                }}
              >
                <RefreshCw size={12} className={journalGenerating ? 'animate-spin' : ''} />
                {journalGenerating ? 'Generating…' : 'Generate Journal'}
              </button>
              <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                Asks the backend to synthesize a new journal entry from recent activity.
              </span>
            </div>

            {agentBlocks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: `${accent}14`, border: `1px solid ${accent}33`, color: accent }}>
                  <Brain size={22} />
                </span>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No memories yet</p>
                <p className="text-[11px] font-light mt-1" style={{ color: 'var(--text-faint)' }}>Talk to your agents and everything gets stored here.</p>
              </div>
            )}

            {agentBlocks.map((block) => {
              const expanded = expandedAgents.has(block.agentId);
              const totalMemories = block.memories.length;
              return (
                <div key={block.agentId} className="mb-3">
                  {/* Agent header */}
                  <button
                    onClick={() => toggleAgent(block.agentId)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left"
                    style={{
                      background: expanded ? `${block.accent}0a` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${expanded ? `${block.accent}33` : 'var(--hairline-strong)'}`,
                    }}
                    onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.borderColor = `${block.accent}44`; }}
                    onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${block.accent}16`, color: block.accent, border: `1px solid ${block.accent}44` }}
                    >
                      {block.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{block.agentName}</span>
                      <span className="text-[11px] font-light ml-2" style={{ color: 'var(--text-faint)' }}>{totalMemories} {totalMemories === 1 ? 'memory' : 'memories'}</span>
                    </div>
                    <span style={{ color: '#666', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
                      <ChevronRight size={14} />
                    </span>
                  </button>

                  {/* Memory entries */}
                  {expanded && (
                    <div className="mt-1.5 ml-4 space-y-1 border-l" style={{ borderColor: `${block.accent}22`, paddingLeft: 12 }}>
                      {block.memories.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(255,255,255,0.015)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                        >
                          <span
                            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: `${kindColor(m.kind)}1c`, color: kindColor(m.kind), border: `1px solid ${kindColor(m.kind)}33` }}
                          >
                            {kindIcon(m.kind)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{m.title}</span>
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-medium flex-shrink-0"
                                style={{ background: `${kindColor(m.kind)}14`, color: kindColor(m.kind), border: `1px solid ${kindColor(m.kind)}22` }}
                              >
                                {m.kind}
                              </span>
                              {m.ts && (
                                <span className="text-[10px] flex-shrink-0 ml-auto" style={{ color: 'var(--text-faint)' }}>{fmtTime(m.ts)}</span>
                              )}
                            </div>
                            <p
                              className="text-[11px] font-light leading-relaxed mt-1"
                              style={{
                                color: 'var(--text-dim)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {m.snippet}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── Macros Tab ──────────────────────────────────────────── */}
        {activeTab === 'macros' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={14} style={{ color: '#FB923C' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Detected Automation Macros</span>
              </div>
              <button
                onClick={fetchMacros}
                disabled={macrosLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-opacity"
                style={{ color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', opacity: macrosLoading ? 0.5 : 1 }}
              >
                <RefreshCw size={10} className={macrosLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {macrosLoading && macros.length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>Loading macros…</p>
            )}
            {!macrosLoading && macros.length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>No macros detected yet.</p>
            )}
            {macros.map((m, i) => (
              <div
                key={m.id ?? i}
                className="flex items-start gap-3 px-4 py-3 rounded-xl mb-2 transition-colors"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline-strong)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.3)' }}>
                  <Zap size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{m.name ?? `Macro ${i + 1}`}</span>
                    {m.enabled === false && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-medium" style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}>disabled</span>
                    )}
                  </div>
                  {m.description && <p className="text-[11px] font-light mt-1" style={{ color: 'var(--text-dim)' }}>{m.description}</p>}
                  <div className="flex gap-3 mt-1.5">
                    {m.trigger && <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>Trigger: {m.trigger}</span>}
                    {m.steps !== undefined && <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>{m.steps} steps</span>}
                    {m.runs !== undefined && <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>{m.runs} runs</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Sessions Tab ────────────────────────────────────────── */}
        {activeTab === 'sessions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: '#22D3EE' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Activity Sessions</span>
              </div>
              <button
                onClick={fetchSessions}
                disabled={sessionsLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-opacity"
                style={{ color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', opacity: sessionsLoading ? 0.5 : 1 }}
              >
                <RefreshCw size={10} className={sessionsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {sessionsLoading && sessions.length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>Loading sessions…</p>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>No sessions recorded yet.</p>
            )}
            {sessions.map((s, i) => (
              <div
                key={s.id ?? i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-2 transition-colors"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline-strong)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,211,238,0.12)', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.3)' }}>
                  <Clock size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{s.agent ?? 'Unknown'}</span>
                    {s.status && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-medium"
                        style={{
                          background: s.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)',
                          color: s.status === 'active' ? '#22C55E' : '#9CA3AF',
                          border: `1px solid ${s.status === 'active' ? 'rgba(34,197,94,0.25)' : 'rgba(156,163,175,0.25)'}`,
                        }}
                      >
                        {s.status}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1">
                    {s.startedAt && <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>Started: {s.startedAt}</span>}
                    {s.durationMs !== undefined && <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>Duration: {fmtMs(s.durationMs)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Activity Tab ────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} style={{ color: '#A78BFA' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Activity Summary</span>
              </div>
              <button
                onClick={fetchActivity}
                disabled={activityLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-opacity"
                style={{ color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', opacity: activityLoading ? 0.5 : 1 }}
              >
                <RefreshCw size={10} className={activityLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {activityLoading && Object.keys(activitySummary).length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>Loading activity…</p>
            )}
            {!activityLoading && Object.keys(activitySummary).length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>No activity data available.</p>
            )}
            {Object.keys(activitySummary).length > 0 && (
              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline-strong)' }}>
                {renderKeyValue(activitySummary)}
              </div>
            )}
          </div>
        )}

        {/* ── Privacy Tab ─────────────────────────────────────────── */}
        {activeTab === 'privacy' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={14} style={{ color: '#22C55E' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Privacy Guard Stats</span>
              </div>
              <button
                onClick={fetchPrivacy}
                disabled={privacyLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-opacity"
                style={{ color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', opacity: privacyLoading ? 0.5 : 1 }}
              >
                <RefreshCw size={10} className={privacyLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {privacyLoading && Object.keys(privacyStats).length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>Loading privacy stats…</p>
            )}
            {!privacyLoading && Object.keys(privacyStats).length === 0 && (
              <p className="text-[11px] font-light py-8 text-center" style={{ color: 'var(--text-faint)' }}>No privacy data available.</p>
            )}
            {Object.keys(privacyStats).length > 0 && (
              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline-strong)' }}>
                {renderKeyValue(privacyStats)}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
