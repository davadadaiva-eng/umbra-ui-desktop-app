import { transcribeLocal } from './voiceEngines';

// IPC availability flag used by stt.ts to decide whether to route cloud STT
// calls through the Electron main process (Node fetch) instead of the renderer
// fetch.
export declare const umbraDesktop: { sttFetch?: (providerId: string, url: string, method: string, headers: unknown, body: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }> } | undefined;

const desktop = (typeof window !== 'undefined' && (window as unknown as { umbraDesktop?: { sttFetch?: (providerId: string, url: string, method: string, headers: unknown, body: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }> } }).umbraDesktop);

export const useDesktopSttFetch = typeof desktop?.sttFetch === 'function';

export interface STTConfig {
  provider: 'local' | 'openai' | 'groq';
  apiKey: string;
  model: string;
}

export const STT_PROVIDERS: { id: STTConfig['provider']; label: string; baseUrl: string; models: string[]; needsKey: boolean }[] = [
  { id: 'local', label: 'Local (VoiceStudio / voicebox)', baseUrl: '', models: ['whisper-1'], needsKey: false },
  { id: 'openai', label: 'OpenAI Whisper', baseUrl: 'https://api.openai.com/v1/audio/transcriptions', models: ['whisper-1'], needsKey: true },
  { id: 'groq', label: 'Groq Whisper', baseUrl: 'https://api.groq.com/openai/v1/audio/transcriptions', models: ['whisper-large-v3-turbo', 'whisper-large-v3'], needsKey: true },
];

export const LOCAL_STT_DEFAULT: STTConfig = { provider: 'local', apiKey: '', model: 'whisper-1' };

export function sttProviderById(id: string): (typeof STT_PROVIDERS)[number] {
  return STT_PROVIDERS.find((p) => p.id === id) ?? STT_PROVIDERS[0];
}

export async function transcribeAudio(config: STTConfig, blob: Blob): Promise<string> {
  if (config.provider === 'local') return transcribeLocal(blob);
  const prov = sttProviderById(config.provider);
  const form = new FormData();
  form.append('file', blob, blob.type.includes('webm') ? 'recording.webm' : 'recording.wav');
  form.append('model', config.model || prov.models[0]);
  form.append('language', 'en');

  let res: { ok: boolean; status: number; headers: Record<string, string>; body: unknown };
  try {
    if (useDesktopSttFetch) {
      res = await desktop.sttFetch(config.provider, prov.baseUrl, 'POST', { Authorization: `Bearer ${config.apiKey}` }, form);
    } else {
      const fetchRes = await fetch(prov.baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
      });
      res = { ok: fetchRes.ok, status: fetchRes.status, headers: {}, body: await fetchRes.json() };
    }
  } catch {
    throw new Error('Speech-to-text is unreachable. Check your network.');
  }
  if (!res.ok) {
    let msg = `Speech-to-text error (HTTP ${res.status})`;
    try {
      const j = res.body && typeof res.body === 'object' && res.body !== null && 'error' in res.body
        ? (res.body as { error?: { message?: string } }).error
        : undefined;
      if (j?.message) msg = j.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = res.body && typeof res.body === 'object' && res.body !== null
    ? (res.body as { text?: string })
    : undefined;
  const text = (data?.text ?? '').trim();
  if (!text) throw new Error('No speech recognized');
  return text;
}

export function silentWavBlob(): Blob {
  const sr = 16000;
  const samples = sr;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples * 2, true);
  return new Blob([view], { type: 'audio/wav' });
}
