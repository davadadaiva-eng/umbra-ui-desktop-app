import { useEffect, useRef, useState } from 'react';
import { ScanEye, Mic } from 'lucide-react';
import { ChatInput, CHIP } from './ui/chat-input';
import BorderBeam from './ui/border-beam';
import { chat as backendChat, screenAsk, isBackendAvailable, executeDesktop2, voiceCommand } from '../lib/backend';

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
  const [recording, setRecording] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureResolveRef = useRef<((audio: string | null) => void) | null>(null);

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

  // Clean up a dangling recording when the bar window closes.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
    };
  }, []);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    post({ type: 'voice', on: next });
  };

  // ── Local voice capture → backend /api/voice/command ─────────
  const toBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const url = String(fr.result ?? '');
        const idx = url.indexOf(',');
        resolve(idx >= 0 ? url.slice(idx + 1) : url);
      };
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      // No capture available here — ask the main window to listen instead.
      post({ type: 'voice', on: true });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        releaseMic();
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        try {
          captureResolveRef.current?.(await toBase64(blob));
        } catch {
          captureResolveRef.current?.(null);
        } finally {
          captureResolveRef.current = null;
        }
      };
      recorder.onerror = () => {
        releaseMic();
        captureResolveRef.current?.(null);
        captureResolveRef.current = null;
      };
      recorder.start();
      setRecording(true);
      setState('listening');
    } catch {
      // Mic denied/unavailable — fall back to the main window's listener.
      post({ type: 'voice', on: true });
    }
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    setRecording(false);
    if (!recorder || recorder.state === 'inactive') {
      setState('idle');
      return;
    }
    const audio = await new Promise<string | null>((resolve) => {
      captureResolveRef.current = resolve;
      recorder.stop();
    });
    if (!audio) {
      setState('idle');
      return;
    }
    setState('processing');
    if (await isBackendAvailable()) {
      try {
        const res = await voiceCommand(audio, { format: 'webm' });
        const cmd = res.command;
        // The backend speaks an ack and runs the task itself. If it had no
        // TTS engine, surface the transcription in the input so the user
        // still sees what was heard.
        if (cmd?.spoke === false && cmd.text) setText(cmd.text);
      } catch {
        // STT or dispatch failed — let the main window take over listening.
        post({ type: 'voice', on: true });
      }
    } else {
      post({ type: 'voice', on: true });
    }
    setState('idle');
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    if (await isBackendAvailable()) {
      try {
        await backendChat(t, 'auto');
      } catch {
        post({ type: 'command', text: t });
      }
    } else {
      post({ type: 'command', text: t });
    }
    setText('');
  };

  const analyze = async () => {
    if (await isBackendAvailable()) {
      try {
        await screenAsk('Describe what is on this screen', 'analyze');
      } catch {
        void desktop?.analyzeScreen?.();
      }
    } else {
      void desktop?.analyzeScreen?.();
    }
  };

  const takeOver = async () => {
    if (await isBackendAvailable()) {
      try {
        await executeDesktop2('launchBrowser', { url: 'umbra://takeover' });
      } catch {
        void desktop?.takeOver?.();
      }
    } else {
      void desktop?.takeOver?.();
    }
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

  const toggleRecord = () => {
    if (recording) void stopRecording();
    else void startRecording();
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
                <>
                  <button
                    type="button"
                    onClick={toggleRecord}
                    title={recording ? 'Stop and send to Umbra' : 'Record a voice command — audio goes to the backend'}
                    style={{
                      ...scanChip,
                      color: recording ? '#ef4444' : 'rgba(255,255,255,0.75)',
                      background: recording ? 'rgba(239,68,68,0.16)' : undefined,
                    }}
                  >
                    <Mic size={14} />
                  </button>
                  <button type="button" onClick={analyze} title="Analyze screen" style={scanChip}>
                    <ScanEye size={14} />
                  </button>
                </>
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
