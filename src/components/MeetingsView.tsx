import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Video, Phone, MessageSquare, Mic, MicOff, PhoneOff, FileText, Check, Loader2 } from 'lucide-react';

interface MeetingPlatform {
  id: string;
  name: string;
  icon: React.ReactNode;
  accent: string;
}

const PLATFORMS: MeetingPlatform[] = [
  { id: 'meet', name: 'Google Meet', icon: <Video size={15} />, accent: '#22C55E' },
  { id: 'zoom', name: 'Zoom', icon: <Video size={15} />, accent: '#3B82F6' },
  { id: 'teams', name: 'Microsoft Teams', icon: <Video size={15} />, accent: '#8B5CF6' },
  { id: 'phone', name: 'Phone call', icon: <Phone size={15} />, accent: '#F59E0B' },
];

interface TranscriptLine {
  who: string;
  text: string;
  mine: boolean;
}

const POOL: [string, string][] = [
  ['Sofia', 'can we walk through the new design system one more time?'],
  ['Davide', 'sure — the v2 tokens are stable, so let’s look at the actual screens.'],
  ['Maya', 'I pulled the latest build, the onboarding flow looks clean.'],
  ['Sofia', 'the notification copy still feels off to me.'],
  ['Davide', 'okay, I’ll ask the writer agent to redraft it before Thursday.'],
  ['Leo', 'what about the API limits for the beta cohort?'],
  ['Maya', 'we capped it at a thousand requests per hour — fine for now.'],
  ['Leo', 'good, that lines up with the pricing page.'],
  ['Sofia', 'so we ship the redesign on Monday, then?'],
  ['Davide', 'Monday, but only if the whiteboard tests come back green by Friday.'],
  ['Maya', 'I can have the export feature ready by then.'],
  ['Leo', 'I’ll take the release checklist and the changelog.'],
  ['Davide', 'perfect. Umbra, take the notes and summarize this for the vault.'],
  ['Umbra', 'On it — I’m writing the minutes and storing them in the brain.'],
];

function makeTitle(platform: string): string {
  const base = ['design review', 'sprint planning', 'beta launch sync', 'week review'];
  return `${base[Math.floor(Math.random() * base.length)]} · ${platform}`;
}

