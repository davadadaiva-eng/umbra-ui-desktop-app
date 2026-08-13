import { create } from 'zustand';
import type { STTConfig } from '../lib/stt';
import { supabase, signIn, signUp, signOut, sendVerificationCode, verifyEmailCode, sessionToAuthView } from '../lib/auth';
import type { AuthResult } from '../lib/auth';

export type View = 'agent' | 'brain' | 'devices' | 'skills' | 'vault' | 'connectors' | 'meetings' | 'usage' | 'phone' | 'settings';

export interface AvatarConfig {
  skin: string;
  hairStyle: 'short' | 'curly' | 'long' | 'buzz';
  hairColor: string;
  eyeColor: string;
  glasses: 'none' | 'round' | 'square';
  outfit: string;
  accent: string;
}

export interface Agent {
  id: string;
  name: string;
  task: string;
  status: 'running' | 'idle';
  accent: string;
  icon: string;
}

interface User {
  email: string;
  name: string;
}

export interface Profile {
  name: string;
  about: string;
  facts: string[];
}

export type JournalType = 'user' | 'agent' | 'action';

export interface JournalEntry {
  id: string;
  type: JournalType;
  text: string;
  ts: number;
}

export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export interface BrainFile {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  content: string;
}

export interface AgentUsage {
  calls: number;
  tokens: number;
}

export interface UsageState {
  totalCalls: number;
  totalTokens: number;
  agents: Record<string, AgentUsage>;
}

const JOURNAL_KEY = 'umbra-journal-v2';
const PROFILE_KEY = 'umbra-profile-v2';
const AGENT_NAME_KEY = 'umbra-agent-name-v2';
const AI_CONFIG_KEY = 'umbra-ai-config-v2';
const AVATAR_KEY = 'umbra-avatar-v2';
const VOICE_KEY = 'umbra-voice-v2';
const VOICEBOX_KEY = 'umbra-voicebox-profile-v2';
const AGENTS_KEY = 'umbra-agents-v2';
const SEED_KEY = 'umbra-seed-v1';
const BRAIN_KEY = 'umbra-brain-files-v1';
const STT_KEY = 'umbra-stt-v1';
const TALKALWAYS_KEY = 'umbra-talkalways-v1';
const USAGE_KEY = 'umbra-usage-v1';
const BRAIN_CAP = 300;
const JOURNAL_CAP = 600;

