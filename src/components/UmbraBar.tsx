import { useEffect, useRef, useState } from 'react';
import { ScanEye, Focus, Send, Mic, MicOff } from 'lucide-react';

type BarState = 'idle' | 'listening' | 'processing' | 'speaking';

interface BarMessage {
  type: 'state' | 'command' | 'voice';
  state?: BarState;
  text?: string;
  on?: boolean;
}

const CHANNEL = 'umbra-bar';

const appRegion = (region: 'drag' | 'no-drag'): React.CSSProperties => ({ WebkitAppRegion: region }) as React.CSSProperties;

export function UmbraBar() {
  const [state, setState] = useState<BarState>('idle');
  const [text, setText] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const desktop = (window as unknown as { umbraDesktop?: { analyzeScreen?: () => Promise<unknown>; takeOver?: () => Promise<unknown> } }).umbraDesktop;

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent<BarMessage>) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'state' && m.state) setState(m.state);
      if (m.type === 'command' && typeof m.text === 'string') {
        setText(m.text);
        setExpanded(true);
        inputRef.current?.focus();
      }
      if (m.type === 'voice' && typeof m.on === 'boolean') setVoiceOn(m.on);
    };
    return () => ch.close();
  }, []);

  const post = (m: BarMessage) => channelRef.current?.postMessage(m);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    post({ type: 'voice', on: next });
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    post({ type: 'command', text: t });
    setText('');
  };

  const analyze = () => {
    void desktop?.analyzeScreen?.();
  };

  const takeOver = () => {
    void desktop?.takeOver?.();
  };

  const stateColor =
    state === 'listening' ? '#22D3EE' : state === 'speaking' || state === 'processing' ? '#A78BFA' : '#3B82F6';

  return (
    <>
      <style>{barStyles()}</style>
      <div
        className="flex items-center gap-2 px-3 rounded-2xl"
        style={{
          height: '100%',
          background: 'rgba(10,12,16,0.72)',
          border: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          ...appRegion('drag'),
          userSelect: 'none',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
      <div
        className="relative flex-shrink-0"
        style={{
          ...appRegion('no-drag'),
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="absolute rounded-full"
          style={{
            width: 20,
            height: 20,
            background: state === 'listening' ? 'radial-gradient(circle, rgba(34,211,238,0.5), rgba(34,211,238,0.05) 70%)' : `radial-gradient(circle, ${stateColor}44, transparent 70%)`,
            animation: state === 'listening' ? 'umbra-ping 1.4s infinite' : state === 'idle' ? 'umbra-breathe 3s infinite' : 'none',
          }}
        />
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 12,
            height: 12,
            background: stateColor,
            boxShadow: `0 0 ${state === 'speaking' || state === 'processing' ? 14 : 8}px ${stateColor}aa`,
            animation: state === 'idle' ? 'umbra-breathe 3s infinite' : 'none',
          }}
        />
      </div>

      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setText('');
        }}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        placeholder="Ask Umbra, give tasks, or query screen…"
        spellCheck={false}
        style={{
          ...appRegion('no-drag'),
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#E5E7EB',
          fontSize: 13,
          padding: '0 4px',
        }}
      />

      {expanded && (
        <div className="flex items-center gap-1.5" style={{ ...appRegion('no-drag') }}>
          <button onClick={analyze} title="Analyze screen" style={quickBtn}>
            <ScanEye size={14} />
          </button>
          <button onClick={takeOver} title="Take over the main window" style={quickBtn}>
            <Focus size={14} />
          </button>
          <button
            onClick={toggleVoice}
            title={voiceOn ? 'Voice mode on — say the agent name' : 'Voice mode off'}
            style={{ ...quickBtn, color: voiceOn ? '#22D3EE' : 'rgba(255,255,255,0.35)' }}
          >
            {voiceOn ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
        </div>
      )}

      <button onClick={submit} title="Send to Umbra" style={{ ...quickBtn, color: text.trim() ? '#fff' : 'rgba(255,255,255,0.35)' }}>
        <Send size={14} />
      </button>
    </div>
    </>
  );
}

const quickBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.75)',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

export function barStyles() {
  return `
    html, body { margin: 0; padding: 0; background: transparent !important; overflow: hidden; }
    #root { height: 100vh; }
    @keyframes umbra-breathe { 0%,100% { opacity: 0.55; transform: scale(1);} 50% { opacity: 1; transform: scale(1.06);} }
    @keyframes umbra-ping { 0% { transform: scale(0.8); opacity: 0.9; } 80%,100% { transform: scale(1.8); opacity: 0; } }
  `;
}