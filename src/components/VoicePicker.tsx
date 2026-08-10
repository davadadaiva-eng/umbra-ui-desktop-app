import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { useVoices, previewVoice, displayName } from '../lib/voices';
import { listLocalVoices, speakLocal, VOICESTUDIO_BASE, VOICEBOX_BASE, type LocalVoice } from '../lib/voiceEngines';
import { Volume2, Play, Loader2, WifiOff, Zap } from 'lucide-react';

const PREVIEW_TEXT = "Hi, I'm Umbra. What do you need?";

export function VoicePicker({ compact = false }: { compact?: boolean }) {
  const { voiceURI, setVoice, voiceboxProfile, setVoiceboxProfile } = useAppStore();
  const voices = useVoices();
  const [localState, setLocalState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [localVoices, setLocalVoices] = useState<LocalVoice[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { engines, voices: list } = await listLocalVoices();
      if (!alive) return;
      setLocalVoices(list);
      setLocalState(engines.voicestudio || engines.voicebox ? 'online' : 'offline');
    })();
    return () => {
      alive = false;
    };
  }, []);

  const vsVoices = localVoices.filter((v) => v.engine === 'voicestudio');
  const vbVoices = localVoices.filter((v) => v.engine === 'voicebox');

  const current = voiceboxProfile ? voiceboxProfile : voiceURI ? `sys:${voiceURI}` : 'sys:';

  const onSelect = (value: string) => {
    if (value.startsWith('vs:') || value.startsWith('vb:')) {
      setVoiceboxProfile(value);
      setVoice(null);
    } else {
      setVoice(value.startsWith('sys:') && value.length > 4 ? value.slice(4) : null);
      setVoiceboxProfile(null);
    }
  };

  const preview = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      if (voiceboxProfile) {
        const voice = localVoices.find((v) => v.id === voiceboxProfile);
        if (voice) {
          const url = await speakLocal(PREVIEW_TEXT, voice);
          const audio = new Audio(url);
          audio.onended = () => setPlaying(false);
          audio.onerror = () => setPlaying(false);
          await audio.play();
          return;
        }
      }
      previewVoice(voiceURI);
      window.setTimeout(() => setPlaying(false), Math.max(PREVIEW_TEXT.length * 90, 1400));
    } catch {
      setPlaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 flex-1 rounded-xl px-3"
          style={{ height: compact ? 34 : 40, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}
        >
          <Volume2 size={compact ? 12 : 14} style={{ color: 'var(--text-faint)' }} />
          <select
            value={current}
            onChange={(e) => onSelect(e.target.value)}
            className="select-clean outline-none text-sm flex-1 min-w-0"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
          >
            <optgroup label={localState === 'offline' ? 'Browser voices (local engines offline)' : 'Browser voices'}>
              <option value="sys:">Auto (best match)</option>
              {voices.map((v) => (
                <option key={v.uri} value={`sys:${v.uri}`}>{displayName(v)}</option>
              ))}
            </optgroup>
            {vsVoices.length > 0 && (
              <optgroup label="VoiceStudio — local cloned voices">
                {vsVoices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {v.language || 'en'}</option>
                ))}
              </optgroup>
            )}
            {vbVoices.length > 0 && (
              <optgroup label="Voicebox — local AI voices">
                {vbVoices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {v.language || 'en'}</option>
                ))}
              </optgroup>
            )}
          </select>
          {localState === 'checking' && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-faint)' }} />}
        </div>
        <button
          onClick={preview}
          disabled={playing}
          className="flex items-center justify-center gap-1.5 rounded-xl transition-all disabled:opacity-50"
          style={{ height: compact ? 34 : 40, padding: '0 14px', background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: 12 }}
          title="Preview voice"
        >
          {playing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {!compact && 'Preview'}
        </button>
      </div>

      <p className="text-[11px] font-light flex items-center gap-1.5" style={{ color: localState === 'offline' ? 'var(--text-faint)' : 'var(--text-dim)' }}>
        {localState === 'checking' && 'Checking for local voice engines…'}
        {localState === 'offline' && (
          <>
            <WifiOff size={11} /> Local engines offline — using browser voices. Start VoiceStudio ({VOICESTUDIO_BASE}) or Voicebox ({VOICEBOX_BASE}) to unlock cloned AI voices.
          </>
        )}
        {localState === 'online' && (
          <>
            <Zap size={11} style={{ color: '#81C784' }} /> Local voices available — {vsVoices.length} from VoiceStudio, {vbVoices.length} from Voicebox.
          </>
        )}
      </p>
    </div>
  );
}