const TEST_CONVERSATION: { type: JournalType; text: string; minutesAgo: number }[] = [
  { type: 'action', text: 'Brain writing started for Davide', minutesAgo: 2900 },
  { type: 'user', text: 'Hi Umbra', minutesAgo: 2875 },
  { type: 'agent', text: 'Hey Davide. What do you need?', minutesAgo: 2872 },
  { type: 'user', text: 'open the brain', minutesAgo: 2810 },
  { type: 'action', text: 'Opened the brain', minutesAgo: 2808 },
  { type: 'user', text: 'spawn an agent', minutesAgo: 2740 },
  { type: 'agent', text: 'Spawned Orbit. Scanning your timeline.', minutesAgo: 2737 },
  { type: 'action', text: 'Spawned agent Orbit — Scanning your timeline', minutesAgo: 2736 },
  { type: 'user', text: 'remember that the whitepaper draft is due friday', minutesAgo: 1960 },
  { type: 'agent', text: "Got it. I'll remember: the whitepaper draft is due friday.", minutesAgo: 1957 },
  { type: 'action', text: 'Remembered: the whitepaper draft is due friday', minutesAgo: 1956 },
  { type: 'user', text: 'who are you', minutesAgo: 1720 },
  { type: 'agent', text: "I'm Umbra, your digital self. I remember Davide — one brain, several devices.", minutesAgo: 1717 },
  { type: 'user', text: 'what can you do', minutesAgo: 1680 },
  { type: 'agent', text: 'I can open the brain, recall your notes, spawn agents and control devices. Say "Umbra, open the brain".', minutesAgo: 1677 },
  { type: 'user', text: 'show me my status', minutesAgo: 1440 },
  { type: 'action', text: 'Status check — 3 agents, 2 running', minutesAgo: 1438 },
  { type: 'agent', text: '3 agents online, 2 running. Everything is synced.', minutesAgo: 1437 },
  { type: 'user', text: 'remember Sofia likes the design system v2', minutesAgo: 1320 },
  { type: 'agent', text: "Got it. I'll remember: Sofia likes the design system v2.", minutesAgo: 1317 },
  { type: 'action', text: 'Remembered: Sofia likes the design system v2', minutesAgo: 1316 },
  { type: 'user', text: 'hello', minutesAgo: 960 },
  { type: 'agent', text: 'Hey Davide. What do you need?', minutesAgo: 957 },
  { type: 'user', text: 'how are you', minutesAgo: 900 },
  { type: 'agent', text: 'All synced and listening. Your vault has 9 notes and 13 attachments.', minutesAgo: 897 },
  { type: 'user', text: 'remember to back up the vault before the trip', minutesAgo: 720 },
  { type: 'agent', text: "Got it. I'll remember: back up the vault before the trip.", minutesAgo: 717 },
  { type: 'action', text: 'Remembered: back up the vault before the trip', minutesAgo: 716 },
  { type: 'user', text: 'open recall', minutesAgo: 600 },
  { type: 'action', text: 'Opened recall', minutesAgo: 598 },
  { type: 'user', text: "what's in my brain", minutesAgo: 540 },
  { type: 'agent', text: 'Your brain holds the vault — projects, people, system notes — and everything we have said and done.', minutesAgo: 537 },
  { type: 'user', text: 'goodnight', minutesAgo: 480 },
  { type: 'agent', text: "Goodnight, Davide. I'll keep the brain warm.", minutesAgo: 477 },
  { type: 'action', text: 'Speech stopped', minutesAgo: 476 },
  { type: 'user', text: 'wake up', minutesAgo: 120 },
  { type: 'agent', text: 'Morning, Davide. The whitepaper draft is due friday — want me to open the brain?', minutesAgo: 117 },
  { type: 'user', text: 'stop', minutesAgo: 100 },
  { type: 'action', text: 'Speech stopped', minutesAgo: 99 },
  { type: 'user', text: 'hi', minutesAgo: 45 },
  { type: 'agent', text: 'Hey Davide. What do you need?', minutesAgo: 42 },
];

function loadAvatar(): AvatarConfig {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (!raw) return defaultAvatar;
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      return { ...defaultAvatar, ...p };
    }
  } catch {
    // ignore
  }
  return defaultAvatar;
}

function loadVoiceURI(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

function loadTalkAlways(): boolean {
  try {
    return localStorage.getItem(TALKALWAYS_KEY) !== '0';
  } catch {
    return true;
  }
}

function loadVoiceboxProfile(): string | null {
  try {
    return localStorage.getItem(VOICEBOX_KEY);
  } catch {
    return null;
  }
}

function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && typeof c.provider === 'string' && typeof c.model === 'string') {
      return { provider: c.provider, apiKey: typeof c.apiKey === 'string' ? c.apiKey : '', model: c.model };
    }
  } catch {
    // ignore
  }
  return null;
}

function loadSTTConfig(): STTConfig | null {
  try {
    const raw = localStorage.getItem(STT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && (c.provider === 'local' || c.provider === 'openai' || c.provider === 'groq') && typeof c.model === 'string') {
      return { provider: c.provider, apiKey: typeof c.apiKey === 'string' ? c.apiKey : '', model: c.model };
    }
  } catch {
    // ignore
  }
  return null;
}

function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e) => e && typeof e.text === 'string' && ['user', 'agent', 'action'].includes(e.type))
      .slice(-JOURNAL_CAP)
      .map((e) => ({ id: e.id, type: e.type, text: e.text, ts: Number(e.ts) || Date.now() }));
  } catch {
    return [];
  }
}

