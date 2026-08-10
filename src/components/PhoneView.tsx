import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Phone, PhoneOff, Mic, MicOff, Volume2, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus, Trash2 } from 'lucide-react';

interface Call {
  id: number;
  name: string;
  number: string;
  kind: 'incoming' | 'outgoing' | 'missed';
  time: string;
  dur?: string;
}

const SEED: Call[] = [
  { id: 1, name: 'Support ticket · #4821', number: '+39 02 · UmbraAI', kind: 'incoming', time: '09:41', dur: '4m 12s' },
  { id: 2, name: 'Mazin · Studio', number: '+39 331 220 4481', kind: 'outgoing', time: '08:57', dur: '11m 06s' },
  { id: 3, name: 'Stripe · Billing', number: '+1 415 · auto', kind: 'incoming', time: '08:12', dur: '1m 54s' },
  { id: 4, name: 'Vendor · LogisticaEU', number: '+49 30 · auto', kind: 'missed', time: 'Yesterday', dur: '—' },
  { id: 5, name: 'Tax office · AdE', number: '+39 06 · reminder', kind: 'outgoing', time: 'Yesterday', dur: '6m 40s' },
  { id: 6, name: 'Investor · Greycroft', number: '+1 212 · call', kind: 'incoming', time: 'Mon', dur: '23m 18s' },
];

const KIND_META: Record<Call['kind'], { icon: typeof PhoneIncoming; color: string }> = {
  incoming: { icon: PhoneIncoming, color: '#22c55e' },
  outgoing: { icon: PhoneOutgoing, color: '#38bdf8' },
  missed: { icon: PhoneMissed, color: '#ef4444' },
};

const TRANSCRIPT = [
  { from: 'client', text: 'Good morning — I need to fix an F24 for February. I missed a withholding deadline.' },
  { from: 'agent', text: 'Morning, Silvia. I can handle that right away. Pulling up your register — found it. The F24 for period 02, withholding under code 1040 is open. I will recompute the tax and generate the corrected form.' },
  { from: 'client', text: 'Perfect. Also — my e-fattura to Nexa SRL was rejected by the SDI. Can you check why?' },
  { from: 'agent', text: 'Let me validate it… The reject is semantic: the recipient VAT code is missing a suffix. I will patch the file and re-submit it to SDI with a fresh filename. Estimated 40 seconds.' },
  { from: 'client', text: 'Great. And after that, could you send the accountant a summary of what changed?' },
  { from: 'agent', text: 'Done — summary drafted. Sending to ragioniere@studio-milano.it and flagging both operations in your vault. Anything else?' },
];

export function PhoneView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [calls, setCalls] = useState<Call[]>(SEED);
  const [onCall, setOnCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current.querySelectorAll('.phone-block'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.05 }, '-=0.15');
        tl.fromTo(bodyRef.current.querySelectorAll('.call-row'), { opacity: 0, x: 12 }, { opacity: 1, x: 0, stagger: 0.03 }, '-=0.3');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!onCall) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [onCall]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const removeCall = (id: number) => setCalls((cur) => cur.filter((c) => c.id !== id));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>AgentPhone</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Realtime voice · 48 kHz · ultra-low latency
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg" style={{ background: onCall ? '#22c55e1c' : 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: onCall ? '#22c55e' : 'var(--text-dim)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: onCall ? '#22c55e' : 'var(--text-faint)', boxShadow: onCall ? '0 0 8px rgba(34,197,94,0.9)' : 'none' }} />
            {onCall ? 'Live call' : 'Idle'}
          </span>
          <button className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }}>
            <Plus size={13} /> New call
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>
        {onCall && (
          <div className="phone-block card p-5 mb-5" style={{ background: `linear-gradient(135deg, ${avatar.accent}1e, transparent 70%)`, border: `1px solid ${avatar.accent}44` }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <span className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: avatar.accent, color: '#fff' }}>S</span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2" style={{ background: '#22c55e', borderColor: '#0b0c0e' }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Silvia · Studio Milano</p>
                  <p className="text-[11px] font-mono mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-dim)' }}>
                    <Volume2 size={11} style={{ color: avatar.accent }} /> {fmt(elapsed)} · tax-ai skill active
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted((m) => !m)} className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: muted ? '#ef4444' : 'var(--text-primary)' }} title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button onClick={() => setOnCall(false)} className="h-10 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold" style={{ background: '#ef4444', color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                  <PhoneOff size={15} /> Hang up
                </button>
              </div>
            </div>
            <div className="mt-4 rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--hairline)' }}>
              {TRANSCRIPT.map((l, i) => (
                <div key={i} className={`px-4 py-2.5 text-[12px] leading-relaxed ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--hairline)' }}>
                  <span className="font-semibold mr-2" style={{ color: l.from === 'agent' ? avatar.accent : 'var(--text-dim)' }}>
                    {l.from === 'agent' ? 'Agent' : 'Client'}
                  </span>
                  <span className="font-light" style={{ color: 'var(--text-dim)' }}>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="phone-block card p-5 md:col-span-3" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Recent calls</p>
              <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>{calls.length} entries</span>
            </div>
            <div className="space-y-1.5">
              {calls.map((c) => {
                const Icon = KIND_META[c.kind].icon;
                return (
                  <div key={c.id} className="call-row group flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}>
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: KIND_META[c.kind].color, border: '1px solid var(--hairline-strong)' }}>
                      <Icon size={13} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{c.name}</p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>{c.number}</p>
                    </div>
                    <span className="text-[11px] font-light text-right flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                      {c.time}{c.dur !== '—' && <><br /><span style={{ color: 'var(--text-faint)' }}>{c.dur}</span></>}
                    </span>
                    <button onClick={() => removeCall(c.id)} className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#ef4444' }} title="Delete">
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="phone-block card p-5 md:col-span-2" style={{ background: 'var(--surface-1)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Voice agent settings</p>
            <div className="space-y-3">
              {[
                { label: 'Greeting script', value: '“Ciao, sono l\u2019assistente di Umbra. Come posso aiutarti oggi?”' },
                { label: 'Language', value: 'Italian · auto-detect' },
                { label: 'Answer policy', value: 'Realtime · wait for pause ≥ 600 ms' },
                { label: 'Skill routing', value: 'Router picks narrowest relevant skill' },
                { label: 'Recording', value: 'On · GDPR consent enforced' },
              ].map((s) => (
                <div key={s.label} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}>
                  <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{s.label}</span>
                  <span className="text-[11px] font-light text-right" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                </div>
              ))}
              <button onClick={() => setOnCall((v) => !v)} className="w-full mt-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                {onCall ? <PhoneOff size={14} /> : <Phone size={14} />}
                {onCall ? 'End simulated call' : 'Test call to +39 331 220 4481'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
