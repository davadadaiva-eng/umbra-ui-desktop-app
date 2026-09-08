import { getBackendUrl } from './backend';

type EventName = string;
type EventHandler = (payload: unknown) => void;
type AnyEventHandler = (name: string, payload: unknown) => void;
type SnapshotHandler = (status: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 10000;
let listeners: Map<EventName, Set<EventHandler>> = new Map();
let anyEventListeners: Set<AnyEventHandler> = new Set();
let snapshotHandler: SnapshotHandler | null = null;
let disconnectHandlers: Set<() => void> = new Set();
let connected = false;
let intentionalClose = false;

function onMessage(ev: MessageEvent) {
  try {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (msg.type === 'snapshot' && snapshotHandler) {
      snapshotHandler(msg.status);
    } else if (msg.type === 'event' && msg.name) {
      const handlers = listeners.get(msg.name);
      if (handlers) {
        for (const h of handlers) {
          try { h(msg.payload); } catch { /* listener error */ }
        }
      }
      const wildcard = listeners.get('*');
      if (wildcard) {
        for (const h of wildcard) {
          try { h({ name: msg.name, payload: msg.payload }); } catch { /* listener error */ }
        }
      }
      for (const h of anyEventListeners) {
        try { h(msg.name, msg.payload); } catch { /* listener error */ }
      }
    }
  } catch {
    // ignore parse errors
  }
}

function onClose() {
  connected = false;
  if (!intentionalClose) {
    for (const h of disconnectHandlers) {
      try { h(); } catch { /* listener error */ }
    }
    scheduleReconnect();
  }
}

function onError() {
  // onClose will fire after onerror
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_DELAY);
}

export function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  intentionalClose = false;
  const url = getBackendUrl().replace(/^http/, 'ws') + '/api/ws';
  try {
    ws = new WebSocket(url);
    ws.onmessage = onMessage;
    ws.onclose = onClose;
    ws.onerror = onError;
    ws.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
    };
  } catch {
    scheduleReconnect();
  }
}

export function disconnect() {
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  connected = false;
}

export function isConnected() {
  return connected && ws?.readyState === WebSocket.OPEN;
}

export function onEvent(name: EventName, handler: EventHandler): () => void {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(handler);
  return () => {
    const set = listeners.get(name);
    if (set) {
      set.delete(handler);
      if (set.size === 0) listeners.delete(name);
    }
  };
}

export function onAnyEvent(handler: AnyEventHandler): () => void {
  anyEventListeners.add(handler);
  return () => { anyEventListeners.delete(handler); };
}

/**
 * Resolve with the first event payload that satisfies `predicate` (or resolve
 * `undefined` after `timeoutMs`).
 */
export function waitForEvent<T = unknown>(
  name: string,
  predicate: (payload: unknown) => boolean,
  timeoutMs = 90000
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onEvent(name, (payload) => {
      if (!predicate(payload)) return;
      if (timer) clearTimeout(timer);
      off();
      resolve(payload as T);
    });
    timer = setTimeout(() => {
      off();
      resolve(undefined);
    }, timeoutMs);
  });
}

export interface TaskOutcome {
  ok: boolean;
  /** Text reply for chat dispatches (result.summary/output/result). */
  reply?: string;
  error?: string;
}

function taskPayloadId(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload || undefined;
  if (Array.isArray(payload)) return payload[0] ? String(payload[0]) : undefined;
  if (payload && typeof payload === 'object') {
    const taskId = (payload as { taskId?: unknown }).taskId;
    return taskId ? String(taskId) : undefined;
  }
  return undefined;
}

/**
 * Await the outcome of a dispatched chat/task. The backend broadcasts events
 * with positional args: 1-arg events arrive as a bare string task id, 2-arg
 * events as [taskId, detail]. `task:completed` → [taskId, result] where
 * result = { summary, output, steps }; `task:failed` → [taskId, error].
 * Resolves { ok: false } on failure, or { ok: false, error: 'timeout' } when
 * the task never finishes in time.
 */
export async function waitForTaskOutcome(taskId: string, timeoutMs = 150000): Promise<TaskOutcome> {
  const match = (payload: unknown) => taskPayloadId(payload) === taskId;
  const completed = waitForEvent<unknown>('task:completed', match, timeoutMs);
  const failed = waitForEvent<unknown>('task:failed', match, timeoutMs);
  const cancelled = waitForEvent<unknown>('task:cancelled', match, timeoutMs);
  const winner = await Promise.race([completed, failed, cancelled]);
  if (winner === undefined) return { ok: false, error: 'timeout' };
  // 1-arg events arrive as a bare task id (cancelled); 2-arg events as
  // [taskId, detail] where completed carries a result OBJECT and failed a
  // string error.
  if (Array.isArray(winner) && winner[1] && typeof winner[1] === 'object') {
    const payload = winner[1] as { summary?: unknown; output?: unknown; result?: unknown };
    const text = payload.summary ?? payload.output ?? payload.result;
    return { ok: true, reply: text ? String(text) : 'Done.' };
  }
  const error = Array.isArray(winner) ? String(winner[1] ?? 'failed') : 'cancelled';
  return { ok: false, error };
}

export function onSnapshot(handler: SnapshotHandler): () => void {
  snapshotHandler = handler;
  return () => { if (snapshotHandler === handler) snapshotHandler = null; };
}

/** Called when the socket drops unexpectedly (reconnect will follow). */
export function onDisconnect(handler: () => void): () => void {
  disconnectHandlers.add(handler);
  return () => { disconnectHandlers.delete(handler); };
}

export function removeAllListeners() {
  listeners.clear();
  anyEventListeners.clear();
  snapshotHandler = null;
}
