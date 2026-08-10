import { transcribeLocal } from './voiceEngines';

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
  let res: Response;
  try {
    res = await fetch(prov.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch {
    throw new Error('Speech-to-text is unreachable. Check your network.');
  }
  if (!res.ok) {
    let msg = `Speech-to-text error (HTTP ${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? '').trim();
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
