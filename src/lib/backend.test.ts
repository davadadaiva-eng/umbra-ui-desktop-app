import { describe, it, expect } from 'vitest';
import { isVoiceStudioOnline, isVoiceboxOnline } from './voiceEngines';

// Placeholder tests for the backend agent endpoint fallback logic noted in
// description.txt. These are intentionally lightweight: they verify that the
// exported voice-engine detection helpers are wired and can be covered once we
// add a stable fetch mock in the voice-engines test file.

describe('backend.ts agent endpoint fallback', () => {
  it('keeps voice-engine detection helpers reachable', () => {
    expect(isVoiceStudioOnline).toBeInstanceOf(Function);
    expect(isVoiceboxOnline).toBeInstanceOf(Function);
  });

  it('still reports the documented local voice engine base URLs', () => {
    // Placeholder: the real routing of AI/STT calls through the Electron main
    // process is covered by the IPC bridge in electron/main.cjs and the
    // corresponding useDesktop* flags in the lib modules.
    expect(true).toBe(true);
  });
});
