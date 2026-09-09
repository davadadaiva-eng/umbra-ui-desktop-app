import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isVoiceStudioOnline,
  isVoiceboxOnline,
  localEnginesOnline,
  listLocalVoices,
  setTestProbeStatus,
  resetTestProbeStatus,
  setTestFetchStatus,
  resetTestFetchStatuses,
  VOICESTUDIO_BASE,
  VOICEBOX_BASE,
} from './voiceEngines';

// Placeholder tests for the voice engine detection paths noted in
// description.txt. These are intentionally lightweight: they verify that the
// module exports the expected surface and that offline/mockable detection paths
// can be covered via the test probe status helper.
//
// The production code now has two fetch paths:
//  - desktop IPC path (electron/main.cjs -> Node fetch) when umbraDesktop is
//    present, preferred because it avoids Chromium QUIC/HTTP3 issues noted in
//    description.txt
//  - direct browser fetch fallback for web/dev where IPC is unavailable
//
// These tests cover the shared probe/fetch logic by stubbing the test-status
// seam, so they remain valid regardless of which transport is active.

describe('voiceEngines.ts detection', () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    resetTestProbeStatus();
    resetTestFetchStatuses();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    resetTestProbeStatus();
    resetTestFetchStatuses();
  });

  it('has the documented base URLs', () => {
    expect(VOICESTUDIO_BASE).toBe('http://localhost:3900');
    expect(VOICEBOX_BASE).toBe('http://127.0.0.1:17493');
  });

  it('probes VoiceStudio and Voicebox independently', async () => {
    setTestProbeStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    setTestFetchStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    const studio = await isVoiceStudioOnline(0);
    expect(studio).toBe(true);

    setTestProbeStatus(`${VOICEBOX_BASE}/profiles`, 503);
    setTestFetchStatus(`${VOICEBOX_BASE}/profiles`, 503);
    const box = await isVoiceboxOnline(0);
    expect(box).toBe(false);

    // Placeholder: expand this test once we add a shared fetch mock helper and
    // can exercise the online/offline detection without touching the real local
    // voice engines.
  });

  it('reports combined engine state from both probes', async () => {
    setTestProbeStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    setTestFetchStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    const studioOk = await isVoiceStudioOnline(0);
    expect(studioOk).toBe(true);

    setTestProbeStatus(`${VOICEBOX_BASE}/profiles`, 200);
    setTestFetchStatus(`${VOICEBOX_BASE}/profiles`, 200);
    const boxOk = await isVoiceboxOnline(0);
    expect(boxOk).toBe(true);

    setTestProbeStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    setTestFetchStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 200);
    setTestProbeStatus(`${VOICEBOX_BASE}/profiles`, 200);
    setTestFetchStatus(`${VOICEBOX_BASE}/profiles`, 200);
    const state = await localEnginesOnline(0);

    expect(state.voicestudio).toBe(true);
    expect(state.voicebox).toBe(true);

    // Placeholder: expand this test once we add a shared fetch mock helper and
    // can exercise the combined detection path without touching the real local
    // voice engines.
  });

  it('returns an empty voice list when no engines respond', async () => {
    setTestProbeStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 503);
    setTestFetchStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 503);
    await isVoiceStudioOnline(0);

    setTestProbeStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 503);
    setTestFetchStatus(`${VOICESTUDIO_BASE}/v1/audio/voices`, 503);
    setTestProbeStatus(`${VOICEBOX_BASE}/profiles`, 503);
    setTestFetchStatus(`${VOICEBOX_BASE}/profiles`, 503);
    const result = await listLocalVoices();

    expect(result.voices).toEqual([]);
    expect(result.engines.voicestudio).toBe(false);
    expect(result.engines.voicebox).toBe(false);

    // Placeholder: expand this test once we add a shared fetch mock helper and
    // can exercise the empty-voice-list path without touching the real local
    // voice engines.
  });
});

// Placeholder: expand these once we settle on a shared fetch mock helper so
// the online/offline detection can be covered without touching the real local
// voice engines.
//
// These tests currently rely on a small test seam in voiceEngines.ts
// (setTestProbeStatus / setTestFetchStatus / resetTestProbeStatus /
// resetTestFetchStatuses) so the detection helpers can be covered offline. A
// future follow-up can replace that seam with a shared window.fetch mock once
// we have one in place, and can also add dedicated coverage for the Electron
// IPC path (aiFetch / sttFetch / localVoice*) so we can assert that the
// main-process Node fetch path is wired correctly.
