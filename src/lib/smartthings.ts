/**
 * SmartThings service — modular client for the Samsung SmartThings REST API.
 *
 * Handles:
 *  - GET  {baseUrl}/v1/devices                          → all connected devices (paginated)
 *  - GET  {baseUrl}/v1/devices/{id}/components/main/status → current switch state
 *  - POST {baseUrl}/v1/devices/{deviceId}/commands      → switch capability on/off
 *
 * Authentication uses a Bearer token. In Electron the token lives in the main
 * process environment and requests are proxied through the `umbraDesktop`
 * IPC bridge (api.smartthings.com does not send CORS headers, so the renderer
 * cannot call it directly). Outside Electron we fall back to direct fetch —
 * works in dev via the Vite proxy (`/smartthings` → api.smartthings.com) and
 * natively on React Native.
 */

// ── Types ────────────────────────────────────────────────────────

/** Raw SmartThings device as returned by GET /v1/devices. */
export interface SmartThingsDevice {
  deviceId: string;
  name: string;
  label: string;
  locationId?: string;
  roomId?: string;
  components: Array<{
    id: string;
    label?: string;
    capabilities: Array<{ id: string; version?: number }>;
  }>;
  manufacturerName?: string;
  presentationId?: string;
  deviceNetworkType?: string;
}

/** Normalized device used by the dashboard UI. */
export interface SmartHomeDevice {
  id: string;
  name: string;
  /** Secondary kind derived from capabilities: light | switch | plug | sensor | thermostat | lock | device */
  kind: 'light' | 'switch' | 'plug' | 'sensor' | 'thermostat' | 'lock' | 'device';
  manufacturer: string;
  room: string;
  switchCapable: boolean;
  switchState: 'on' | 'off' | null;
  /** Device is reachable / healthy (health check capability, when present). */
  online: boolean;
}

export type SwitchCommand = 'on' | 'off';

export class SmartThingsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SmartThingsError';
    this.status = status;
  }
}

// ── Transport ────────────────────────────────────────────────────

interface IpcBridge {
  smartthingsFetch?: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: unknown }>;
}

function bridge(): IpcBridge | undefined {
  return (window as unknown as { umbraDesktop?: IpcBridge }).umbraDesktop;
}

export function getSmartThingsBaseUrl(): string {
  return (import.meta.env.VITE_SMARTTHINGS_URL || 'https://api.smartthings.com').replace(/\/+$/, '');
}

export function getSmartThingsToken(): string {
  return (import.meta.env.VITE_SMARTTHINGS_TOKEN || '').trim();
}

export function isSmartThingsConfigured(): boolean {
  return Boolean(getSmartThingsToken()) || Boolean(bridge()?.smartthingsFetch) || import.meta.env.DEV;
}

