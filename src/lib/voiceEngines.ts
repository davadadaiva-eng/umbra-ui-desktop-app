export const VOICESTUDIO_BASE = 'http://localhost:3900';
export const VOICEBOX_BASE = 'http://127.0.0.1:17493';

export type VoiceEngine = 'voicestudio' | 'voicebox';

export interface LocalVoice {
  id: string;
  engine: VoiceEngine;
  profileId: string;
  name: string;
  language: string;
}

export interface LocalEngineState {
  voicestudio: boolean;
  voicebox: boolean;
}

const testProbeStatus: Record<string, number> = {};

export function setTestProbeStatus(url: string, status: number) {
  testProbeStatus[url] = status;
}

export function resetTestProbeStatus() {
  for (const key of Object.keys(testProbeStatus)) {
    delete testProbeStatus[key];
  }
}

export function setTestFetchStatus(url: string, status: number) {
  testProbeStatus[url] = status;
}

export function resetTestFetchStatuses() {
  for (const key of Object.keys(testProbeStatus)) {
    delete testProbeStatus[key];
  }
}

// IPC availability flag used by voiceEngines.ts to decide whether to probe
// and fetch local voice engines through the Electron main process.
export declare const umbraDesktop: {
  localVoiceProbe?: (url: string, timeoutMs: number, signalToken?: string) => Promise<boolean>;
  localVoiceFetch?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }>;
  localVoiceProbeStream?: (url: string, timeoutMs: number, signalToken?: string) => Promise<boolean>;
  localVoiceFetchStream?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }>;
} | undefined;

const desktop = (typeof window !== 'undefined' && (window as unknown as {
  umbraDesktop?: {
    localVoiceProbe?: (url: string, timeoutMs: number, signalToken?: string) => Promise<boolean>;
    localVoiceFetch?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }>;
    localVoiceProbeStream?: (url: string, timeoutMs: number, signalToken?: string) => Promise<boolean>;
    localVoiceFetchStream?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: unknown }>;
  }
}).umbraDesktop);

export const useDesktopVoiceFetch = typeof desktop?.localVoiceProbe === 'function' && typeof desktop?.localVoiceFetch === 'function';
const useDesktopVoiceFetchStream = typeof desktop?.localVoiceProbeStream === 'function' && typeof desktop?.localVoiceFetchStream === 'function';

const voiceFetch = useDesktopVoiceFetch ? desktop.localVoiceFetch : (url: string, init: unknown) => Promise.resolve({ ok: false, status: 0, headers: {}, body: { message: 'IPC voice fetch unavailable' } });
const voiceFetchStream = useDesktopVoiceFetchStream ? desktop.localVoiceFetchStream : voiceFetch;
const voiceProbe = useDesktopVoiceFetch ? desktop.localVoiceProbe : (() => Promise.resolve(false)) as (url: string, timeoutMs: number, signalToken?: string) => Promise<boolean>;
const voiceProbeStream = useDesktopVoiceFetchStream ? desktop.localVoiceProbeStream : voiceProbe;

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  if (useDesktopVoiceFetch) {
    return voiceProbe(url, timeoutMs);
  }

  if (Object.keys(testProbeStatus).length > 0) {
    const status = testProbeStatus[url];
    return status == null ? false : status === 200;
  }

  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await window.fetch(url, { signal: ctrl.signal });
    window.clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export function isVoiceStudioOnline(timeoutMs = 1500): Promise<boolean> {
  return probe(`${VOICESTUDIO_BASE}/v1/audio/voices`, timeoutMs);
}

export function isVoiceboxOnline(timeoutMs = 1500): Promise<boolean> {
  return probe(`${VOICEBOX_BASE}/profiles`, timeoutMs);
}

export async function localEnginesOnline(timeoutMs = 1500): Promise<LocalEngineState> {
  const [voicestudio, voicebox] = await Promise.all([isVoiceStudioOnline(timeoutMs), isVoiceboxOnline(timeoutMs)]);
  return { voicestudio, voicebox };
}

