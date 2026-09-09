import { create } from 'zustand';
import type { STTConfig } from '../lib/stt';
import { supabase, signIn, signUp, signOut, sendVerificationCode, verifyEmailCode, sessionToAuthView } from '../lib/auth';
import type { AuthResult } from '../lib/auth';
import { isBackendAvailable, getStatus, getConsent, type BackendStatus, type Task } from '../lib/backend';
import { connect, disconnect, onEvent, onSnapshot, onAnyEvent, onDisconnect } from '../lib/backendWs';

export type View = 'agent' | 'brain' | 'devices' | 'smarthome' | 'skills' | 'vault' | 'connectors' | 'meetings' | 'usage' | 'phone' | 'settings';

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

const BRAIN_CAP = 300;
const JOURNAL_CAP = 600;

// Namespacing localStorage by Supabase user id so multiple accounts on one
// machine do not share the same vault. When there is no authenticated user we
// fall back to an anonymous local-only namespace so the app still works.
function storagePrefixForUser(userId: string | null) {
  if (!userId) return 'umbra-anon';
  // Use a deterministic prefix derived from the Supabase user id.
  return `umbra-${userId}`;
}

function namespacedKey(userId: string | null, key: string) {
  return `${storagePrefixForUser(userId)}:${key}`;
}

function namespacedRemove(userId: string | null, key: string) {
  try { localStorage.removeItem(namespacedKey(userId, key)); } catch { /* ignore */ }
}

function namespacedGet(userId: string | null, key: string): string | null {
  try { return localStorage.getItem(namespacedKey(userId, key)); } catch { return null; }
}

function namespacedSet(userId: string | null, key: string, value: string) {
  try { localStorage.setItem(namespacedKey(userId, key), value); } catch { /* ignore */ }
}

