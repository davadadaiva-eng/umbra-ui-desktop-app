import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { answerFor, suggestions } from './RecallView';
import { aiChat } from '../lib/ai';
import { brainNotes, attachmentNotes } from '../lib/brain';
import { Send, Bot, FileText, Bookmark, X, Maximize2, Minimize2 } from 'lucide-react';
interface Source {
  id: string;
  label: string;
  kind: 'file' | 'agent' | 'view';
  meta?: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
}

function buildRecallSystem(avatarName: string, agents: { id: string; name: string; task: string; status: string }[], journal: { type: string; text: string; ts: number }[], files: { id: string; name: string; type: string; size: string; date: string; content?: string }[]): string {
  const notes = [...brainNotes, ...attachmentNotes]
    .map((n) => `- ${n.name} [${n.folder}]${n.tags.length ? ` #${n.tags.join(' #')}` : ''}: ${n.content}`)
    .join('\n');
  const fileLines = files.map((f) => `- ${f.name} (${f.type}, ${f.size}, ${f.date})`).join('\n') || '- none yet';
  const agentLines = agents.map((a) => `- ${a.name}: ${a.task} (${a.status})`).join('\n') || '- none';
  const journalLines = journal.slice(-15).map((e) => `- [${e.type}] ${e.text}`).join('\n') || '- empty';
  return [
    `You are the recall/memory assistant of Umbra OS for ${avatarName}.`,
    'You answer from the vault below FIRST, the web second. Always prefer the vault.',
    'Rules:',
    '- For "what did I do today / where is X / show me agents" give a precise structured answer with • bullets.',
    '- For "how does X work / what is X / explain" give a detailed explanation: what it is, how it connects, then key tags.',
    '- Answer in two parts: a short 1-2 line direct answer first, then a detailed • bullet breakdown.',
    '- Keep answers under 200 words. Plain text, no markdown headers, no emoji.',
    '- Cite the exact file or note name in parentheses when you use it.',
    '',
    'Vault notes:',
    notes,
    '',
    'Recall files:',
    fileLines,
    '',
    'Agents:',
    agentLines,
    '',
    'Recent journal:',
    journalLines,
  ].join('\n');
}

export function RecallPanel({
  onClose,
  width = 300,
  maximized = false,
  onToggleMaximize,
  onDragStart,
}: {
  onClose: () => void;
  width?: number | string;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
}) {
  const { avatar, avatarName, agents, addJournal, aiConfig, journal, brainFiles } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'assistant', text: `Hi ${avatarName} — I'm your brain's memory. Ask me about files, agents, or what you did.` },
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
    try {
      addJournal('user', text);
    } catch {
      // ignore
    }
    const fallback = () => {
      const answer = answerFor(text, agents, avatarName, journal, brainFiles);
      setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', ...answer }]);
      setThinking(false);
    };
    if (aiConfig) {
      aiChat(aiConfig, buildRecallSystem(avatarName, agents, journal, brainFiles), text)
        .then((reply) => {
          setMessages((m) => [...m, { id: idRef.current++, role: 'assistant', text: reply }]);
          setThinking(false);
        })
        .catch(() => fallback());
    } else {
      window.setTimeout(fallback, 700 + Math.random() * 500);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-2xl" style={{ width, background: 'linear-gradient(180deg, rgba(10,12,16,0.88), rgba(4,4,5,0.94))', border: '1px solid var(--hairline-strong)', backdropFilter: 'blur(24px)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3 hairline-b" style={{ background: 'rgba(255,255,255,0.02)', cursor: onDragStart ? 'grab' : 'default' }} onPointerDown={onDragStart}>
        <span className="flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: `${avatar.accent}1f`, color: avatar.accent }}>
          <Bookmark size={12} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
          Recall
        </p>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>asks the brain</span>
        {onToggleMaximize && (
          <button
            onClick={onToggleMaximize}
            className="ml-auto p-1 rounded-md transition-colors"
            style={{ color: 'var(--text-faint)' }}
            title={maximized ? 'Restore panel' : 'Fill the screen'}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--text-faint)' }} title="Close recall">
          <X size={13} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`recall-msg flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mr-2"
                style={{ background: 'var(--accent-gradient)' }}
              >
                <Bot size={13} style={{ color: '#fff' }} />
              </div>
            )}
            <div
              className={m.role === 'user' ? 'rounded-xl rounded-br-sm px-3 py-2 max-w-[82%]' : 'max-w-[88%]'}
              style={
                m.role === 'user'
                  ? { background: avatar.accent, color: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font)' }
                  : {
                      background: 'var(--surface-1)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 12,
                      borderTopLeftRadius: 4,
                      padding: '10px 12px',
                      whiteSpace: 'pre-line',
                      fontSize: 12,
                      fontWeight: 300,
                      lineHeight: 1.55,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                    }
              }
            >
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {m.sources.map((s) => (
                    <span
                      key={`${m.id}-${s.id}`}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--veil)', border: '1px solid var(--hairline-strong)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.04em', fontFamily: 'var(--font)' }}
                      title={s.meta}
                    >
                      <FileText size={9} style={{ color: avatar.accent }} />
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="recall-msg flex justify-start">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mr-2"
              style={{ background: 'var(--accent-gradient)' }}
            >
              <Bot size={13} style={{ color: '#fff' }} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 12, borderTopLeftRadius: 4 }}>
              <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>searching the brain</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ background: avatar.accent, animation: `recall-blink 1s ${i * 0.18}s infinite` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="hairline-t px-3 pt-2 pb-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {suggestions.map((s) => (
            <button
              key={s}
              className="flex-shrink-0 text-[10px] px-2 py-1 rounded-full transition-colors"
              style={{ background: 'var(--veil)', border: '1px solid var(--hairline)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(input);
            }}
            placeholder="Ask your brain something…"
            className="bg-transparent outline-none text-xs flex-1 min-w-0 rounded-lg px-3"
            style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
          />
          <button
            className="flex-shrink-0 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ width: 34, height: 34, background: avatar.accent, color: '#fff', border: 'none', cursor: thinking ? 'default' : 'pointer' }}
            onClick={() => send(input)}
            disabled={thinking}
          >
            <Send size={13} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes recall-blink {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
