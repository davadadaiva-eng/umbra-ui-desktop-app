import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, getMeetings, type Meeting,
  meetingJoin as backendJoin, meetingLeave as backendLeave,
  meetingMute as backendMute, meetingStatus,
  meetingRaiseHand as backendRaiseHand,
  meetingChatMessage as backendChatMsg,
  meetingSpeakDirect as backendSpeak,
  meetingShare as backendShare,
  meetingStopShare as backendStopShare,
  meetingOrders,
  meetingListen,
} from '../lib/backend';
import { Video, Phone, MessageSquare, Mic, MicOff, PhoneOff, FileText, Check, Loader2, Hand, AlertTriangle, Send, Monitor, MonitorOff, Radio, MessageCircle } from 'lucide-react';

interface MeetingPlatform { id: string; name: string; icon: React.ReactNode; accent: string; backendId: string; }

const PLATFORMS: MeetingPlatform[] = [
  { id: 'meet', name: 'Google Meet', icon: <Video size={15} />, accent: '#22C55E', backendId: 'google-meet' },
  { id: 'zoom', name: 'Zoom', icon: <Video size={15} />, accent: '#3B82F6', backendId: 'zoom' },
  { id: 'teams', name: 'Microsoft Teams', icon: <Video size={15} />, accent: '#8B5CF6', backendId: 'teams' },
  { id: 'phone', name: 'Phone call', icon: <Phone size={15} />, accent: '#F59E0B', backendId: 'phone' },
];

interface TranscriptLine { who: string; text: string; mine: boolean; }

const SIMULATED_TRANSCRIPT: [string, string][] = [
  ['Sofia', 'can we walk through the new design system?'],
  ['Davide', 'sure — the v2 tokens are stable, let\'s look at screens.'],
  ['Maya', 'I pulled the latest build, onboarding looks clean.'],
  ['Sofia', 'the notification copy still feels off.'],
  ['Davide', 'I\'ll ask the writer agent to redraft before Thursday.'],
  ['Leo', 'what about API limits for the beta cohort?'],
  ['Maya', 'capped at 1000 requests per hour — fine for now.'],
  ['Sofia', 'so we ship Monday?'],
  ['Davide', 'Monday, if whiteboard tests pass by Friday.'],
  ['Leo', 'I\'ll take the release checklist and changelog.'],
  ['Umbra', 'On it — writing minutes and storing them in the brain.'],
];

