import { useEffect, useRef, useState } from 'react';
import { ScanEye } from 'lucide-react';
import { ChatInput, CHIP } from './ui/chat-input';
import BorderBeam from './ui/border-beam';

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

  const scanChip: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    padding: 0,
    border: 'none',
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.75)',
    ...CHIP,
  };

  return (
    <>
      <style>{barStyles()}</style>
      <div
        className="flex items-center justify-center"
        style={{
          height: '100%',
          padding: '0 14px',
          ...appRegion('drag'),
          userSelect: 'none',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          className="relative flex-shrink-0"
          style={{
            ...appRegion('drag'),
            width: 20,
            height: 20,
            marginRight: 12,
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

        <div style={{ ...appRegion('no-drag') }}>
          <BorderBeam size="md" colorVariant="colorful">
            <ChatInput
              value={text}
              onValueChange={setText}
              onEnter={submit}
              onEscape={() => setText('')}
              onSend={submit}
              placeholder="Ask Umbra, give tasks, or query screen…"
              inputRef={inputRef}
              onMention={() => inputRef.current?.focus()}
              agent={{ onClick: takeOver, title: 'Take over the main window' }}
              auto={{ active: voiceOn, onClick: toggleVoice, title: voiceOn ? 'Voice mode on — say the agent name' : 'Voice mode off' }}
              extraChips={
                <button type="button" onClick={analyze} title="Analyze screen" style={scanChip}>
                  <ScanEye size={14} />
                </button>
              }
              sendColor={stateColor}
            />
          </BorderBeam>
        </div>
      </div>
    </>
  );
}

export function barStyles() {
  return `
    html, body { margin: 0; padding: 0; background: transparent !important; overflow: hidden; }
    #root { height: 100vh; }
    @keyframes umbra-breathe { 0%,100% { opacity: 0.55; transform: scale(1);} 50% { opacity: 1; transform: scale(1.06);} }
    @keyframes umbra-ping { 0% { transform: scale(0.8); opacity: 0.9; } 80%,100% { transform: scale(1.8); opacity: 0; } }
  `;
}