// Current authenticated user id used for storage namespacing. This is set from
// Supabase session and updated on login/signup/logout/initializeAuth.
export function currentStorageUserId(): string | null {
  const s = typeof window !== 'undefined' ? window.localStorage : null;
  if (!s) return null;
  try {
    const raw = s.getItem('umbra-storage-user-id');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Convenience wrappers keyed by the current storage user id. These are used by
// the store for all user-scoped storage so switching users switches the vault.
export function getNS(userId: string | null, key: string): string | null {
  return namespacedGet(userId, key);
}
export function setNS(userId: string | null, key: string, value: string): void {
  namespacedSet(userId, key, value);
}
export function removeNS(userId: string | null, key: string): void {
  namespacedRemove(userId, key);
}

// Authenticated user keys are created dynamically via namespacedKey(...).

// Migration helper: when we first see an authenticated user, move any legacy
// unkeyed values under the new namespace and clear the old global keys.
function migrateLegacyKeysToUser(userId: string | null) {
  if (!userId) return;
  const migrate = (legacy: string, nsKey: string) => {
    try {
      const legacyVal = localStorage.getItem(legacy);
      if (legacyVal !== null) {
        localStorage.setItem(namespacedKey(userId, nsKey), legacyVal);
        localStorage.removeItem(legacy);
      }
    } catch { /* ignore */ }
  };
  migrate('umbra-journal-v2', 'journal');
  migrate('umbra-profile-v2', 'profile');
  migrate('umbra-agent-name-v2', 'agent-name');
  migrate('umbra-ai-config-v2', 'ai-config');
  migrate('umbra-avatar-v2', 'avatar');
  migrate('umbra-voice-v2', 'voice');
  migrate('umbra-voicebox-profile-v2', 'voicebox');
  migrate('umbra-agents-v2', 'agents');
  migrate('umbra-stt-v1', 'stt');
  migrate('umbra-talkalways-v1', 'talkalways');
  migrate('umbra-usage-v1', 'usage');
  migrate('umbra-brain-files-v1', 'brain');
  migrate('umbra-seed-v1', 'seed');
}

const JOURNAL_KEY = 'journal';
const PROFILE_KEY = 'profile';
const AGENT_NAME_KEY = 'agent-name';
const AI_CONFIG_KEY = 'ai-config';
const AVATAR_KEY = 'avatar';
const VOICE_KEY = 'voice';
const VOICEBOX_KEY = 'voicebox';
const AGENTS_KEY = 'agents';
const SEED_KEY = 'seed';
const BRAIN_KEY = 'brain';
const STT_KEY = 'stt';
const TALKALWAYS_KEY = 'talkalways';
const USAGE_KEY = 'usage';

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

function loadFromStore(userId: string | null, key: string): string | null {
  if (userId) {
    migrateLegacyKeysToUser(userId);
    return namespacedGet(userId, key);
  }
  return namespacedGet(userId, key);
}

function loadAvatar(userId: string | null): AvatarConfig {
  try {
    const raw = loadFromStore(userId, AVATAR_KEY);
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

function loadVoiceURI(userId: string | null): string | null {
  return loadFromStore(userId, VOICE_KEY);
}

function loadTalkAlways(userId: string | null): boolean {
  try {
    return loadFromStore(userId, TALKALWAYS_KEY) !== '0';
  } catch {
    return true;
  }
}

function loadVoiceboxProfile(userId: string | null): string | null {
  return loadFromStore(userId, VOICEBOX_KEY);
}

function loadAIConfig(userId: string | null): AIConfig | null {
  try {
    const raw = loadFromStore(userId, AI_CONFIG_KEY);
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

function loadSTTConfig(userId: string | null): STTConfig | null {
  try {
    const raw = loadFromStore(userId, STT_KEY);
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

function loadJournal(userId: string | null): JournalEntry[] {
  try {
    const raw = loadFromStore(userId, JOURNAL_KEY);
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

function saveJournal(userId: string | null, journal: JournalEntry[]) {
  try {
    namespacedSet(userId, JOURNAL_KEY, JSON.stringify(journal.slice(-JOURNAL_CAP)));
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

function loadBrainFiles(userId: string | null): BrainFile[] {
  try {
    const raw = loadFromStore(userId, BRAIN_KEY);
    if (!raw) {
      const seeded = [welcomeBrainFile()];
      namespacedSet(userId, BRAIN_KEY, JSON.stringify(seeded));
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

function saveBrainFiles(userId: string | null, files: BrainFile[]) {
  try {
    namespacedSet(userId, BRAIN_KEY, JSON.stringify(files.slice(0, BRAIN_CAP)));
  } catch {
    // ignore
  }
}

function loadUsage(userId: string | null): UsageState {
  try {
    const raw = loadFromStore(userId, USAGE_KEY);
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

function saveUsage(userId: string | null, usage: UsageState) {
  try {
    namespacedSet(userId, USAGE_KEY, JSON.stringify(usage));
  } catch {
    // ignore
  }
}

function loadProfileFromStore(userId: string | null, key: string): Profile | null {
  try {
    const raw = loadFromStore(userId, key);
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

function loadAgentNameFromStore(userId: string | null, key: string): string | null {
  return loadFromStore(userId, key);
}

function loadAgentsFromStore(userId: string | null, key: string): Agent[] {
  try {
    const raw = loadFromStore(userId, key);
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

function loadNamedMain(userId: string | null): boolean {
  try {
    return loadFromStore(userId, 'named-main') === '1';
  } catch {
    return false;
  }
}

function saveAgentsToStore(userId: string | null, key: string, agents: Agent[]) {
  try {
    namespacedSet(userId, key, JSON.stringify(agents));
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
  storageUserId: string | null;
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
  backendOnline: boolean;
  backendStatus: BackendStatus | null;
  activeTasks: Task[];
  connectBackend: () => void;
  disconnectBackend: () => void;
  refreshBackendStatus: () => Promise<void>;
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
  reloadUserStorage: () => void;

  // Backend integration
  backendApiKey: string | null;
  setBackendApiKey: (key: string | null) => void;

  // Screen awareness
  screenWatching: boolean;
  screenState: Record<string, unknown> | null;
  setScreenWatching: (on: boolean) => void;

  // Consent
  consentState: { granted: boolean; denied: boolean; askOncePerSession: boolean; emergencyStopArmed: boolean } | null;
  refreshConsent: () => Promise<void>;

  // Live tasks from WebSocket
  liveTasks: Task[];
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

function storageUserIdFromUser(user: User | null) {
  // Use Supabase user id when available; otherwise keep the existing anonymous
  // storage prefix so the app still works before/after auth.
  if (!user) return currentStorageUserId();
  return user.email?.toLowerCase().trim() || null;
}

export const useAppStore = create<AppState>((set, get) => {
  const initialUserId = currentStorageUserId();

  const reloadUserStorage = () => {
    const userId = get().storageUserId;
    set({
      avatar: loadAvatar(userId),
      avatarName: loadAgentNameFromStore(userId, AGENT_NAME_KEY) ?? 'Umbra',
      namedMain: loadNamedMain(userId),
      profile: loadProfileFromStore(userId, PROFILE_KEY),
      journal: loadJournal(userId),
      brainFiles: loadBrainFiles(userId),
      usage: loadUsage(userId),
      aiConfig: loadAIConfig(userId),
      sttConfig: loadSTTConfig(userId),
      voiceURI: loadVoiceURI(userId),
      voiceboxProfile: loadVoiceboxProfile(userId),
      agents: loadAgentsFromStore(userId, AGENTS_KEY),
    });
  };

  return {
    isAuthenticated: false,
    isAuthReady: false,
    emailVerified: false,
    isOnboarded: false,
    user: null,
    storageUserId: initialUserId,
    avatar: loadAvatar(initialUserId),
    avatarName: loadAgentNameFromStore(initialUserId, AGENT_NAME_KEY) ?? 'Umbra',
    namedMain: loadNamedMain(initialUserId),
    profile: loadProfileFromStore(initialUserId, PROFILE_KEY),
    journal: loadJournal(initialUserId),
    brainFiles: loadBrainFiles(initialUserId),
    usage: loadUsage(initialUserId),
    aiConfig: loadAIConfig(initialUserId),
    sttConfig: loadSTTConfig(initialUserId),
    voiceURI: loadVoiceURI(initialUserId),
    voiceboxProfile: loadVoiceboxProfile(initialUserId),
    agents: loadAgentsFromStore(initialUserId, AGENTS_KEY),
    focusedAgentId: null,
    currentView: 'agent',
    isSidebarCollapsed: false,
    talkAlways: loadTalkAlways(initialUserId),
    backendOnline: false,
    backendStatus: null,
    activeTasks: [],
    backendApiKey: loadFromStore(initialUserId, 'backend-apikey') || null,
    screenWatching: false,
    screenState: null,
    consentState: null,
    liveTasks: [],
    reloadUserStorage,

    setBackendApiKey: (key) => {
      set({ backendApiKey: key });
      const userId = get().storageUserId;
      try {
        if (key) namespacedSet(userId, 'backend-apikey', key);
        else namespacedRemove(userId, 'backend-apikey');
      } catch { /* ignore */ }
    },

  setTalkAlways: (on) => {
    set({ talkAlways: on });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, TALKALWAYS_KEY, on ? '1' : '0');
    } catch { /* ignore */ }
  },

  setScreenWatching: (on) => {
    set({ screenWatching: on });
  },

  refreshConsent: async () => {
    try {
      if (await isBackendAvailable()) {
        const consent = await getConsent();
        set({ consentState: consent });
      }
    } catch { /* ignore */ }
  },

  connectBackend: () => {
    connect();
    onSnapshot((status) => {
      set({ backendOnline: true, backendStatus: status as unknown as BackendStatus });
    });
    // If the socket drops (backend died/restarted), stop claiming it is
    // online until a fresh snapshot arrives on reconnect.
    onDisconnect(() => {
      set({ backendOnline: false });
    });
    
    // Task events. The backend broadcasts positional args: 1-arg events arrive
    // as a bare task-id string, 2-arg events as [taskId, detail].
    const taskIdOf = (payload: unknown): string | undefined => {
      if (typeof payload === 'string') return payload || undefined;
      if (Array.isArray(payload)) return payload[0] ? String(payload[0]) : undefined;
      if (payload && typeof payload === 'object') {
        const taskId = (payload as { taskId?: unknown }).taskId;
        return taskId ? String(taskId) : undefined;
      }
      return undefined;
    };
    const taskExtra = (payload: unknown): unknown =>
      Array.isArray(payload) ? payload[1] : undefined;
    // task:completed result is { summary, output, steps }; surface the summary.
    const taskResultText = (payload: unknown): string | null => {
      const extra = taskExtra(payload);
      if (typeof extra === 'string') return extra || null;
      if (extra && typeof extra === 'object') {
        const r = extra as { summary?: unknown; output?: unknown };
        const s = r.summary ?? r.output;
        return typeof s === 'string' ? s : null;
      }
      return null;
    };
    const taskErrorText = (payload: unknown): string | null => {
      const extra = taskExtra(payload);
      return typeof extra === 'string' ? extra || null : null;
    };

    onEvent('task:created', (payload) => {
      const taskId = taskIdOf(payload);
      if (!taskId) return;
      set((s) => {
        const exists = s.activeTasks.some((t) => t.id === taskId);
        if (exists) return s;
        return { activeTasks: [...s.activeTasks, { id: taskId, description: '', priority: 0, status: 'pending' as const, steps: [], result: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] };
      });
    });
    onEvent('task:started', (payload) => {
      const taskId = taskIdOf(payload);
      set((s) => ({
        activeTasks: s.activeTasks.map((t) => t.id === taskId ? { ...t, status: 'executing' as const } : t),
      }));
    });
    onEvent('task:completed', (payload) => {
      const taskId = taskIdOf(payload);
      const result = taskResultText(payload);
      set((s) => ({
        activeTasks: s.activeTasks.map((t) => t.id === taskId ? { ...t, status: 'completed' as const, result } : t),
      }));
    });
    onEvent('task:failed', (payload) => {
      const taskId = taskIdOf(payload);
      const error = taskErrorText(payload);
      set((s) => ({
        activeTasks: s.activeTasks.map((t) => t.id === taskId ? { ...t, status: 'failed' as const, error: error ?? 'failed' } : t),
      }));
    });
    onEvent('task:cancelled', (payload) => {
      const taskId = taskIdOf(payload);
      set((s) => ({
        activeTasks: s.activeTasks.map((t) => t.id === taskId ? { ...t, status: 'cancelled' as const } : t),
      }));
    });
    
    // Knowledge & memory events
    onEvent('knowledge:updated', () => {
      // Could trigger a refresh of brain data
    });
    
    // Screen events
    onEvent('screen:update', (payload) => {
      set({ screenState: payload as Record<string, unknown> });
    });
    
    // Meeting events
    onEvent('meeting:transcript', (_payload) => {
      // Store meeting transcript updates
    });
    onEvent('meeting:order', (_payload) => {
      // Handle spoken meeting orders
    });
    
    // Config changes
    onEvent('config:changed', () => {
      // Refresh backend status
    });
    
    // Vault events
    onEvent('vault:entry', () => {
      // Could trigger audit log refresh
    });
    
    // Chrome telemetry
    onEvent('chrome:telemetry', () => {
      // Could refresh chrome data
    });
    
    // Catch-all for logging
    onAnyEvent((name, payload) => {
      console.log(`[ws] ${name}`, payload);
    });
  },

  disconnectBackend: () => {
    disconnect();
    set({ backendOnline: false, backendStatus: null });
  },

  refreshBackendStatus: async () => {
    const online = await isBackendAvailable();
    set({ backendOnline: online });
    if (online) {
      try {
        const status = await getStatus();
        set({ backendStatus: status });
      } catch { /* ignore */ }
    }
  },

  initializeAuth: async () => {
    if (import.meta.env.DEV) {
      try {
        const devUser = localStorage.getItem('umbra-dev-user');
        if (devUser) {
          const u = JSON.parse(devUser);
          set({ isAuthReady: true, isAuthenticated: true, user: u, emailVerified: true, isOnboarded: true });
          return;
        }
      } catch { /* ignore */ }
    }
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

    // Keep the localStorage namespace aligned with auth state so multiple
    // accounts on one machine do not share the same vault.
    const userId = storageUserIdFromUser(session ? sessionToAuthView(session).user : null);
    set({ storageUserId: userId });
    migrateLegacyKeysToUser(userId);
    reloadUserStorage();

    if (!authListenerStarted) {
      sb.auth.onAuthStateChange((_event, nextSession) => {
        const vNext = sessionToAuthView(nextSession);
        const userIdNext = storageUserIdFromUser(vNext.user);
        set({
          user: vNext.user,
          isAuthenticated: !!nextSession,
          emailVerified: vNext.emailVerified,
          isOnboarded: vNext.isOnboarded,
          storageUserId: userIdNext,
        });
        migrateLegacyKeysToUser(userIdNext);
        reloadUserStorage();
      });
      authListenerStarted = true;
    }

    // Try to sync with backend
    if (session) {
      try {
        if (await isBackendAvailable()) {
          // Check if we have a stored backend API key in the current namespace
          const storedKey = namespacedGet(userId, 'backend-apikey');
          if (storedKey) {
            set({ backendApiKey: storedKey });
          }
        }
      } catch { /* ignore */ }
    }
  },

  login: async (email: string, password: string) => {
    const res = await signIn(email, password);
    if (res.ok) {
      if (import.meta.env.DEV && email.trim().toLowerCase() === 'davide@gmail.com' && password === 'davide12') {
        const u = { email: 'davide@gmail.com', name: 'Davide' };
        localStorage.setItem('umbra-dev-user', JSON.stringify(u));
        set({ isAuthenticated: true, user: u, emailVerified: true, isOnboarded: true });
      } else if (supabase) {
        const { data } = await supabase.auth.getSession();      const v = sessionToAuthView(data?.session);
      const userId = storageUserIdFromUser(v.user);
      set({
        isAuthenticated: true,
        user: v.user,
        emailVerified: v.emailVerified,
        isOnboarded: v.isOnboarded,
        storageUserId: userId,
      });
      migrateLegacyKeysToUser(userId);
      reloadUserStorage();

        // Try to sync with backend
        try {
          if (await isBackendAvailable()) {
            const storedKey = namespacedGet(userId, 'backend-apikey');
            if (storedKey) {
              set({ backendApiKey: storedKey });
            }
          }
        } catch { /* ignore */ }
      }
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
      const userId = storageUserIdFromUser(v.user);
      set({
        isAuthenticated: true,
        user: v.user,
        emailVerified: v.emailVerified,
        isOnboarded: v.isOnboarded,
        storageUserId: userId,
      });
      migrateLegacyKeysToUser(userId);
      reloadUserStorage();
      return res;
    }
    const loginRes = await signIn(email, password);
    if (loginRes.ok) {
      const { data: sessionData } = await supabase.auth.getSession();
      const v = sessionToAuthView(sessionData?.session);
      const userId = storageUserIdFromUser(v.user);
      set({
        isAuthenticated: true,
        user: v.user,
        emailVerified: v.emailVerified,
        isOnboarded: v.isOnboarded,
        storageUserId: userId,
      });
      migrateLegacyKeysToUser(userId);
      reloadUserStorage();
    }
    return loginRes.ok ? res : loginRes;
  },

  sendCode: (email) => sendVerificationCode(email),

  verifyCode: async (email, code) => {
    const res = await verifyEmailCode(email, code);
    if (res.ok && supabase) {
      const { data } = await supabase.auth.getSession();
      const v = sessionToAuthView(data?.session);
      const userId = storageUserIdFromUser(v.user);
      set({
        isAuthenticated: true,
        emailVerified: true,
        user: v.user,
        isOnboarded: v.isOnboarded,
        storageUserId: userId,
      });
      migrateLegacyKeysToUser(userId);
      reloadUserStorage();
    }
    return res;
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
    // Persist onboarding under the current user namespace so it survives
    // across restarts and does not leak to other local accounts.
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, 'onboarded', '1');
    } catch { /* ignore */ }
  },

  logout: async () => {
    await signOut();
    if (import.meta.env.DEV) {
      try { localStorage.removeItem('umbra-dev-user'); } catch { /* ignore */ }
    }
    // Switch the localStorage namespace back to an anonymous local-only one
    // so the next login/signup does not inherit the previous user's vault.
    set({
      isAuthenticated: false,
      user: null,
      storageUserId: null,
      emailVerified: false,
      isOnboarded: false,
      currentView: 'agent',
    });
    reloadUserStorage();
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
      const userId = get().storageUserId;
      try {
        namespacedSet(userId, AVATAR_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return { avatar: next };
    });
  },  setAvatarName: (name) => {
    set({ avatarName: name });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, AGENT_NAME_KEY, name);
    } catch { /* ignore */ }
  },

  markNamedMain: () => {
    set({ namedMain: true });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, 'named-main', '1');
    } catch { /* ignore */ }
  },

  setProfile: (profile) => {
    set({ profile });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, PROFILE_KEY, JSON.stringify(profile));
    } catch { /* ignore */ }
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
      const userId = get().storageUserId;
      const next = [...state.journal, entry].slice(-JOURNAL_CAP);
      saveJournal(userId, next);
      return { journal: next };
    });
  },

  recordUsage: (agentName, tokens) => {
    const t = Math.max(1, Math.round(tokens));
    set((state) => {
      const userId = get().storageUserId;
      const name = agentName || 'Umbra';
      const cur = state.usage.agents[name] ?? { calls: 0, tokens: 0 };
      const next: UsageState = {
        totalCalls: state.usage.totalCalls + 1,
        totalTokens: state.usage.totalTokens + t,
        agents: { ...state.usage.agents, [name]: { calls: cur.calls + 1, tokens: cur.tokens + t } },
      };
      saveUsage(userId, next);
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
      const userId = get().storageUserId;
      const next = [file, ...state.brainFiles].slice(0, BRAIN_CAP);
      saveBrainFiles(userId, next);
      return { brainFiles: next };
    });
  },

  setAIConfig: (config) => {
    set({ aiConfig: config });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, AI_CONFIG_KEY, JSON.stringify(config));
    } catch { /* ignore */ }
  },

  clearAIConfig: () => {
    set({ aiConfig: null });
    const userId = get().storageUserId;
    try {
      namespacedRemove(userId, AI_CONFIG_KEY);
    } catch { /* ignore */ }
  },

  setSTTConfig: (config) => {
    set({ sttConfig: config });
    const userId = get().storageUserId;
    try {
      namespacedSet(userId, STT_KEY, JSON.stringify(config));
    } catch { /* ignore */ }
  },

  clearSTTConfig: () => {
    set({ sttConfig: null });
    const userId = get().storageUserId;
    try {
      namespacedRemove(userId, STT_KEY);
    } catch { /* ignore */ }
  },

  setVoice: (uri) => {
    set({ voiceURI: uri });
    const userId = get().storageUserId;
    try {
      if (uri) namespacedSet(userId, VOICE_KEY, uri);
      else namespacedRemove(userId, VOICE_KEY);
    } catch { /* ignore */ }
  },

  setVoiceboxProfile: (id) => {
    set({ voiceboxProfile: id });
    const userId = get().storageUserId;
    try {
      if (id) namespacedSet(userId, VOICEBOX_KEY, id);
      else namespacedRemove(userId, VOICEBOX_KEY);
    } catch { /* ignore */ }
  },

  clearBrain: () => {
    const userId = get().storageUserId;
    try {
      for (const k of [JOURNAL_KEY, PROFILE_KEY, AGENT_NAME_KEY, AI_CONFIG_KEY, AVATAR_KEY, VOICE_KEY, VOICEBOX_KEY, AGENTS_KEY, BRAIN_KEY, STT_KEY, 'umbra-journal', 'umbra-profile', 'umbra-agent-name', 'umbra-named-v1']) {
        namespacedRemove(userId, k);
      }
    } catch {
      // ignore
    }
    set({
      profile: null,
      avatarName: 'Umbra',
      namedMain: false,
      journal: [],
      brainFiles: loadBrainFiles(userId),
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
      const userId = get().storageUserId;
      const next = [...state.agents, full];
      saveAgentsToStore(userId, AGENTS_KEY, next);
      return { agents: next, focusedAgentId: id };
    });
    return full;
  },

  removeAgent: (id) => {
    set((state) => {
      const userId = get().storageUserId;
      const next = state.agents.filter((a) => a.id !== id);
      saveAgentsToStore(userId, AGENTS_KEY, next);
      return {
        agents: next,
        focusedAgentId: state.focusedAgentId === id ? null : state.focusedAgentId,
      };
    });
  },

  updateAgent: (id, patch) => {
    set((state) => {
      const userId = get().storageUserId;
      const next = state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
      saveAgentsToStore(userId, AGENTS_KEY, next);
      return { agents: next };
    });
  },

  setAgentStatus: (id, status) => {
    set((state) => {
      const userId = get().storageUserId;
      const next = state.agents.map((a) => (a.id === id ? { ...a, status } : a));
      saveAgentsToStore(userId, AGENTS_KEY, next);
      return { agents: next };
    });
  },

  focusAgent: (id) => {
    set({ focusedAgentId: id });
  },

  seedTestBrain: () => {
    const userId = get().storageUserId;
    try {
      if (namespacedGet(userId, SEED_KEY)) return;
    } catch {
      return;
    }
    if (get().journal.length > 0) {
      try {
        namespacedSet(userId, SEED_KEY, '1');
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
    saveJournal(userId, seeded);
    try {
      namespacedSet(userId, SEED_KEY, '1');
    } catch {
      // ignore
    }
  },
  };
});
