import { useEffect, useState } from 'react';

export interface VoiceOption {
  uri: string;
  name: string;
  lang: string;
  local: boolean;
  isDefault: boolean;
}

const PREVIEW_TEXT = "Hi, I'm Umbra. What do you need?";

export function loadVoiceList(): VoiceOption[] {
  const synth = window.speechSynthesis;
  if (!synth) return [];
  const voices = synth.getVoices();
  return voices.map((v) => ({
    uri: v.voiceURI,
    name: v.name,
    lang: v.lang,
    local: v.localService,
    isDefault: v.default,
  }));
}

export function useVoices(): VoiceOption[] {
  const [voices, setVoices] = useState<VoiceOption[]>(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    return loadVoiceList();
  });

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const refresh = () => setVoices(loadVoiceList());
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
    };
  }, []);

  return voices;
}

export function pickVoice(uri: string | null | undefined): SpeechSynthesisVoice | undefined {
  const synth = window.speechSynthesis;
  if (!synth) return undefined;
  const all = synth.getVoices();
  if (!all.length) return undefined;
  if (uri) {
    const match = all.find((v) => v.voiceURI === uri);
    if (match) return match;
  }
  return (
    all.find((v) => v.lang.toLowerCase().startsWith('en') && /google|natural|david|zira|samantha|aria|jenny|guy/i.test(v.name)) ??
    all.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    all[0]
  );
}

export function speakWithVoice(text: string, uri: string | null | undefined): SpeechSynthesisUtterance | null {
  const synth = window.speechSynthesis;
  if (!synth || !text.trim()) return null;
  const u = new SpeechSynthesisUtterance(text.trim());
  const voice = pickVoice(uri);
  if (voice) u.voice = voice;
  u.rate = 1.05;
  u.pitch = 1;
  synth.cancel();
  synth.speak(u);
  return u;
}

export function previewVoice(uri: string | null | undefined): void {
  speakWithVoice(PREVIEW_TEXT, uri);
}

export function displayName(v: VoiceOption): string {
  const langLabel = v.lang.replace('-', ' ');
  return `${v.name} (${langLabel}${v.local ? '' : ' · online'})`;
}