export async function listLocalVoices(): Promise<{ engines: LocalEngineState; voices: LocalVoice[] }> {
  const engines = await localEnginesOnline();
  const voices: LocalVoice[] = [];
  if (engines.voicestudio) {
    try {
      const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICESTUDIO_BASE}/v1/audio/voices`, undefined) : await window.fetch(`${VOICESTUDIO_BASE}/v1/audio/voices`);
      if (r.ok) {
        const rawBody = r.body;
        const data = (typeof rawBody === 'object' && rawBody !== null && 'voices' in rawBody) ? (rawBody as { voices?: unknown }).voices : null;
        const arr = Array.isArray(data) ? data : [];
        for (const v of arr) {
          if (typeof v.voice_id === 'string') {
            voices.push({
              id: `vs:${v.voice_id}`,
              engine: 'voicestudio',
              profileId: v.voice_id,
              name: typeof v.name === 'string' ? v.name : v.voice_id,
              language: typeof v.language === 'string' ? v.language : 'en',
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (engines.voicebox) {
    try {
      const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICEBOX_BASE}/profiles`, undefined) : await window.fetch(`${VOICEBOX_BASE}/profiles`);
      if (r.ok) {
        const rawBody = r.body;
        const arr = (typeof rawBody === 'object' && rawBody !== null && Array.isArray(rawBody)) ? rawBody as Record<string, unknown>[] : [];
        if (Array.isArray(arr)) {
          for (const p of arr) {
            if (p && typeof p.id === 'string') {
              voices.push({
                id: `vb:${p.id}`,
                engine: 'voicebox',
                profileId: p.id,
                name: typeof p.name === 'string' ? p.name : 'Voice',
                language: typeof p.language === 'string' ? p.language : 'en',
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return { engines, voices };
}

function audioFileName(blob: Blob): string {
  return blob.type.includes('webm') ? 'recording.webm' : 'recording.wav';
}

export async function transcribeLocal(blob: Blob): Promise<string> {
  const errors: string[] = [];
  if (await isVoiceStudioOnline(1200)) {
    try {
      const form = new FormData();
      form.append('file', blob, audioFileName(blob));
      form.append('model', 'whisper-1');
      const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICESTUDIO_BASE}/v1/audio/transcriptions`, { method: 'POST', body: form }) : await window.fetch(`${VOICESTUDIO_BASE}/v1/audio/transcriptions`, { method: 'POST', body: form });
      if (r.ok) {
        const j = (typeof r.body === 'object' && r.body !== null && 'text' in r.body) ? (r.body as { text?: string }).text : undefined;
        const text = (j ?? '').trim();
        if (text) return text;
        errors.push('VoiceStudio: no speech recognized');
      } else {
        errors.push(`VoiceStudio: HTTP ${r.status}`);
      }
    } catch {
      errors.push('VoiceStudio: unreachable');
    }
  }
  if (await isVoiceboxOnline(1200)) {
    try {
      const form = new FormData();
      form.append('file', blob, audioFileName(blob));
      form.append('model', 'turbo');
      form.append('language', 'en');
      const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICEBOX_BASE}/transcribe`, { method: 'POST', body: form }) : await window.fetch(`${VOICEBOX_BASE}/transcribe`, { method: 'POST', body: form });
      if (r.status === 202) {
        errors.push('voicebox is downloading its Whisper model');
      } else if (r.ok) {
        const j = (typeof r.body === 'object' && r.body !== null && 'text' in r.body) ? (r.body as { text?: string }).text : undefined;
        const text = (j ?? '').trim();
        if (text) return text;
        errors.push('voicebox: no speech recognized');
      } else {
        errors.push(`voicebox: HTTP ${r.status}`);
      }
    } catch {
      errors.push('voicebox: unreachable');
    }
  }
  if (errors.length === 0) errors.push('neither VoiceStudio nor voicebox is running');
  throw new Error(`Local speech-to-text unavailable (${errors.join('; ')})`);
}

async function pollVoiceboxGeneration(id: string, timeoutMs = 90000): Promise<{ status: string; error?: string }> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICEBOX_BASE}/generate/${id}/status`, { signal: ctrl.signal }) : await window.fetch(`${VOICEBOX_BASE}/generate/${id}/status`, { signal: ctrl.signal });
    if (!r.ok || (!r.body || typeof r.body !== 'object') || !('getReader' in r.body)) throw new Error(`voicebox status ${r.status}: no stream`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let status = 'queued';
    let error: string | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5)) as { status?: string; error?: string };
          if (typeof evt.status === 'string') {
            status = evt.status;
            error = evt.error;
          }
        } catch {
          // skip malformed event
        }
      }
      if (status === 'completed' || status === 'failed') break;
    }
    return { status, error };
  } finally {
    window.clearTimeout(t);
  }
}

export async function speakWithVoiceStudio(text: string, voiceId: string): Promise<string> {
  const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICESTUDIO_BASE}/v1/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', voice: voiceId || 'alloy', input: text }) }) : await window.fetch(`${VOICESTUDIO_BASE}/v1/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', voice: voiceId || 'alloy', input: text }) });
  if (!r.ok) {
    let msg = `VoiceStudio speak ${r.status}`;
    try {
      const rawBody = r.body;
      if (rawBody && typeof rawBody === 'object' && 'detail' in rawBody) {
        const d = rawBody.detail;
        msg = typeof d === 'string' ? d.slice(0, 200) : JSON.stringify(d).slice(0, 200);
      }
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const blob = (r.body && typeof r.body === 'object' && 'size' in r.body && typeof (r.body as { size: number }).size === 'number') ? (r.body as { size: number; type?: string }) : null;
  if (!blob || !blob.size) throw new Error('VoiceStudio returned empty audio');
  return URL.createObjectURL(blob as Blob);
}

export async function speakWithVoicebox(text: string, profileId: string, timeoutMs = 90000): Promise<string> {
  const r = useDesktopVoiceFetch ? await voiceFetch(`${VOICEBOX_BASE}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, text, language: 'en' }) }) : await window.fetch(`${VOICEBOX_BASE}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, text, language: 'en' }) });
  if (!r.ok) throw new Error(`voicebox generate ${r.status}`);
  const rawBody = r.body;
  const data = rawBody && typeof rawBody === 'object' && rawBody !== null ? rawBody as { id?: string; status?: string; error?: string } : {};
  if (data.error) throw new Error(data.error);
  if (!data.id) throw new Error('voicebox returned no generation id');
  const { status, error } = await pollVoiceboxGeneration(data.id, timeoutMs);
  if (status === 'failed') throw new Error(error || 'voicebox generation failed');
  return `${VOICEBOX_BASE}/audio/${data.id}`;
}

export async function speakLocal(text: string, voice: LocalVoice): Promise<string> {
  if (voice.engine === 'voicestudio') return speakWithVoiceStudio(text, voice.profileId);
  return speakWithVoicebox(text, voice.profileId);
}
