import { isVoiceStudioOnline, isVoiceboxOnline } from './voiceEngines';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8787';

let lastHealthCheck = 0;
let lastHealthResult = false;
const HEALTH_CACHE_MS = 5000;

export function getBackendUrl(): string {
  return BACKEND_URL;
}

export async function isBackendAvailable(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CACHE_MS) return lastHealthResult;
  // /api/health aggregates full status on this backend and can take ~10s
  // when the machine is busy — probe with a generous timeout.
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(20000) });
    lastHealthResult = res.ok;
  } catch {
    lastHealthResult = false;
  }
  lastHealthCheck = now;
  return lastHealthResult;
}

export class BackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
  }
}

export async function backendFetch<T = unknown>(path: string, opts?: RequestInit & { timeout?: number }): Promise<T> {
  const { timeout = 60000, ...init } = opts ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = typeof body === 'object' && body !== null && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
      throw new BackendError(msg, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof BackendError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new BackendError('Backend timeout', 408);
    throw new BackendError(String((e as Error).message || 'Network error'), 0);
  } finally {
    clearTimeout(timer);
  }
}

// ── Status ──────────────────────────────────────────────────────
export interface BackendStatus {
  initialized: boolean;
  uptimeMs: number;
  consent: { granted: boolean; denied: boolean; askOncePerSession: boolean; emergencyStopArmed: boolean };
  desktop2: {
    isRunning: boolean; displayId: number; browserPid: number; startedAt: string;
    taskCount: number; uptimeMs: number; tabs: number; activeTabId: string;
    pageTitle: string; pageUrl: string;
  };
  streamer: { active: boolean; clients: number; fps: number; port: number };
  agentDesktop: { open: boolean };
  agent: { activeTasks: number };
  swarm: Record<string, unknown>;
  models: { provider?: string; fast: string; vision: string; reasoning: string };
  voiceStack?: Record<string, unknown> | null;
  pushToTalk?: Record<string, unknown>;
  chromeExtension?: Record<string, unknown>;
}

export const getHealth = () => backendFetch<{ ok: boolean; uptimeMs: number }>('/api/health');
export const getStatus = () => backendFetch<BackendStatus>('/api/status');

// ── Chat ────────────────────────────────────────────────────────
// The backend treats chat as a task dispatch: POST /api/chat returns
// { dispatch: { taskId, target } } and the reply arrives asynchronously
// on the WebSocket as a `task:completed` event with payload
// [taskId, { summary, output, steps, totalTimeMs }].
export interface ChatDispatch {
  taskId: string;
  target: string;
}

export interface ChatResponse {
  dispatch: ChatDispatch;
}

export const chat = (message: string, target?: string) =>
  backendFetch<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, ...(target ? { target } : {}) }),
  });