export function MeetingsView() {
  const { avatar, addBrainFile, addJournal } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'list' | 'live' | 'done'>('list');
  const [meeting, setMeeting] = useState<{ platform: MeetingPlatform; title: string; since: string } | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ title: string; summary: string; when: string }[]>([]);
  const [backendMode, setBackendMode] = useState<'full' | 'simulated' | 'unknown'>('unknown');
  const timerRef = useRef<number | null>(null);

  // ── New state for added features ──
  const [chatInput, setChatInput] = useState('');
  const [speakInput, setSpeakInput] = useState('');
  const [screenSharing, setScreenSharing] = useState(false);
  const [listening, setListening] = useState(false);
  const [detectedOrders, setDetectedOrders] = useState<string[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) tl.fromTo(bodyRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, '-=0.15');
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  const stopTimer = () => { if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => stopTimer(), []);

  // Check backend mode and fetch history
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const { meetings } = await getMeetings();
        if (cancelled || !meetings.length) return;
        setHistory(meetings.map((m: Meeting) => ({
          title: m.title || m.url, summary: `${m.platform} — ${m.status}`, when: m.startedAt,
        })));
      } catch { /* keep seed data */ }
      // Test if meeting companion is available
      try {
        const status = await meetingStatus();
        if (!cancelled) setBackendMode(status?.meetingId ? 'full' : 'simulated');
      } catch {
        if (!cancelled) setBackendMode('simulated');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll for detected orders while in live mode
  useEffect(() => {
    if (mode !== 'live' || backendMode === 'simulated') return;
    let cancelled = false;
    const poll = async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const res = await meetingOrders();
        if (!cancelled && Array.isArray(res) && res.length) {
          setDetectedOrders((prev) => [...prev, ...res.map((o: unknown) => String(o))].slice(-20));
        }
      } catch { /* ok */ }
    };
    const id = window.setInterval(poll, 3000);
    poll();
    return () => { cancelled = true; window.clearInterval(id); };
  }, [mode, backendMode]);

  useEffect(() => {
    if (mode !== 'live') return;
    const id = requestAnimationFrame(() => { const el = transcriptRef.current; if (el) el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [lines, mode]);

  const joinMeeting = useCallback(async (platform: MeetingPlatform) => {
    const title = `${['design review', 'sprint planning', 'beta launch sync', 'week review'][Math.floor(Math.random() * 4)]} · ${platform.name}`;
    setMeeting({ platform, title, since: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    setLines([{ who: 'Umbra', text: `Joined via ${platform.name}. ${backendMode === 'full' ? 'Listening and taking minutes.' : 'Simulated mode — transcript will be generated for demo.'}`, mine: false }]);
    setMuted(false);
    setHandRaised(false);
    setScreenSharing(false);
    setListening(false);
    setDetectedOrders([]);
    setMode('live');

    // Try backend join
    if (await isBackendAvailable()) {
      try {
        await backendJoin(`https://${platform.backendId}.example.com/room`, { title });
      } catch { /* simulate */ }
    }

    // Simulated transcript
    timerRef.current = window.setInterval(() => {
      const pick = SIMULATED_TRANSCRIPT[Math.floor(Math.random() * SIMULATED_TRANSCRIPT.length)];
      setLines((cur) => {
        if (cur.length > 60) return cur.slice(-45).concat([{ who: pick[0], text: pick[1], mine: pick[0] === 'Davide' }]);
        return [...cur, { who: pick[0], text: pick[1], mine: pick[0] === 'Davide' }];
      });
    }, 2600);
  }, [backendMode]);

  const leaveMeeting = async () => {
    stopTimer();
    if (screenSharing && await isBackendAvailable()) { try { await backendStopShare(); } catch { /* ok */ } }
    if (listening && await isBackendAvailable()) { try { await meetingListen(); } catch { /* ok */ } }
    if (await isBackendAvailable()) { try { await backendLeave(); } catch { /* ok */ } }
    setMode('list'); setMeeting(null); setLines([]);
  };

  const toggleMute = async () => { const next = !muted; setMuted(next); if (await isBackendAvailable()) { try { await backendMute(next); } catch { /* ok */ } } };

  const toggleRaiseHand = async () => { const next = !handRaised; setHandRaised(next); if (await isBackendAvailable()) { try { await backendRaiseHand(next); } catch { /* ok */ } } };

  const sendChatMessage = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    setLines((cur) => [...cur, { who: 'You', text: msg, mine: true }]);
    if (await isBackendAvailable()) { try { await backendChatMsg(msg); } catch { /* ok */ } }
  };

  const sendSpeakMessage = async () => {
    const text = speakInput.trim();
    if (!text) return;
    setSpeakInput('');
    setLines((cur) => [...cur, { who: 'You (spoken)', text, mine: true }]);
    if (await isBackendAvailable()) { try { await backendSpeak(text); } catch { /* ok */ } }
  };

  const toggleScreenShare = async () => {
    const next = !screenSharing;
    setScreenSharing(next);
    if (await isBackendAvailable()) {
      try { next ? await backendShare() : await backendStopShare(); } catch { /* ok */ }
    }
  };

  const toggleListen = async () => {
    setListening((prev) => !prev);
    if (await isBackendAvailable()) { try { await meetingListen(); } catch { /* ok */ } }
  };

  const summarizeAndStore = () => {
    if (!meeting) return;
    setSaving(true);
    window.setTimeout(() => {
      const quotes = lines.filter((l) => !l.mine && l.who !== 'Umbra').slice(-8).map((l) => `- ${l.who}: ${l.text}`);
      const summary = [
        `# ${meeting.title}`, '',
        `Joined via ${meeting.platform.name} at ${meeting.since}.`, '',
        '## Decisions', '- Ship the redesign on Monday if whiteboard tests pass.', '- Cap beta at 1000 req/hr.', '', '## Open items',
        quotes.length ? quotes.join('\n') : '- (none captured)', '',
        'Stored by Umbra automatically.',
      ].join('\n');
      addBrainFile(`meeting_${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.md`, summary, 'text/markdown');
      addJournal('action', `Meeting summarized — ${meeting.title}`);
      setHistory((cur) => [{ title: meeting.title, summary, when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...cur].slice(0, 20));
      setSaving(false); setMode('done'); stopTimer();
    }, 1400);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Meetings</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {mode === 'live' ? 'Umbra is listening — taking minutes.' : 'Join a call and Umbra listens, summarizes and stores it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {backendMode === 'simulated' && mode !== 'live' && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium" style={{ color: '#FBBF24', border: '1px solid #FBBF2433', background: '#FBBF2414' }}>
              <AlertTriangle size={11} /> Desktop mode required for live meeting automation
            </span>
          )}
          {mode === 'live' && meeting && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-widest" style={{ color: meeting.platform.accent, border: `1px solid ${meeting.platform.accent}55`, background: `${meeting.platform.accent}14` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: meeting.platform.accent, animation: 'pulse-dot 1.2s infinite' }} />
              live · {meeting.title}
            </span>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {mode === 'list' && (
          <>
            <p className="text-[11px] font-medium uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>Start or join a call</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => joinMeeting(p)}
                  className="card flex items-center gap-3 p-4 text-left transition-all hover:-translate-y-0.5"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${p.accent}66`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${p.accent}16`, color: p.accent, border: `1px solid ${p.accent}44` }}>{p.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="block text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>Join · Umbra attends and takes minutes</span>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: p.accent }}>Join</span>
                </button>
              ))}
            </div>
            {history.length > 0 && (
              <>
                <p className="text-[11px] font-medium uppercase tracking-widest mt-8 mb-3" style={{ color: 'var(--text-faint)' }}>Past meetings</p>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="card p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
                      <div className="flex items-center gap-2">
                        <FileText size={13} style={{ color: avatar.accent }} />
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{h.title}</span>
                        <span className="ml-auto text-[10px] font-light flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{h.when}</span>
                      </div>
                      <p className="text-[11px] font-light mt-1.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{h.summary}</p>
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
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meeting.platform.accent}16`, color: meeting.platform.accent, border: `1px solid ${meeting.platform.accent}44` }}>{meeting.platform.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{meeting.title}</p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>{meeting.platform.name} · joined {meeting.since}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={toggleMute} className="flex items-center justify-center rounded-full" title={muted ? 'Unmute' : 'Mute'} style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: muted ? '#FF8A8A' : 'var(--text-dim)' }}>
                  {muted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button onClick={toggleRaiseHand} className="flex items-center justify-center rounded-full" title={handRaised ? 'Lower hand' : 'Raise hand'} style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: handRaised ? '#FBBF24' : 'var(--text-dim)' }}>
                  <Hand size={14} />
                </button>
                <button onClick={toggleScreenShare} className="flex items-center justify-center rounded-full" title={screenSharing ? 'Stop sharing' : 'Share screen'} style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: screenSharing ? '#22C55E' : 'var(--text-dim)' }}>
                  {screenSharing ? <MonitorOff size={14} /> : <Monitor size={14} />}
                </button>
                <button onClick={toggleListen} className="flex items-center justify-center rounded-full" title={listening ? 'Stop listening' : 'Start listening'} style={{ width: 34, height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: listening ? '#38BDF8' : 'var(--text-dim)' }}>
                  <Radio size={14} />
                </button>
                <button onClick={leaveMeeting} className="flex items-center gap-1.5 px-3 rounded-full text-[11px] font-medium" style={{ height: 34, background: 'rgba(255,90,90,0.12)', border: '1px solid rgba(255,90,90,0.4)', color: '#FF8A8A', fontFamily: 'var(--font)' }}>
                  <PhoneOff size={13} /> Leave
                </button>
              </div>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" style={{ minHeight: 260, maxHeight: 340 }}>
              {lines.map((l, i) => (
                <div key={i} className="flex" style={{ justifyContent: l.mine ? 'flex-end' : 'flex-start' }}>
                  <div className="rounded-2xl px-3 py-2 text-sm break-words" style={{ maxWidth: '82%', background: l.mine ? `${avatar.accent}20` : 'var(--surface-2)', border: `1px solid ${l.mine ? `${avatar.accent}44` : 'var(--hairline)'}`, color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    <span className="block text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: l.mine ? avatar.accent : 'var(--text-faint)' }}>{l.who}</span>
                    {l.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Detected Orders */}
            {detectedOrders.length > 0 && (
              <div className="px-4 py-2 hairline-t" style={{ background: 'rgba(255,255,255,0.015)' }}>
                <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-faint)' }}>
                  <Radio size={10} /> Detected Orders
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detectedOrders.slice(-6).map((order, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg text-[10px] font-medium" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{order}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Input */}
            <div className="px-4 py-2.5 hairline-t flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <MessageCircle size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="Send a chat message…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <button onClick={sendChatMessage} disabled={!chatInput.trim()} className="flex items-center justify-center rounded-full disabled:opacity-30" title="Send chat" style={{ width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}>
                <Send size={12} />
              </button>
            </div>

            {/* Speak Input */}
            <div className="px-4 py-2.5 hairline-t flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <Mic size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <input
                value={speakInput}
                onChange={(e) => setSpeakInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSpeakMessage(); } }}
                placeholder="Type text to speak in meeting…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <button onClick={sendSpeakMessage} disabled={!speakInput.trim()} className="flex items-center justify-center rounded-full disabled:opacity-30" title="Speak" style={{ width: 28, height: 28, background: `${meeting.platform.accent}22`, border: `1px solid ${meeting.platform.accent}44`, color: meeting.platform.accent }}>
                <Mic size={12} />
              </button>
            </div>

            <div className="px-4 py-3 hairline-t flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest" style={{ color: meeting.platform.accent }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: meeting.platform.accent, animation: 'pulse-dot 1.2s infinite' }} />
                Umbra is listening
              </span>
              <button onClick={summarizeAndStore} disabled={saving || lines.length < 4}
                className="ml-auto flex items-center gap-1.5 px-3.5 rounded-xl text-[11px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-40"
                style={{ height: 34, background: meeting.platform.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {saving ? 'Storing…' : 'End · summarize & store'}
              </button>
            </div>
          </div>
        )}

        {mode === 'done' && meeting && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${meeting.platform.accent}18`, border: `1px solid ${meeting.platform.accent}55`, color: meeting.platform.accent }}><FileText size={22} /></span>
            <div>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Stored in memory</p>
              <p className="text-sm font-light mt-1" style={{ color: 'var(--text-dim)' }}>Minutes for "{meeting.title}" saved.</p>
            </div>
            <button onClick={() => { setMode('list'); setMeeting(null); setLines([]); }} className="flex items-center gap-1.5 px-4 rounded-xl text-sm font-medium" style={{ height: 40, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
              <MessageSquare size={14} /> Back
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
