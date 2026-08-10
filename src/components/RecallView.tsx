import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAppStore, type View } from '../stores/appStore';
import { Send, Sparkles, FileText, Bot } from 'lucide-react';
import { brainNotes, attachmentNotes, type BrainNote } from '../lib/brain';

const VIEWS: View[] = ['agent', 'recall', 'brain', 'skills', 'vault', 'connectors', 'meetings', 'usage', 'phone', 'devices', 'desktop2', 'settings'];

interface Source {
  id: string;
  label: string;
  kind: 'file' | 'agent' | 'view';
  meta?: string;
  view?: View;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
}

interface IndexItem {
  kind: 'file' | 'agent' | 'view';
  id: string;
  label: string;
  meta?: string;
  view?: View;
  words: string[];
}

const suggestions = [
  'What did I work on today?',
  'Show me my agents',
  'Where did I put the whitepaper?',
  'What is in my brain?',
];

export { suggestions };

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildIndex(agents: { id: string; name: string; task: string; status: string }[], files: { id: string; name: string; type: string; size: string; date: string; content?: string }[]): IndexItem[] {
  const items: IndexItem[] = files.map((f) => ({
    kind: 'file',
    id: f.id,
    label: f.name,
    meta: `${f.type} — ${f.size} — ${f.date}`,
    words: tokenize(`${f.name} ${f.type} ${f.date}`),
  }));
  agents.forEach((a) => {
    items.push({
      kind: 'agent',
      id: a.id,
      label: a.name,
      meta: `${a.task} — ${a.status}`,
      words: tokenize(`${a.name} ${a.task} ${a.status}`),
    });
  });
  VIEWS.forEach((v) => {
    items.push({
      kind: 'view',
      id: v,
      label: v.charAt(0).toUpperCase() + v.slice(1),
      meta: 'page',
      view: v,
      words: tokenize(v),
    });
  });
  return items;
}

function searchIndex(items: IndexItem[], query: string, limit = 5): IndexItem[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scored = items
    .map((item) => {
      let score = 0;
      for (const t of terms) {
        const exact = item.words.includes(t);
        const partial = item.words.some((w) => w.startsWith(t) || t.startsWith(w));
        if (exact) score += 2;
        else if (partial) score += 1;
        if (item.label.toLowerCase().includes(t)) score += 1;
      }
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r) => r.item);
}

function filesOnDay(day: 'Today' | 'Yesterday', files: { id: string; name: string; type: string; size: string; date: string; content?: string }[]): typeof files {
  return files.filter((f) => f.date.startsWith(day));
}

const EXPLAIN_STOP: string[] = [
  'how', 'do', 'does', 'is', 'are', 'what', 'why', 'explain', 'tell', 'about',
  'me', 'the', 'it', 'can', 'works', 'work', 'a', 'an', 'and', 'for', 'of', 'to',
  'in', 'on', 'at', 'you', 'your', 'my',
];