// ── Tasks ───────────────────────────────────────────────────────
export interface TaskStep {
  description: string;
  action: string;
  params: Record<string, unknown>;
  result: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Task {
  id: string;
  description: string;
  priority: number;
  status: 'pending' | 'planning' | 'executing' | 'healing' | 'completed' | 'failed' | 'cancelled';
  steps: TaskStep[];
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const submitTask = (description: string, priority?: number) =>
  backendFetch<{ taskId: string }>('/api/task', {
    method: 'POST',
    body: JSON.stringify({ description, ...(priority !== undefined ? { priority } : {}) }),
  });

export const getTask = async (id: string) => {
  const res = await backendFetch<{ task: Task }>(`/api/task/${id}`);
  return res.task;
};

export const getActiveTasks = () => backendFetch<{ tasks: Task[] }>('/api/tasks');

export const cancelTask = (id: string) =>
  backendFetch<{ cancelled: string }>(`/api/task/${id}/cancel`, { method: 'POST' });

export const retryTask = (id: string, description?: string) =>
  backendFetch<{ taskId: string }>(`/api/task/${id}/retry`, {
    method: 'POST',
    body: JSON.stringify({ ...(description !== undefined ? { description } : {}) }),
  });

// ── Desktop 2 ───────────────────────────────────────────────────
export const executeDesktop2 = async (action: string, params: Record<string, unknown> = {}) => {
  const res = await backendFetch<{ result: string }>('/api/desktop2/action', {
    method: 'POST',
    body: JSON.stringify({ action, params }),
  });
  return res.result;
};

// ── Consent ─────────────────────────────────────────────────────
export interface ConsentState {
  granted: boolean;
  denied: boolean;
  askOncePerSession: boolean;
  emergencyStopArmed: boolean;
}

export const getConsent = () => backendFetch<ConsentState>('/api/consent');

export const requestConsent = (reason: string) =>
  backendFetch<{ result: string }>('/api/consent', {
    method: 'POST',
    body: JSON.stringify({ action: 'request', reason }),
  });

export const armEmergencyStop = () =>
  backendFetch<void>('/api/consent', { method: 'POST', body: JSON.stringify({ action: 'arm' }) });

export const disarmEmergencyStop = () =>
  backendFetch<void>('/api/consent', { method: 'POST', body: JSON.stringify({ action: 'disarm' }) });

// ── Knowledge / Recall ──────────────────────────────────────────
export interface KnowledgeResult {
  id: string;
  name: string;
  kind: string;
  snippet: string;
  score: number;
}

// ── Audit vault ─────────────────────────────────────────────────
// GET /api/vault/stats returns { vault: {...} }; the views read the inner object.
export const getAuditStats = async () => {
  const res = await backendFetch<{ vault: Record<string, unknown> }>('/api/vault/stats');
  return res.vault;
};

export const searchKnowledge = (q: string) =>
  backendFetch<{ results: KnowledgeResult[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}`);

// ── Memory ──────────────────────────────────────────────────────
export const recallMemory = (query: string) =>
  backendFetch<{ results: unknown[] }>(`/api/memory/recall?q=${encodeURIComponent(query)}`);

export const rememberMemory = (text: string) =>
  backendFetch<{ ok: boolean }>('/api/memory/remember', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

// ── Macros / Sessions / Privacy / Activity ──────────────────────
export const getMacros = () => backendFetch<{ macros: unknown[] }>('/api/macros');
export const getSessions = () => backendFetch<{ sessions: unknown[] }>('/api/sessions');
export const getPrivacyStats = () => backendFetch<Record<string, unknown>>('/api/privacy/stats');
export const getActivitySummary = () => backendFetch<Record<string, unknown>>('/api/activity/summary');

// ── Swarm / Vault ───────────────────────────────────────────────
export const getSwarmStatus = () => backendFetch<Record<string, unknown>>('/api/swarm');

// ── MCP Connectors ──────────────────────────────────────────────
export interface McpConnector {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  connected: boolean;
  tools?: number;
  error?: string;
}

export interface McpCatalogEntry {
  id: string;
  name: string;
  category: string;
  baseUrl: string;
  authType: 'bearer' | 'apiKey' | 'oauth' | 'none';
  apiKeyHeader: string;
  credentialKey: string;
  enabled: boolean;
  connected: boolean;
  registered: boolean;
  apiKeyConfigured: boolean;
}

export interface McpCatalogResponse {
  entries: McpCatalogEntry[];
  total: number;
  count: number;
  categories: string[];
}

// GET /api/mcp/connectors returns the enabled-filtered catalog object, not an array.
export const getMcpConnectors = async () => {
  const res = await backendFetch<{ connectors: { entries: McpConnector[] } }>('/api/mcp/connectors');
  return { connectors: res.connectors.entries };
};

export const getMcpCatalog = async (opts?: { q?: string; category?: string; enabled?: boolean; limit?: number; offset?: number }): Promise<McpCatalogResponse> => {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.enabled !== undefined) params.set('enabled', String(opts.enabled));
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  // Catalog can be slow with 1000+ entries (esp. right after a registry
  // sync) — use a long timeout so paging through it doesn't get aborted.
  const raw = await backendFetch<Record<string, unknown>>(`/api/mcp/catalog${qs ? `?${qs}` : ''}`, { timeout: 120000 });
  const cat = (raw.catalog ?? raw) as Record<string, unknown>;
  return {
    entries: (cat.entries ?? []) as McpCatalogEntry[],
    total: (cat.total ?? 0) as number,
    count: (cat.count ?? 0) as number,
    categories: (cat.categories ?? []) as string[],
  };
};// POST /api/mcp/connect returns { connector: { connector, registered } }.
export const connectMcp = async (id: string, opts?: { baseUrl?: string; apiKey?: string; enabled?: boolean }) => {
  const res = await backendFetch<{ connector: { connector: unknown; registered: boolean } }>('/api/mcp/connect', {
    method: 'POST',
    body: JSON.stringify({ id, enabled: true, ...opts }),
  });
  return { connector: res.connector.connector, registered: res.connector.registered };
};

export const disconnectMcp = async (id: string) => {
  const res = await backendFetch<{ connector: { connected: boolean } }>('/api/mcp/disconnect', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  return { connected: res.connector.connected };
};

export const mcpOauthStart = async (id: string) => {
  const res = await backendFetch<{ oauth: { authorizeUrl: string; state: string } }>('/api/mcp/oauth/start', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  return { authorizeUrl: res.oauth.authorizeUrl, state: res.oauth.state };
};

export const mcpOauthStatus = async (id: string) => {
  const res = await backendFetch<{ oauth: { connected: boolean; expired: boolean; hasRefreshToken: boolean } }>(
    `/api/mcp/oauth/status?id=${encodeURIComponent(id)}`
  );
  return res.oauth;
};

// Registry sync pulls servers from Smithery + the official MCP registry over
// the network and can take minutes — use a long timeout so it isn't aborted.
export const mcpSyncRegistry = async () => {
  const res = await backendFetch<{ sync: unknown }>('/api/mcp/sync', { method: 'POST', timeout: 240000 });
  return { sync: res.sync };
};

export const mcpImportRegistry = (maxPerSource?: number) =>
  backendFetch<{ result: unknown }>('/api/mcp/import-registry', {
    method: 'POST',
    body: JSON.stringify({ ...(maxPerSource !== undefined ? { maxPerSource } : {}) }),
  });

export const mcpRefreshOauth = (id: string) =>
  backendFetch<{ oauth: unknown }>('/api/mcp/oauth/refresh', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });

// ── LLM Config ──────────────────────────────────────────────────
export const getModelStatus = () => backendFetch<Record<string, unknown>>('/api/llm/models');

export const getProviderConfig = () => backendFetch<Record<string, unknown>>('/api/config/provider');

export const configureProvider = (patch: { provider?: string; endpoint?: string; apiKey?: string; models?: Record<string, string>; tier?: string }) =>
  backendFetch<unknown>('/api/config/provider', {
    method: 'POST',
    body: JSON.stringify(patch),
  });

export const testLlm = () => backendFetch<unknown>('/api/llm/test', { method: 'POST' });

// ── Plan / Usage ────────────────────────────────────────────────
// The backend reads `tenant` (not tenantId) in both endpoints.
export const getPlanUsage = (tenantId?: string) =>
  backendFetch<Record<string, unknown>>(`/api/plan/usage${tenantId ? `?tenant=${encodeURIComponent(tenantId)}` : ''}`);

export const activatePlan = (tier: string, tenantId?: string) =>
  backendFetch<unknown>('/api/plan/activate', {
    method: 'POST',
    body: JSON.stringify({ tier, ...(tenantId !== undefined ? { tenant: tenantId } : {}) }),
  });

// ── Voice ───────────────────────────────────────────────────────
// The backend's GET /api/voice/status returns { enabled, provider, model, asr, health }
// where health is a VoiceStackHealthReport { ok, components: [{ component, configured, ok, status }] }.
// Map it onto the shape the UI expects so callers keep working unchanged.
export interface VoiceStatus {
  stt: { online: boolean; provider: string; model: string };
  tts: { online: boolean; provider: string; engine: string };
  voicebox: { online: boolean };
  voiceStudio: { online: boolean };
}

type VoiceHealthComponent = { component: string; configured: boolean; ok: boolean; status: string };

export const getVoiceStatus = async () => {
  const raw = await backendFetch<{
    enabled?: boolean;
    provider?: string;
    model?: string;
    asr?: { provider?: string; url?: string; model?: string; ok?: boolean };
    health?: { ok: boolean; components: VoiceHealthComponent[] } | null;
  }>('/api/voice/status');
  const comp = (name: string) => raw.health?.components?.find((c) => c.component === name);
  const sttProvider = raw.provider ?? 'none';
  const sttOnline = Boolean(raw.enabled && sttProvider && sttProvider !== 'none');
  const ttsComp = comp('tts');
  const ttsOnline = Boolean(ttsComp && ttsComp.configured && ttsComp.ok);
  // VoiceStudio (port 3900) and voicebox (port 17493) are LOCAL apps that run
  // next to the frontend — the backend cannot see them, so probing its `asr`
  // component (the meeting diarization server) told the wrong story. Probe
  // them directly instead.
  const [voiceStudioOnline, voiceboxOnline] = await Promise.all([
    isVoiceStudioOnline(1500).catch(() => false),
    isVoiceboxOnline(1500).catch(() => false),
  ]);
  return {
    stt: { online: sttOnline, provider: sttProvider, model: raw.model ?? '' },
    tts: { online: ttsOnline, provider: ttsComp?.status ?? 'unknown', engine: ttsComp?.status ?? 'unknown' },
    voicebox: { online: voiceboxOnline },
    voiceStudio: { online: voiceStudioOnline },
  } satisfies VoiceStatus;
};

export const getVoiceHealth = (refresh = false) =>
  backendFetch<Record<string, unknown>>(`/api/voice/health${refresh ? '?refresh=1' : ''}`);

export const transcribeAudioBackend = async (audioBase64: string, opts?: { format?: string; language?: string }) => {
  const res = await backendFetch<{ transcription: { text: string } }>('/api/voice/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64, ...opts }),
  });
  return { text: res.transcription.text };
};

export const speakTextBackend = (text: string, opts?: { voice?: string; language?: string; provider?: string; engine?: string }) =>
  backendFetch<{ result?: string; voice?: string; language?: string; path?: string }>('/api/voice/speak', {
    method: 'POST',
    body: JSON.stringify({ text, ...opts }),
  });

export const listTtsVoices = () => backendFetch<{ voices: unknown[] }>('/api/voice/tts/voices');

// POST /api/voice/command returns { command: { text, dispatch, spoke } }.
export const voiceCommand = (audioBase64: string, opts?: { format?: string; language?: string; target?: string }) =>
  backendFetch<{ command: { text: string; dispatch?: { taskId?: string; target?: string }; spoke?: boolean } }>('/api/voice/command', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64, ...opts }),
  });

// ── Screen ──────────────────────────────────────────────────────
export const screenState = () => backendFetch<Record<string, unknown>>('/api/screen/state');
export const screenLive = () => backendFetch<Record<string, unknown>>('/api/screen/live');
export const screenWatch = (enabled: boolean) =>
  backendFetch<void>('/api/screen/watch', { method: 'POST', body: JSON.stringify({ enabled }) });
export const screenAsk = (question: string, intent?: string) =>
  backendFetch<{ answer: string }>('/api/screen/ask', {
    method: 'POST',
    body: JSON.stringify({ question, ...(intent ? { intent } : {}) }),
  });

// ── Meetings ────────────────────────────────────────────────────
export interface Meeting {
  id: string;
  url: string;
  title: string;
  platform: string;
  status: string;
  startedAt: string;
  transcript: { who: string; text: string; ts: number }[];
}

export const getMeetings = () => backendFetch<{ meetings: Meeting[] }>('/api/meetings');
export const getMeeting = async (id: string) => {
  const res = await backendFetch<{ meeting: Meeting }>(`/api/meetings/${id}`);
  return res.meeting;
};

export const meetingJoin = async (url: string, opts?: { title?: string; topics?: string[] }) => {
  const res = await backendFetch<{ meeting: { id: string } }>('/api/meeting/join', {
    method: 'POST',
    body: JSON.stringify({ url, ...opts }),
  });
  return { meetingId: res.meeting.id };
};

export const meetingLeave = () => backendFetch<void>('/api/meeting/leave', { method: 'POST' });
export const meetingStatus = () => backendFetch<Record<string, unknown>>('/api/meeting/status');

export const meetingExecute = (action: string, params: Record<string, unknown> = {}) =>
  backendFetch<unknown>('/api/meeting/action', {
    method: 'POST',
    body: JSON.stringify({ action, params }),
  });

export const meetingMute = (muted: boolean) => meetingExecute('mute', { muted });
export const meetingRaiseHand = (raised: boolean) => meetingExecute('raiseHand', { raised });
export const meetingChat = (message: string) => meetingExecute('chat', { message });
export const meetingSpeak = (text: string) => meetingExecute('speak', { text });

export const meetingListen = () =>
  backendFetch<unknown>('/api/meeting/listen', { method: 'POST' });

export const meetingFeedAudio = (audioBase64: string, format?: string) =>
  backendFetch<{ segment: unknown }>('/api/meeting/audio', {
    method: 'POST',
    body: JSON.stringify({ audio: audioBase64, ...(format !== undefined ? { format } : {}) }),
  });

export const meetingShare = (target?: string) =>
  backendFetch<{ result: unknown }>('/api/meeting/share', {
    method: 'POST',
    body: JSON.stringify({ ...(target !== undefined ? { target } : {}) }),
  });

export const meetingStopShare = () =>
  backendFetch<{ result: unknown }>('/api/meeting/stop-share', { method: 'POST' });

export const meetingOrders = () =>
  backendFetch<unknown>('/api/meeting/orders');

export const meetingSpeakDirect = (text: string, opts?: { voice?: string; language?: string }) =>
  backendFetch<{ result: unknown }>('/api/meeting/speak', {
    method: 'POST',
    body: JSON.stringify({ text, ...opts }),
  });

export const meetingRaiseHandDirect = (raised: boolean) =>
  backendFetch<{ result: unknown }>('/api/meeting/raise-hand', {
    method: 'POST',
    body: JSON.stringify({ raised }),
  });

export const meetingChatMessage = (message: string) =>
  backendFetch<{ result: unknown }>('/api/meeting/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

// ── Telco ───────────────────────────────────────────────────────
export const getTelcoStatus = () => backendFetch<Record<string, unknown>>('/api/telco/status');
export const sendSms = (to: string, text: string) =>
  backendFetch<{ result: string }>('/api/telco/sms', { method: 'POST', body: JSON.stringify({ to, text }) });

export const configureTelco = (patch: { apiKey?: string; fromNumber?: string; messagingProfileId?: string; enabled?: boolean }) =>
  backendFetch<{ telco: unknown }>('/api/telco/configure', {
    method: 'POST',
    body: JSON.stringify(patch),
  });

export const telcoCall = (to: string, from?: string, connectionUrl?: string) =>
  backendFetch<{ result: unknown }>('/api/telco/call', {
    method: 'POST',
    body: JSON.stringify({ to, ...(from !== undefined ? { from } : {}), ...(connectionUrl !== undefined ? { connectionUrl } : {}) }),
  });

// ── Docker ──────────────────────────────────────────────────────
export const listDockerContainers = () => backendFetch<{ containers: unknown[] }>('/api/docker/list');

export const dockerRun = (spec: { name: string; image: string; command?: string[]; env?: Record<string, string>; memoryLimitMb?: number; cpuQuotaPct?: number }) =>
  backendFetch<{ container: unknown }>('/api/docker/run', {
    method: 'POST',
    body: JSON.stringify(spec),
  });

export const dockerStop = (name: string) =>
  backendFetch<{ stopped: unknown }>('/api/docker/stop', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const dockerRemove = (name: string) =>
  backendFetch<{ removed: unknown }>('/api/docker/remove', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

// ── Journal ─────────────────────────────────────────────────────
export const generateJournal = () =>
  backendFetch<{ journal: Record<string, unknown> }>('/api/journal/generate', { method: 'POST' });

// ── Image generation ────────────────────────────────────────────
// POST /api/image/generate returns { image: { imagePath, provider, model, bytes, width, height } }.
export interface GeneratedImageInfo {
  imagePath: string;
  provider: string;
  model: string;
  bytes: number;
  width?: number;
  height?: number;
}

export const generateImage = async (prompt: string, opts?: { width?: number; height?: number; steps?: number }) => {
  const res = await backendFetch<{ image: GeneratedImageInfo }>('/api/image/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt, ...opts }),
  });
  return { image: res.image };
};

// ── Shutdown ────────────────────────────────────────────────────
export const shutdownBackend = () => backendFetch<{ ok: boolean }>('/api/shutdown', { method: 'POST' });

// ── System Status ───────────────────────────────────────────────
export const getSystemStatus = () => backendFetch<Record<string, unknown>>('/api/status', { timeout: 5000 });

// ── Device Mesh ─────────────────────────────────────────────────
export const getDevices = () => backendFetch<{ devices: Array<{ id: string; name: string; type: string; online: boolean; lastSeen?: string }> }>('/api/devices');
export const deviceInvite = async () => {
  const res = await backendFetch<{ invite: { code: string; expiresAt?: number; joinUrl?: string } }>('/api/devices/invite', { method: 'POST' });
  return { code: res.invite.code };
};
export const deviceSend = async (deviceId: string, message: string) => {
  const res = await backendFetch<{ sent: unknown }>('/api/devices/send', { method: 'POST', body: JSON.stringify({ deviceId, msg: { text: message } }) });
  return { ok: Boolean(res.sent) };
};

export const deviceJoin = (code: string, opts?: { name?: string; role?: string; capabilities?: string[] }) =>
  backendFetch<{ join: unknown }>('/api/devices/join', {
    method: 'POST',
    body: JSON.stringify({ code, ...opts }),
  });

export const deviceRevoke = (deviceId: string) =>
  backendFetch<{ revoked: unknown }>('/api/devices/revoke', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });

// ── Chrome Extension ────────────────────────────────────────────
export const getChromeStatus = () => backendFetch<Record<string, unknown>>('/api/chrome/status');
export const getChromeLogins = () => backendFetch<{ logins: unknown[] }>('/api/chrome/logins');

export const approveChromeLogin = (url: string, provider: string, username?: string) =>
  backendFetch<{ approved: unknown }>('/api/chrome/logins/approve', {
    method: 'POST',
    body: JSON.stringify({ url, provider, ...(username !== undefined ? { username } : {}) }),
  });

export const getChromeCookies = (domain?: string) =>
  backendFetch<{ cookies: unknown[] }>(`/api/chrome/cookies${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`);

export const getChromeSites = () =>
  backendFetch<{ sites: unknown[] }>('/api/chrome/sites');

// ── Social ──────────────────────────────────────────────────────
export const socialPost = (platform: string, content: string) =>
  backendFetch<{ ok: boolean }>('/api/social/post', { method: 'POST', body: JSON.stringify({ platform, content }) });
// GET /api/social/status returns { social: {...} }; callers read the inner object.
export const socialStatus = async () => {
  const res = await backendFetch<{ social: Record<string, unknown> }>('/api/social/status');
  return res.social;
};

export const socialPostFull = (opts: { platform: string; action: string; email: string; password: string; text?: string; comment_text?: string; query?: string; media_files?: string[]; video_path?: string; title?: string; description?: string; max_comments?: number; max_results?: number; headless?: boolean }) =>
  backendFetch<{ result: unknown }>('/api/social/post', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

export const socialSchedule = (opts: { platform: string; action: string; email: string; password: string; text?: string; video_path?: string; title?: string; description?: string; scheduledAt: number }) =>
  backendFetch<{ scheduled: unknown }>('/api/social/schedule', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

export const getSocialSchedule = () =>
  backendFetch<{ scheduled: unknown[] }>('/api/social/schedule');

export const cancelSocialSchedule = (id: string) =>
  backendFetch<{ cancelled: unknown }>('/api/social/cancel', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });

// ── Ghost Desktop ───────────────────────────────────────────────
export const executeGhost = (action: string, params?: Record<string, unknown>) =>
  backendFetch<{ result: string }>('/api/ghost/action', {
    method: 'POST',
    body: JSON.stringify({ action, ...(params !== undefined ? { params } : {}) }),
  });

export const getGhostCapture = () =>
  backendFetch<{ image: string | null }>('/api/ghost/capture');

// ── Audio ───────────────────────────────────────────────────────
// The backend returns { audio: { available, devices: [{ id, name, flow }] } }.
// The UI expects devices grouped by flow ({ render, capture }), so unwrap and
// group here — without this the device pickers never rendered anything.
export interface AudioDeviceInfo {
  id: string;
  name: string;
  flow: 'render' | 'capture';
  isDefault?: boolean;
}

export interface AudioDeviceGroups {
  render: AudioDeviceInfo[];
  capture: AudioDeviceInfo[];
}

export const listAudioDevices = async (): Promise<AudioDeviceGroups> => {
  const res = await backendFetch<{ audio?: { available?: boolean; devices?: AudioDeviceInfo[] } }>('/api/audio/devices');
  const devices = res.audio?.devices ?? [];
  return {
    render: devices.filter((d) => d.flow !== 'capture'),
    capture: devices.filter((d) => d.flow === 'capture'),
  };
};

export const setAudioDefault = (flow: 'render' | 'capture', deviceId: string) =>
  backendFetch<unknown>('/api/audio/set-default', {
    method: 'POST',
    body: JSON.stringify({ flow, deviceId }),
  });

export const startLoopback = (seconds?: number) =>
  backendFetch<{ recording: unknown }>('/api/audio/loopback/start', {
    method: 'POST',
    body: JSON.stringify({ ...(seconds !== undefined ? { seconds } : {}) }),
  });

export const stopLoopback = (id: string) =>
  backendFetch<{ recording: unknown }>('/api/audio/loopback/stop', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });

export const listRecordings = () =>
  backendFetch<{ recordings: unknown[] }>('/api/audio/recordings');

// ── Billing ─────────────────────────────────────────────────────
export const billingCheckout = (tier: string, tenantId?: string) =>
  backendFetch<{ checkout: { url: string } }>(`/api/billing/checkout?tier=${encodeURIComponent(tier)}${tenantId ? `&tenant=${encodeURIComponent(tenantId)}` : ''}`);

// ── Tenants ─────────────────────────────────────────────────────
export const getTenants = () =>
  backendFetch<{ tenants: unknown[] }>('/api/tenants');

export const registerTenant = (id: string, name?: string, tier?: string) =>
  backendFetch<{ tenant: unknown }>('/api/tenants/register', {
    method: 'POST',
    body: JSON.stringify({ id, ...(name !== undefined ? { name } : {}), ...(tier !== undefined ? { tier } : {}) }),
  });

export const activateTenant = (id: string, tier: string) =>
  backendFetch<{ tenant: unknown }>('/api/tenants/activate', {
    method: 'POST',
    body: JSON.stringify({ id, tier }),
  });

export const disableTenant = (id: string) =>
  backendFetch<{ tenant: unknown }>('/api/tenants/disable', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });

// ── Mesh (P2P) ──────────────────────────────────────────────────
export const getMeshStatus = () =>
  backendFetch<unknown>('/api/mesh/status');

export const meshPair = (ttl?: number) =>
  backendFetch<{ pair: unknown }>('/api/mesh/pair', {
    method: 'POST',
    body: JSON.stringify({ ...(ttl !== undefined ? { ttl } : {}) }),
  });

export const meshPairDemo = () =>
  backendFetch<{ pair: unknown }>('/api/mesh/pair-demo', { method: 'POST' });

export const meshRevoke = (deviceId: string) =>
  backendFetch<{ revoked: unknown }>('/api/mesh/revoke', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });

// ── Connectors ──────────────────────────────────────────────────
export const getConnectors = () =>
  backendFetch<{ connectors: unknown[] }>('/api/connectors');

export const disconnectConnector = (connectorId: string) =>
  backendFetch<{ disconnected: boolean }>('/api/connectors/disconnect', {
    method: 'POST',
    body: JSON.stringify({ connectorId }),
  });

// ── Carrusel ────────────────────────────────────────────────────
export const carruselStart = () =>
  backendFetch<{ status: unknown }>('/api/carrusel/start', { method: 'POST' });

export const carruselStop = () =>
  backendFetch<{ status: unknown }>('/api/carrusel/stop', { method: 'POST' });

export const carruselStatus = () =>
  backendFetch<{ status: unknown }>('/api/carrusel/status');

export const carruselCreate = (name: string, aspectRatio?: string) =>
  backendFetch<{ carousel: unknown }>('/api/carrusel/create', {
    method: 'POST',
    body: JSON.stringify({ name, ...(aspectRatio !== undefined ? { aspectRatio } : {}) }),
  });

export const carruselList = () =>
  backendFetch<{ carousels: unknown[] }>('/api/carrusel/list');

export const carruselGet = (id: string) =>
  backendFetch<{ carousel: unknown }>(`/api/carrusel/${id}`);

export const carruselAddSlide = (carouselId: string, html: string, note?: string) =>
  backendFetch<{ slide: unknown }>(`/api/carrusel/${carouselId}/slides`, {
    method: 'POST',
    body: JSON.stringify({ html, ...(note !== undefined ? { note } : {}) }),
  });

export const carruselChat = (message: string, carouselId?: string) =>
  backendFetch<{ response: unknown }>('/api/carrusel/chat', {
    method: 'POST',
    body: JSON.stringify({ message, ...(carouselId !== undefined ? { carouselId } : {}) }),
  });

export const carruselExport = (id: string) =>
  backendFetch<{ zipBase64: string; carouselId: string }>(`/api/carrusel/${id}/export`, { method: 'POST' });

export const carruselDelete = (id: string) =>
  backendFetch<{ deleted: unknown }>(`/api/carrusel/${id}`, { method: 'DELETE' });

export const carruselBrand = () =>
  backendFetch<{ brand: unknown }>('/api/carrusel/brand');

export const carruselDuplicate = (id: string) =>
  backendFetch<{ carousel: unknown }>(`/api/carrusel/${id}/duplicate`, { method: 'POST' });

// ── Twenty CRM ──────────────────────────────────────────────────
export const twentyStart = () =>
  backendFetch<{ status: unknown }>('/api/twenty/start', { method: 'POST' });

export const twentyStop = () =>
  backendFetch<{ status: unknown }>('/api/twenty/stop', { method: 'POST' });

export const twentyStatus = () =>
  backendFetch<{ status: unknown }>('/api/twenty/status');

export const twentyGraphql = (query: string, variables?: Record<string, unknown>) =>
  backendFetch<{ result: unknown }>('/api/twenty/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, ...(variables !== undefined ? { variables } : {}) }),
  });

// ── Agent Delegation ────────────────────────────────────────────
export const delegateAgent = (description: string, opts?: { provider?: string; model?: string; timeoutMs?: number }) =>
  backendFetch<{ output: unknown }>('/api/agent/delegate', {
    method: 'POST',
    body: JSON.stringify({ description, ...opts }),
  });

// ── Skills ──────────────────────────────────────────────────────
export const compileHotSkills = (threshold?: number) =>
  backendFetch<{ compiled: unknown }>('/api/skills/compile-hot', {
    method: 'POST',
    body: JSON.stringify({ ...(threshold !== undefined ? { threshold } : {}) }),
  });

// ── Task Queue ──────────────────────────────────────────────────
// POST /api/task-queue/import returns { sync: { imported, resumed } }.
export const exportTaskQueue = () =>
  backendFetch<{ files: Record<string, string> }>('/api/task-queue/export');

export const importTaskQueue = async (files: Record<string, string>) => {
  const res = await backendFetch<{ sync: { imported: number; resumed: number } }>('/api/task-queue/import', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
  return { imported: res.sync.imported, resumed: res.sync.resumed };
};

// ── Repos ───────────────────────────────────────────────────────
export const getRepos = () =>
  backendFetch<{ repos: unknown[] }>('/api/repos');

// ── OpenMontage ─────────────────────────────────────────────────
export const getOpenMontageTools = () =>
  backendFetch<{ openmontage: unknown[] }>('/api/openmontage/tools');

// ── Auth (Web App) ──────────────────────────────────────────────
export const authSignup = (email: string, password: string, name: string) =>
  backendFetch<{ user: unknown }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });

export const authLogin = (email: string, password: string) =>
  backendFetch<{ user: unknown }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const authLoginKey = (apiKey: string) =>
  backendFetch<{ user: unknown }>('/api/auth/login-key', {
    method: 'POST',
    body: JSON.stringify({ key: apiKey }),
  });

export const authMe = (apiKey: string) =>
  backendFetch<{ user: unknown }>(`/api/auth/me?key=${encodeURIComponent(apiKey)}`);

export const authDevices = (apiKey: string) =>
  backendFetch<{ devices: unknown[] }>(`/api/auth/devices?key=${encodeURIComponent(apiKey)}`);

export const authPairDevice = (apiKey: string, name: string, type: string) =>
  backendFetch<{ device: unknown }>('/api/auth/devices/pair', {
    method: 'POST',
    body: JSON.stringify({ key: apiKey, name, type }),
  });

export const authRemoveDevice = (apiKey: string, deviceId: string) =>
  backendFetch<{ removed: unknown }>(`/api/auth/devices/${deviceId}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' });

export const authPlan = (apiKey: string) =>
  backendFetch<{ plan: unknown }>(`/api/auth/plan?key=${encodeURIComponent(apiKey)}`);
