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

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
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
      const r = await fetch(`${VOICESTUDIO_BASE}/v1/audio/voices`);
      if (r.ok) {
        const data = (await r.json()) as { voices?: unknown };
        const arr = Array.isArray(data?.voices) ? (data.voices as Record<string, unknown>[]) : [];
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
      const r = await fetch(`${VOICEBOX_BASE}/profiles`);
      if (r.ok) {
        const arr = (await r.json()) as Record<string, unknown>[];
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
      const r = await fetch(`${VOICESTUDIO_BASE}/v1/audio/transcriptions`, { method: 'POST', body: form });
      if (r.ok) {
        const j = (await r.json()) as { text?: string };
        const text = (j.text ?? '').trim();
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
      const r = await fetch(`${VOICEBOX_BASE}/transcribe`, { method: 'POST', body: form });
      if (r.status === 202) {
        errors.push('voicebox is downloading its Whisper model');
      } else if (r.ok) {
        const j = (await r.json()) as { text?: string };
        const text = (j.text ?? '').trim();
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
    const r = await fetch(`${VOICEBOX_BASE}/generate/${id}/status`, { signal: ctrl.signal });
    if (!r.ok || !r.body) throw new Error(`voicebox status ${r.status}`);
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
  const r = await fetch(`${VOICESTUDIO_BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: voiceId || 'alloy', input: text }),
  });
  if (!r.ok) {
    let msg = `VoiceStudio speak ${r.status}`;
    try {
      const j = (await r.json()) as { detail?: unknown };
      if (j.detail) msg = typeof j.detail === 'string' ? j.detail.slice(0, 200) : JSON.stringify(j.detail).slice(0, 200);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const blob = await r.blob();
  if (!blob.size) throw new Error('VoiceStudio returned empty audio');
  return URL.createObjectURL(blob);
}

export async function speakWithVoicebox(text: string, profileId: string, timeoutMs = 90000): Promise<string> {
  const res = await fetch(`${VOICEBOX_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId, text, language: 'en' }),
  });
  if (!res.ok) throw new Error(`voicebox generate ${res.status}`);
  const data = (await res.json()) as { id?: string; status?: string; error?: string };
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