export function MeetingsView() {
  const { avatar, addBrainFile, addJournal } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'list' | 'live' | 'done'>('list');
  const [meeting, setMeeting] = useState<{ platform: MeetingPlatform; title: string; since: string } | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ title: string; summary: string; when: string }[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, '-=0.15');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  useEffect(() => {
    if (mode !== 'live') return;
    const id = requestAnimationFrame(() => scrollBottom());
    return () => cancelAnimationFrame(id);
  }, [lines, mode]);

  const scrollBottom = () => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const joinMeeting = useCallback((platform: MeetingPlatform) => {
    setMeeting({ platform, title: makeTitle(platform.name), since: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    setLines([
      { who: 'Umbra', text: `Joined via ${platform.name}. I’m here, listening — I’ll take the minutes.`, mine: false },
      { who: 'Davide', text: 'thanks. let’s keep it tight, we have thirty minutes.', mine: true },
    ]);
    setMuted(false);
    setMode('live');
    stopTimer();
    timerRef.current = window.setInterval(() => {
      const pick = POOL[Math.floor(Math.random() * POOL.length)];
      setLines((cur) => {
        if (cur.length > 60) return cur.slice(-45).concat([{ who: pick[0], text: pick[1], mine: pick[0] === 'Davide' }]);
        return [...cur, { who: pick[0], text: pick[1], mine: pick[0] === 'Davide' }];
      });
    }, 2600);
  }, []);

  const leaveMeeting = () => {
    stopTimer();
    setMode('list');
    setMeeting(null);
    setLines([]);
  };

  const summarizeAndStore = () => {
    if (!meeting) return;
    setSaving(true);
    window.setTimeout(() => {
      const quotes = lines
        .filter((l) => !l.mine && l.who !== 'Umbra')
        .slice(-8)
        .map((l) => `- ${l.who}: ${l.text}`);
      const summary = [
        `# ${meeting.title}`,
        '',
        `Joined via ${meeting.platform.name} at ${meeting.since}. Umbra listened and took minutes.`,
        '',
        '## Decisions',
        '- Ship the redesign on Monday if whiteboard tests pass by Friday.',
        '- Cap the beta cohort at 1,000 requests/hour.',
        '- Writer agent redrafts notification copy before Thursday.',
        '',
        '## Open items',
        quotes.length ? quotes.join('\n') : '- (no open quotes captured)',
        '',
        'Stored by Umbra automatically at meeting end.',
      ].join('\n');
      addBrainFile(`meeting_${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`, summary, 'text/markdown');
      addJournal('action', `Meeting summarized — ${meeting.title}`);
      setHistory((cur) => [{ title: meeting.title, summary, when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...cur].slice(0, 20));
      setSaving(false);
      setMode('done');
      stopTimer();
    }, 1400);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Meetings</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {mode === 'live' ? 'Umbra is in the call — taking minutes, quietly.' : 'Join a call and Umbra listens, summarizes and stores it in the brain.'}
          </p>
        </div>
        {mode === 'live' && meeting && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-widest" style={{ color: meeting.platform.accent, border: `1px solid ${meeting.platform.accent}55`, background: `${meeting.platform.accent}14` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: meeting.platform.accent, animation: 'pulse-dot 1.2s infinite', boxShadow: `0 0 8px ${meeting.platform.accent}` }} />
            live · {meeting.title}
          </span>
        )}
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {mode === 'list' && (
          <>
            <p className="text-[11px] font-medium uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Start or join a call</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => joinMeeting(p)}
                  className="card flex items-center gap-3 p-4 text-left transition-all hover:-translate-y-0.5"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${p.accent}66`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}
                >
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${p.accent}16`, color: p.accent, border: `1px solid ${p.accent}44` }}>
                    {p.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="block text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>Join with sound · Umbra attends too</span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: p.accent }}>
                    Join
                  </span>
                </button>
              ))}
            </div>

            {history.length > 0 && (
              <>
                <p className="text-[11px] font-medium uppercase tracking-widest mt-8 mb-3" style={{ color: 'var(--text-faint)' }}>Stored in the brain</p>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="card p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
                      <div className="flex items-center gap-2">
                        <FileText size={13} style={{ color: avatar.accent }} />
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{h.title}</span>
                        <span className="ml-auto text-[10px] font-light flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{h.when}</span>
                      </div>
                      <p className="text-[11px] font-light mt-1.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{h.summary.split('\n').slice(3, 6).join(' · ')}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {mode === 'live' && meeting && (
          <div className="card flex flex-col overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', maxWidth: 760, margin: '0 auto' }}>
            <div className="flex items-center gap-3 px-4 py-3 hairline-b" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meeting.platform.accent}16`, color: meeting.platform.accent, border: `1px solid ${meeting.platform.accent}44` }}>
                {meeting.platform.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{meeting.title}</p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>{meeting.platform.name} · joined {meeting.since}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="flex items-center justify-center rounded-full transition-colors"
                  style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: muted ? '#FF8A8A' : 'var(--text-dim)' }}
                  title={muted ? 'Unmute' : 'Mute (you are not speaking anyway)'}
                >
                  {muted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button
                  onClick={leaveMeeting}
                  className="flex items-center gap-1.5 px-3 rounded-full text-[11px] font-medium"
                  style={{ height: 34, background: 'rgba(255,90,90,0.12)', border: '1px solid rgba(255,90,90,0.4)', color: '#FF8A8A', fontFamily: 'var(--font)' }}
                >
                  <PhoneOff size={13} /> Leave
                </button>
              </div>
            </div>

            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" style={{ minHeight: 320, maxHeight: 420 }}>
              {lines.map((l, i) => (
                <div key={i} className="flex" style={{ justifyContent: l.mine ? 'flex-end' : 'flex-start' }}>
                  <div
                    className="rounded-2xl px-3 py-2 text-sm break-words"
                    style={{
                      maxWidth: '82%',
                      background: l.mine ? `${avatar.accent}20` : 'var(--surface-2)',
                      border: `1px solid ${l.mine ? `${avatar.accent}44` : 'var(--hairline)'}`,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: l.mine ? avatar.accent : 'var(--text-faint)' }}>
                      {l.who}
                    </span>
                    {l.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 hairline-t flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest" style={{ color: meeting.platform.accent }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meeting.platform.accent, animation: 'pulse-dot 1.2s infinite' }} />
                Umbra is listening
              </span>
              <button
                onClick={summarizeAndStore}
                disabled={saving || lines.length < 4}
                className="ml-auto flex items-center gap-1.5 px-3.5 rounded-xl text-[11px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-40"
                style={{ height: 34, background: meeting.platform.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {saving ? 'Storing…' : 'End meeting · summarize & store to brain'}
              </button>
            </div>
          </div>
        )}

        {mode === 'done' && meeting && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${meeting.platform.accent}18`, border: `1px solid ${meeting.platform.accent}55`, color: meeting.platform.accent }}>
              <FileText size={22} />
            </span>
            <div>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Stored in the brain</p>
              <p className="text-sm font-light mt-1" style={{ color: 'var(--text-dim)' }}>
                Minutes for “{meeting.title}” were written to a brain file. Open the brain to see it.
              </p>
            </div>
            <button
              onClick={() => { setMode('list'); setMeeting(null); setLines([]); }}
              className="flex items-center gap-1.5 px-4 rounded-xl text-sm font-medium transition-transform hover:scale-[1.02]"
              style={{ height: 40, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
            >
              <MessageSquare size={14} /> Back to meetings
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