function authHeaders(): Record<string, string> {
  const token = getSmartThingsToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Core request helper — routes through Electron IPC when available. */
async function stRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const ipc = bridge()?.smartthingsFetch;
  if (ipc) {
    const res = await ipc(method, path, body);
    if (res.status < 200 || res.status >= 300) {
      const msg = typeof res.body === 'object' && res.body !== null && 'message' in res.body
        ? String((res.body as { message: unknown }).message)
        : `SmartThings HTTP ${res.status}`;
      throw new SmartThingsError(msg, res.status);
    }
    return res.body as T;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Outside Electron: in dev, route through the Vite proxy (/smartthings →
    // api.smartthings.com) which injects the Authorization header server-side
    // and sidesteps CORS. In a static build only a same-origin proxy would work.
    const base = import.meta.env.DEV ? '/smartthings' : getSmartThingsBaseUrl();
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok) {
      const msg = typeof parsed === 'object' && parsed !== null && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `SmartThings HTTP ${res.status}`;
      throw new SmartThingsError(msg, res.status);
    }
    return parsed as T;
  } catch (e) {
    if (e instanceof SmartThingsError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new SmartThingsError('SmartThings request timed out', 408);
    throw new SmartThingsError(String((e as Error).message || 'Network error'), 0);
  } finally {
    clearTimeout(timer);
  }
}

// ── Capability helpers ───────────────────────────────────────────

export function hasCapability(device: SmartThingsDevice, capabilityId: string): boolean {
  return device.components.some((c) => c.capabilities.some((cap) => cap.id === capabilityId));
}

function deriveKind(device: SmartThingsDevice): SmartHomeDevice['kind'] {
  const caps = device.components.flatMap((c) => c.capabilities.map((x) => x.id));
  if (caps.includes('colorControl') || (caps.includes('switch') && caps.includes('switchLevel') && (device.label || device.name || '').toLowerCase().includes('light'))) return 'light';
  if (caps.includes('colorControl') || caps.includes('switchLevel')) return 'switch';
  if (caps.includes('outlet') || caps.includes('relaySwitch')) return 'plug';
  if (caps.includes('switch')) return 'switch';
  if (caps.includes('thermostat') || caps.includes('airConditionerMode') || caps.includes('temperatureMeasurement')) return 'thermostat';
  if (caps.includes('lock')) return 'lock';
  if (caps.includes('motionSensor') || caps.includes('contactSensor') || caps.includes('presenceSensor') || caps.includes('waterSensor') || caps.includes('smokeDetector')) return 'sensor';
  return 'device';
}

export function isSwitchCapable(device: SmartThingsDevice): boolean {
  return hasCapability(device, 'switch');
}

/** Standard switch-capability command payload. */
export function switchCommandPayload(command: SwitchCommand) {
  return {
    commands: [
      {
        component: 'main',
        capability: 'switch',
        command, // 'on' | 'off'
        arguments: [],
      },
    ],
  };
}

// ── API operations ───────────────────────────────────────────────

interface DeviceListResponse {
  items: SmartThingsDevice[];
  next?: string;
}

/** Fetch ALL connected devices, following pagination links. */
export async function fetchAllDevices(): Promise<SmartThingsDevice[]> {
  const all: SmartThingsDevice[] = [];
  let path = '/v1/devices?max=200';
  for (let i = 0; i < 10; i++) {
    const page = await stRequest<DeviceListResponse>('GET', path);
    all.push(...(page.items || []));
    if (!page.next) break;
    // `next` is an opaque relative path (e.g. /v1/devices?max=200&page=2)
    path = page.next.startsWith('http') ? page.next.replace(getSmartThingsBaseUrl(), '') : page.next;
  }
  return all;
}

/** Read the current switch state (on/off) of a device's main component. */
export async function fetchSwitchState(deviceId: string): Promise<'on' | 'off' | null> {
  try {
    const status = await stRequest<Record<string, { value?: unknown }>>(
      'GET',
      `/v1/devices/${encodeURIComponent(deviceId)}/components/main/status`,
    );
    const v = status?.switch?.value;
    if (v === 'on' || v === 'off' || v === true || v === false) {
      return v === 'on' || v === true ? 'on' : 'off';
    }
    return null;
  } catch {
    return null;
  }
}

/** Turn a device on/off using the standard switch capability payload. */
export async function sendSwitchCommand(deviceId: string, command: SwitchCommand): Promise<void> {
  await stRequest<unknown>(
    'POST',
    `/v1/devices/${encodeURIComponent(deviceId)}/commands`,
    switchCommandPayload(command),
  );
}

function roomNameFrom(device: SmartThingsDevice, rooms: Map<string, string>): string {
  if (device.roomId && rooms.has(device.roomId)) return rooms.get(device.roomId)!;
  return 'Unassigned';
}

/**
 * Fetch every device, normalize it for the dashboard and enrich switch-capable
 * devices with their live on/off state (batched for speed).
 */
export async function fetchSmartHomeDevices(opts?: { withStates?: boolean }): Promise<SmartHomeDevice[]> {
  const withStates = opts?.withStates !== false;
  const devices = await fetchAllDevices();
  const rooms = new Map<string, string>();
  try {
    const roomsRes = await stRequest<{ items?: Array<{ roomId: string; name?: string }> }>('GET', '/v1/rooms');
    for (const r of roomsRes.items || []) if (r.roomId) rooms.set(r.roomId, r.name || r.roomId);
  } catch { /* rooms are optional */ }

  const normalized: SmartHomeDevice[] = devices.map((d) => ({
    id: d.deviceId,
    name: d.label || d.name || d.deviceId,
    kind: deriveKind(d),
    manufacturer: d.manufacturerName || 'Unknown',
    room: roomNameFrom(d, rooms),
    switchCapable: isSwitchCapable(d),
    switchState: null,
    online: !hasCapability(d, 'healthCheck'),
  }));

  if (withStates) await hydrateStates(normalized);
  return normalized;
}

/** Fill in live on/off state for all switch-capable devices, in batches. */
export async function hydrateStates(devices: SmartHomeDevice[], batchSize = 8): Promise<void> {
  const capable = devices.filter((d) => d.switchCapable);
  for (let i = 0; i < capable.length; i += batchSize) {
    const batch = capable.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((d) => fetchSwitchState(d.id)));
    results.forEach((state, idx) => {
      batch[idx].switchState = state;
    });
  }
}