function saveJournal(journal: JournalEntry[]) {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal.slice(-JOURNAL_CAP)));
  } catch {
    // ignore
  }
}

function fmtBrainDate(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `Today, ${h}:${m}`;
}

function welcomeBrainFile(): BrainFile {
  return {
    id: `welcome-${Date.now()}`,
    name: 'welcome.md',
    type: 'text/markdown',
    size: '1 KB',
    date: fmtBrainDate(new Date()),
    content: 'This is the start of your brain. It stays small until you talk to Umbra, spawn an agent, join a meeting or remember something — then it grows.',
  };
}

function loadBrainFiles(): BrainFile[] {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) {
      const seeded = [welcomeBrainFile()];
      localStorage.setItem(BRAIN_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f.name === 'string' && typeof f.content === 'string')
      .slice(0, BRAIN_CAP)
      .map((f) => ({
        id: typeof f.id === 'string' ? f.id : `b-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        type: typeof f.type === 'string' ? f.type : 'text/plain',
        size: typeof f.size === 'string' ? f.size : '1 KB',
        date: typeof f.date === 'string' ? f.date : '',
        content: f.content,
      }));
  } catch {
    return [];
  }
}

function saveBrainFiles(files: BrainFile[]) {
  try {
    localStorage.setItem(BRAIN_KEY, JSON.stringify(files.slice(0, BRAIN_CAP)));
  } catch {
    // ignore
  }
}

function loadUsage(): UsageState {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { totalCalls: 0, totalTokens: 0, agents: {} };
    const u = JSON.parse(raw);
    if (!u || typeof u !== 'object') return { totalCalls: 0, totalTokens: 0, agents: {} };
    return {
      totalCalls: typeof u.totalCalls === 'number' ? u.totalCalls : 0,
      totalTokens: typeof u.totalTokens === 'number' ? u.totalTokens : 0,
      agents: u.agents && typeof u.agents === 'object' ? u.agents : {},
    };
  } catch {
    return { totalCalls: 0, totalTokens: 0, agents: {} };
  }
}

function saveUsage(usage: UsageState) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // ignore
  }
}

function loadProfile(key: string): Profile | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.name === 'string') {
      return {
        name: p.name,
        about: typeof p.about === 'string' ? p.about : '',
        facts: Array.isArray(p.facts) ? p.facts.filter((f: unknown) => typeof f === 'string') : [],
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function loadAgentName(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(AGENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.name === 'string' && typeof a.task === 'string')
      .map((a) => ({
        id: typeof a.id === 'string' ? a.id : `agent-${Math.random().toString(36).slice(2)}`,
        name: a.name,
        task: a.task,
        status: a.status === 'idle' ? 'idle' : 'running',
        accent: typeof a.accent === 'string' ? a.accent : defaultAvatar.accent,
        icon: typeof a.icon === 'string' ? a.icon : 'sparkles',
      }));
  } catch {
    return [];
  }
}

function loadNamedMain(): boolean {
  try {
    return localStorage.getItem('umbra-named-v1') === '1';
  } catch {
    return false;
  }
}

function saveAgents(agents: Agent[]) {
  try {
    localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
  } catch {
    // ignore
  }
}

interface AppState {
  isAuthenticated: boolean;
  isAuthReady: boolean;
  emailVerified: boolean;
  isOnboarded: boolean;
  user: User | null;
  avatar: AvatarConfig;
  avatarName: string;
  profile: Profile | null;
  journal: JournalEntry[];
  brainFiles: BrainFile[];
  usage: UsageState;
  aiConfig: AIConfig | null;
  sttConfig: STTConfig | null;
  voiceURI: string | null;
  voiceboxProfile: string | null;
  agents: Agent[];
  focusedAgentId: string | null;
  currentView: View;
  isSidebarCollapsed: boolean;
  talkAlways: boolean;
  initializeAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (name: string, email: string, password: string) => Promise<AuthResult>;
  sendCode: (email: string) => Promise<AuthResult>;
  verifyCode: (email: string, code: string) => Promise<AuthResult>;
  setTalkAlways: (on: boolean) => void;
  finishOnboarding: () => Promise<void>;
  logout: () => Promise<void>;
  setView: (view: View) => void;
  toggleSidebar: () => void;
  updateAvatar: (patch: Partial<AvatarConfig>) => void;
  setAvatarName: (name: string) => void;
  namedMain: boolean;
  markNamedMain: () => void;
  setProfile: (profile: Profile) => void;
  addFact: (fact: string) => void;
  addJournal: (type: JournalType, text: string) => void;
  addBrainFile: (name: string, content: string, type?: string) => void;
  recordUsage: (agentName: string, tokens: number) => void;
  setAIConfig: (config: AIConfig) => void;
  clearAIConfig: () => void;
  setSTTConfig: (config: STTConfig) => void;
  clearSTTConfig: () => void;
  setVoice: (uri: string | null) => void;
  setVoiceboxProfile: (id: string | null) => void;
  clearBrain: () => void;
  addAgent: (agent: Omit<Agent, 'id'>) => Agent;
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id'>>) => void;
  removeAgent: (id: string) => void;
  setAgentStatus: (id: string, status: Agent['status']) => void;
  focusAgent: (id: string | null) => void;
  seedTestBrain: () => void;
}

export const defaultAvatar: AvatarConfig = {
  skin: '#F2C9A0',
  hairStyle: 'short',
  hairColor: '#2B2320',
  eyeColor: '#3D5A80',
  glasses: 'none',
  outfit: '#1F2937',
  accent: '#3B82F6',
};

let authListenerStarted = false;

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  isAuthReady: false,
  emailVerified: false,
  isOnboarded: false,
  user: null,
  avatar: loadAvatar(),
  avatarName: loadAgentName(AGENT_NAME_KEY) ?? 'Umbra',
  namedMain: loadNamedMain(),
  profile: loadProfile(PROFILE_KEY),
  journal: loadJournal(),
  brainFiles: loadBrainFiles(),
  usage: loadUsage(),
  aiConfig: loadAIConfig(),
  sttConfig: loadSTTConfig(),
  voiceURI: loadVoiceURI(),
  voiceboxProfile: loadVoiceboxProfile(),
  agents: loadAgents(),
  focusedAgentId: null,
  currentView: 'agent',
  isSidebarCollapsed: false,
  talkAlways: loadTalkAlways(),

  initializeAuth: async () => {
    const sb = supabase;
    if (!sb) {
      set({ isAuthReady: true });
      return;
    }
    type SessionType = Awaited<ReturnType<typeof sb.auth.getSession>>['data']['session'];
    let session: SessionType = null;
    try {
      const result = await Promise.race([
        sb.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 8000)
        ),
      ]);
      session = result.data?.session ?? null;
    } catch (e) {
      console.error('[auth] initializeAuth failed', e);
    }
    const applySession = (nextSession: SessionType | null) => {
      const v = sessionToAuthView(nextSession);
      set({ isAuthenticated: !!nextSession, user: v.user, emailVerified: v.emailVerified, isOnboarded: v.isOnboarded });
    };

    set({ isAuthReady: true, isAuthenticated: !!session });
    applySession(session);

    if (!authListenerStarted) {
      sb.auth.onAuthStateChange((_event, nextSession) => {
        applySession(nextSession);
      });
      authListenerStarted = true;
    }
  },

  login: async (email: string, password: string) => {
    const res = await signIn(email, password);
    if (res.ok && supabase) {
      const { data } = await supabase.auth.getSession();
      const v = sessionToAuthView(data?.session);
      set({ isAuthenticated: true, user: v.user, emailVerified: v.emailVerified, isOnboarded: v.isOnboarded });
    }
    return res;
  },

  signup: async (name, email, password) => {
    const res = await signUp(name, email, password);
    if (!res.ok || !supabase) return res;
    // Sign up succeeded. If Supabase didn't hand us a session right away
    // (e.g. "Confirm email" is on), try a normal password sign-in so the
    // user lands in the app instead of on a verification screen.
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      const v = sessionToAuthView(data.session);
      set({ isAuthenticated: true, user: v.user, emailVerified: v.emailVerified, isOnboarded: v.isOnboarded });
      return res;
    }
    const loginRes = await signIn(email, password);
    if (loginRes.ok) {
      const { data: sessionData } = await supabase.auth.getSession();
      const v = sessionToAuthView(sessionData?.session);
      set({ isAuthenticated: true, user: v.user, emailVerified: v.emailVerified, isOnboarded: v.isOnboarded });
    }
    return loginRes.ok ? res : loginRes;
  },

  sendCode: (email) => sendVerificationCode(email),

  verifyCode: async (email, code) => {
    const res = await verifyEmailCode(email, code);
    if (res.ok && supabase) {
      const { data } = await supabase.auth.getSession();
      const v = sessionToAuthView(data?.session);
      set({ isAuthenticated: true, emailVerified: true, user: v.user, isOnboarded: v.isOnboarded });
    }
    return res;
  },

  setTalkAlways: (on) => {
    set({ talkAlways: on });
    try {
      localStorage.setItem(TALKALWAYS_KEY, on ? '1' : '0');
    } catch {
      // ignore
    }
  },

  finishOnboarding: async () => {
    if (supabase) {
      try {
        await supabase.auth.updateUser({ data: { onboarded: true } });
      } catch {
        // ignore
      }
    }
    set({ isOnboarded: true });
  },

  logout: async () => {
    await signOut();
    set({
      isAuthenticated: false,
      user: null,
      emailVerified: false,
      isOnboarded: false,
      currentView: 'agent',
    });
  },

  setView: (view) => {
    set({ currentView: view });
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
  },

  updateAvatar: (patch) => {
    set((state) => {
      const next = { ...state.avatar, ...patch };
      try {
        localStorage.setItem(AVATAR_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { avatar: next };
    });
  },

  setAvatarName: (name) => {
    set({ avatarName: name });
    try {
      localStorage.setItem(AGENT_NAME_KEY, name);
    } catch {
      // ignore
    }
  },

  markNamedMain: () => {
    set({ namedMain: true });
    try {
      localStorage.setItem('umbra-named-v1', '1');
    } catch {
      // ignore
    }
  },

  setProfile: (profile) => {
    set({ profile });
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
  },

  addFact: (fact) => {
    const text = fact.trim().slice(0, 200);
    if (!text) return;
    set((state) => {
      const profile = state.profile ?? { name: '', about: '', facts: [] };
      const next = { ...profile, facts: [...profile.facts, text] };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return { profile: next };
    });
  },

  addJournal: (type, text) => {
    const entry: JournalEntry = {
      id: `j-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      text: text.trim().slice(0, 300),
      ts: Date.now(),
    };
    set((state) => {
      const next = [...state.journal, entry].slice(-JOURNAL_CAP);
      saveJournal(next);
      return { journal: next };
    });
  },

  recordUsage: (agentName, tokens) => {
    const t = Math.max(1, Math.round(tokens));
    set((state) => {
      const name = agentName || 'Umbra';
      const cur = state.usage.agents[name] ?? { calls: 0, tokens: 0 };
      const next: UsageState = {
        totalCalls: state.usage.totalCalls + 1,
        totalTokens: state.usage.totalTokens + t,
        agents: { ...state.usage.agents, [name]: { calls: cur.calls + 1, tokens: cur.tokens + t } },
      };
      saveUsage(next);
      return { usage: next };
    });
  },

  addBrainFile: (name, content, type = 'text/plain') => {
    const file: BrainFile = {
      id: `b-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      type,
      size: `${Math.max(1, Math.round(content.length / 1024))} KB`,
      date: fmtBrainDate(new Date()),
      content,
    };
    set((state) => {
      const next = [file, ...state.brainFiles].slice(0, BRAIN_CAP);
      saveBrainFiles(next);
      return { brainFiles: next };
    });
  },

  setAIConfig: (config) => {
    set({ aiConfig: config });
    try {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  },

  clearAIConfig: () => {
    set({ aiConfig: null });
    try {
      localStorage.removeItem(AI_CONFIG_KEY);
    } catch {
      // ignore
    }
  },

  setSTTConfig: (config) => {
    set({ sttConfig: config });
    try {
      localStorage.setItem(STT_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  },

  clearSTTConfig: () => {
    set({ sttConfig: null });
    try {
      localStorage.removeItem(STT_KEY);
    } catch {
      // ignore
    }
  },

  setVoice: (uri) => {
    set({ voiceURI: uri });
    try {
      if (uri) localStorage.setItem(VOICE_KEY, uri);
      else localStorage.removeItem(VOICE_KEY);
    } catch {
      // ignore
    }
  },

  setVoiceboxProfile: (id) => {
    set({ voiceboxProfile: id });
    try {
      if (id) localStorage.setItem(VOICEBOX_KEY, id);
      else localStorage.removeItem(VOICEBOX_KEY);
    } catch {
      // ignore
    }
  },

  clearBrain: () => {
    try {
      for (const k of [JOURNAL_KEY, PROFILE_KEY, AGENT_NAME_KEY, AI_CONFIG_KEY, AVATAR_KEY, VOICE_KEY, VOICEBOX_KEY, AGENTS_KEY, BRAIN_KEY, STT_KEY, 'umbra-journal', 'umbra-profile', 'umbra-agent-name', 'umbra-named-v1']) localStorage.removeItem(k);
    } catch {
      // ignore
    }
    set({
      profile: null,
      avatarName: 'Umbra',
      namedMain: false,
      journal: [],
      brainFiles: loadBrainFiles(),
      aiConfig: null,
      sttConfig: null,
      voiceURI: null,
      voiceboxProfile: null,
      agents: [],
      focusedAgentId: null,
      avatar: defaultAvatar,
    });
  },

  addAgent: (agent) => {
    const id = `agent-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const full = { ...agent, id };
    set((state) => {
      const next = [...state.agents, full];
      saveAgents(next);
      return { agents: next, focusedAgentId: id };
    });
    return full;
  },

  removeAgent: (id) => {
    set((state) => {
      const next = state.agents.filter((a) => a.id !== id);
      saveAgents(next);
      return {
        agents: next,
        focusedAgentId: state.focusedAgentId === id ? null : state.focusedAgentId,
      };
    });
  },

  updateAgent: (id, patch) => {
    set((state) => {
      const next = state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
      saveAgents(next);
      return { agents: next };
    });
  },

  setAgentStatus: (id, status) => {
    set((state) => {
      const next = state.agents.map((a) => (a.id === id ? { ...a, status } : a));
      saveAgents(next);
      return { agents: next };
    });
  },

  focusAgent: (id) => {
    set({ focusedAgentId: id });
  },

  seedTestBrain: () => {
    try {
      if (localStorage.getItem(SEED_KEY)) return;
    } catch {
      return;
    }
    if (useAppStore.getState().journal.length > 0) {
      try {
        localStorage.setItem(SEED_KEY, '1');
      } catch {
        // ignore
      }
      return;
    }
    const now = Date.now();
    const seeded: JournalEntry[] = TEST_CONVERSATION.map((e) => ({
      id: `seed-${e.minutesAgo}-${Math.floor(Math.random() * 1000)}`,
      type: e.type,
      text: e.text,
      ts: now - e.minutesAgo * 60000,
    }));
    set({ journal: seeded });
    saveJournal(seeded);
    try {
      localStorage.setItem(SEED_KEY, '1');
    } catch {
      // ignore
    }
  },
}));