function explainFromVault(q: string): { text: string; sources: Source[] } | null {
  const terms = tokenize(q).filter((t) => !EXPLAIN_STOP.includes(t));
  if (terms.length === 0) return null;
  const all = [...brainNotes, ...attachmentNotes];
  const scored = all
    .map((n) => {
      let score = 0;
      const title = tokenize(n.name);
      const content = tokenize(n.content);
      for (const t of terms) {
        if (title.includes(t)) score += 4;
        else if (title.some((w) => w.startsWith(t) || t.startsWith(w))) score += 1;
        if (content.includes(t)) score += 2;
        if (n.tags.includes(t)) score += 2;
      }
      return { n, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  const best = scored[0].n;
  const related = best.links
    .map((id) => all.find((n) => n.id === id))
    .filter((n): n is BrainNote => !!n && n.kind === 'note')
    .slice(0, 3);
  const parts = [`▸ ${best.name}`, best.content];
  if (related.length > 0) {
    parts.push(`Connected in the vault:\n${related.map((r) => `• ${r.name}`).join('\n')}`);
  }
  if (best.tags.length > 0) {
    parts.push(`Tags: ${best.tags.map((t) => `#${t}`).join(' ')}`);
  }
  return {
    text: parts.join('\n\n'),
    sources: [{ id: `note:${best.id}`, label: best.name, kind: 'file' as const, meta: 'vault note — opens the brain graph' }],
  };
}

export function answerFor(raw: string, agents: { id: string; name: string; task: string; status: string }[], avatarName: string, journal: { type: string; text: string; ts: number }[] = [], files: { id: string; name: string; type: string; size: string; date: string; content?: string }[] = []): { text: string; sources?: Source[] } {
  const q = raw.toLowerCase();

  if (/\b(hi|hello|hey|yo|ciao|good (morning|evening|afternoon))\b/.test(q)) {
    return {
      text: `Hey ${avatarName}. I'm the brain — I remember every file, agent, note and page in your workspace. Ask me anything: "what did I do today?", "how does the brain work?", "where is the whitepaper?" — I'll dig through the vault and show sources.`,
    };
  }

  if (/\bthank|thanks|thx\b/.test(q)) {
    return { text: 'Anytime. The vault keeps everything — I\'ll be here when you need me.' };
  }

  if (/how are you|how('s| is) it going/.test(q)) {
    return { text: `All synced and listening, ${avatarName}. ${brainNotes.length} notes, ${attachmentNotes.length} attachments and ${files.length} files in the brain — nothing lost.` };
  }

  if (/who (are|is) (you|umbra)|what (are|can) you do/.test(q)) {
    return {
      text: `I'm Umbra's recall — the memory of your brain. I live on top of the vault:\n▸ ${brainNotes.length} notes, ${attachmentNotes.length} attachments, ${agents.length} agents, ${files.length} recall files\n▸ I search notes first, files second, and always show the sources\n▸ Ask me "how does X work" for an explanation, or "where is X" to locate anything`,
    };
  }

  if (/how many/.test(q)) {
    const lines: string[] = [];
    if (/note|vault|brain|idea|concept/.test(q)) lines.push(`• ${brainNotes.length} vault notes — ${brainNotes.filter((n) => n.kind === 'note').length} notes, ${attachmentNotes.length} attachments`);
    if (/file|recall|attachment|memory/.test(q)) lines.push(`• ${files.length} files in the brain`);
    if (/agent/.test(q)) lines.push(`• ${agents.length} agents — ${agents.filter((a) => a.status === 'running').length} running`);
    if (/page|view/.test(q)) lines.push(`• ${VIEWS.length} pages — agent, connectors, brain, devices, settings`);
    if (lines.length === 0) lines.push(`• ${brainNotes.length} notes, ${files.length} files, ${agents.length} agents, ${VIEWS.length} pages`);
    return { text: `Right now in your brain:\n${lines.join('\n')}` };
  }

  if (/agent|crew|who (is|are) (my|the)|running|spawn/.test(q)) {
    if (agents.length === 0) {
      return { text: 'There are no agents yet — you can spawn one from the Agent page. They\'ll show up in the brain and I\'ll track them here.' };
    }
    const running = agents.filter((a) => a.status === 'running');
    const idle = agents.filter((a) => a.status === 'idle');
    const lines = [
      `Your crew — ${running.length} running, ${idle.length} idle:`,
      ...agents.map((a) => `• ${a.name} — ${a.task} (${a.status})`),
      '',
      'They spawn by voice, watch timelines, queues and indexes, and report back here.',
    ];
    return {
      text: lines.join('\n'),
      sources: agents.map((a) => ({ id: a.id, label: a.name, kind: 'agent' as const, meta: a.task })),
    };
  }

  if (/\b(what|where|when|who)\b.*\b(today|yesterday|done|work(ed)?|do)\b|\btoday\b|\byesterday\b|\brecently\b|what.*happened/.test(q)) {
    const today = filesOnDay('Today', files);
    const yesterday = filesOnDay('Yesterday', files);
    const dayOf = (ts: number) => new Date(ts).toDateString();
    const nowDay = dayOf(Date.now());
    const yesterdayDay = dayOf(Date.now() - 86400000);
    const journalToday = journal.filter((e) => dayOf(e.ts) === nowDay);
    const journalYesterday = journal.filter((e) => dayOf(e.ts) === yesterdayDay);
    const parts: string[] = [];
    const fmt = (f: { name: string; date: string }) => `• ${f.name} — ${f.date.replace(/^(Today|Yesterday), /, '')}`;
    if (today.length > 0) parts.push(`Files today (${today.length}):\n${today.map(fmt).join('\n')}`);
    if (yesterday.length > 0) parts.push(`Files yesterday (${yesterday.length}):\n${yesterday.map(fmt).join('\n')}`);
    if (journalToday.length > 0) parts.push(`Journal, today (${journalToday.length} lines):\n${journalToday.slice(-4).map((e) => `• ${e.text}`).join('\n')}`);
    if (journalYesterday.length > 0) parts.push(`Journal, yesterday (${journalYesterday.length} lines):\n${journalYesterday.slice(-3).map((e) => `• ${e.text}`).join('\n')}`);
    if (parts.length === 0) return { text: 'The brain has nothing from today or yesterday — your last traces are from earlier this week. Files go to Recall, everything said lands in the Journal.' };
    return {
      text: `Here's what the brain remembers:\n${parts.join('\n\n')}`,
      sources: [...today, ...yesterday].map((f) => ({ id: f.id, label: f.name, kind: 'file' as const, meta: f.type })),
    };
  }

  if (/how (do|does|is|are|can)|what is|what are|explain|tell me about|why (is|does|do)|does it work/.test(q)) {
    const explained = explainFromVault(q);
    if (explained) return explained;
  }

  const where = q.match(/(?:where (?:is|are|did i put|did i leave|did you put|is it)\s*|find\s+|search (?:for\s*|the brain for\s*)?)(.+)/);
  const term = where ? where[1] : q;

  const hits = searchIndex(buildIndex(agents, files), term, 4);
  if (hits.length === 0) {
    return {
      text: `I searched the whole brain for "${raw.trim()}" — files, agents, pages, vault notes — and came up empty. Try a file name, an agent, a note topic, or ask "what did I do today?".`,
    };
  }
  const lines = hits.map((h) => `• ${h.label}${h.meta ? ` — ${h.meta}` : ''}`);
  const head = /where/.test(q) && hits[0]
    ? hits[0].kind === 'view'
      ? `It's right here — the ${hits[0].label} page.`
      : `Found ${hits.length === 1 ? 'it' : 'these'} in the brain:`
    : `I searched the brain and found ${hits.length === 1 ? 'this' : 'these'}:`;
  return {
    text: `${head}\n${lines.join('\n')}`,
    sources: hits.map((h) => ({ id: h.id, label: h.label, kind: h.kind, meta: h.meta, view: h.view })),
  };
}

function introText(avatarName: string): string {
  return `Hi ${avatarName} — I'm your brain's memory. Ask me about files, agents, notes or what you did, and I'll search the vault and tell you — with sources.`;
}

export function RecallView() {
  const { avatar, avatarName, agents, setView, journal, brainFiles } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'assistant', text: introText(avatarName) },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (listRef.current) {
        const items = listRef.current.querySelectorAll('.recall-msg');
        const last = items[items.length - 1];
        if (last) {
          gsap.fromTo(last, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
        }
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, listRef);
    return () => ctx.revert();
  }, [messages, thinking]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput('');
    const userMsg: Message = { id: idRef.current++, role: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setThinking(true);
    const delay = 900 + Math.random() * 700;
    window.setTimeout(() => {
      const answer = answerFor(text, agents, avatarName, journal, brainFiles);
      setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', ...answer }]);
      setThinking(false);
    }, delay);
  };

  const openSource = (s: Source) => {
    if (s.kind === 'view' && s.view) setView(s.view);
    else setView('brain');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>
            Recall
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>Ask anything — it searches the brain</p>
        </div>
        <button className="btn-ghost flex items-center gap-2" onClick={() => setView('brain')} style={{ height: 32, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <Sparkles size={13} /> Brain graph
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`recall-msg flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ marginBottom: 14 }}
            >
              {m.role === 'assistant' && (
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mr-3"
                  style={{ background: 'var(--accent-gradient)', boxShadow: '0 2px 12px rgba(59,130,246,0.35)' }}
                >
                  <Bot size={15} style={{ color: '#fff' }} />
                </div>
              )}
              <div
                className={m.role === 'user' ? 'rounded-2xl rounded-br-md px-4 py-2.5 max-w-[78%]' : 'max-w-[85%]'}
                style={
                  m.role === 'user'
                    ? { background: avatar.accent, color: '#fff', fontSize: 14, fontWeight: 500 }
                    : {
                        background: 'var(--surface-1)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 14,
                        borderTopLeftRadius: 4,
                        padding: '12px 16px',
                        whiteSpace: 'pre-line',
                        fontSize: 14,
                        fontWeight: 300,
                        lineHeight: 1.6,
                        color: 'var(--text-primary)',
                      }
                }
              >
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {m.sources.map((s) => (
                      <button
                        key={`${m.id}-${s.id}`}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--veil)', border: '1px solid var(--hairline-strong)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.04em' }}
                        onClick={() => openSource(s)}
                        title={s.meta}
                      >
                        <FileText size={11} style={{ color: avatar.accent }} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="recall-msg flex justify-start">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mr-3"
                style={{ background: 'var(--accent-gradient)', boxShadow: '0 2px 12px rgba(59,130,246,0.35)' }}
              >
                <Bot size={15} style={{ color: '#fff' }} />
              </div>
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 14, borderTopLeftRadius: 4 }}
              >
                <span className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>searching the brain</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: avatar.accent, animation: `blink 1s ${i * 0.18}s infinite` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hairline-t px-6 py-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
            {suggestions.map((s) => (
              <button
                key={s}
                className="btn-ghost flex-shrink-0"
                style={{ height: 28, fontSize: 12, background: 'var(--veil)', borderColor: 'var(--hairline)', color: 'var(--text-dim)' }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send(input);
              }}
              placeholder="Ask your brain something..."
              className="input-field flex-1"
            />
            <button
              className="flex items-center gap-2 px-5"
              style={{ height: 40, borderRadius: 9999, background: 'var(--accent-gradient)', color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', border: 'none', cursor: 'pointer', paddingInline: 22 }}
              onClick={() => send(input)}
              disabled={thinking}
            >
              <Send size={14} /> Ask
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
