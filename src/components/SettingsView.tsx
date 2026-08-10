import { useRef, useEffect, useState, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { AI_PROVIDERS, providerById, testAI, DEFAULT_AI, type AIConfig } from '../lib/ai';
import { STT_PROVIDERS, sttProviderById, transcribeAudio, silentWavBlob, type STTConfig } from '../lib/stt';
import { VoicePicker } from './VoicePicker';
import { Eye, EyeOff, Mic, Smartphone, Settings as SettingsIcon, Cpu, CheckCircle2, XCircle, Loader2, Trash2, Volume2, ArrowRight, AudioLines } from 'lucide-react';

const accentColors = ['#3B82F6', '#60A5FA', '#B600A8', '#7621B0', '#BE4C00', '#0E7C7B'];

const settingGroups: { id: string; label: string; icon: string; items: { id: string; label: string; value: string }[] }[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'eye',
    items: [
      { id: 'accent', label: 'Accent Color', value: '' },
      { id: 'theme', label: 'Theme', value: 'Noir' },
      { id: 'density', label: 'Density', value: 'Comfortable' },
    ],
  },
  {
    id: 'voice',
    label: 'Voice & Input',
    icon: 'mic',
    items: [
      { id: 'language', label: 'Primary Language', value: 'Italian (IT)' },
      { id: 'threshold', label: 'Activation Threshold', value: 'Medium' },
      { id: 'history', label: 'Command History', value: 'Enabled' },
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: 'smartphone',
    items: [
      { id: 'autoconnect', label: 'Auto-connect', value: 'On' },
      { id: 'sync', label: 'File Sync', value: 'Wi-Fi only' },
      { id: 'backup', label: 'Cloud Backup', value: 'Daily' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'settings',
    items: [
      { id: 'startup', label: 'Launch at startup', value: 'On' },
      { id: 'telemetry', label: 'Telemetry', value: 'Minimal' },
      { id: 'updates', label: 'Auto-update', value: 'On' },
    ],
  },
];

const groupIcons: Record<string, JSX.Element> = {
  eye: <Eye size={15} />,
  mic: <Mic size={15} />,
  smartphone: <Smartphone size={15} />,
  settings: <SettingsIcon size={15} />,
};

export function SettingsView() {
  const { user, avatar, updateAvatar, agents, logout, aiConfig, setAIConfig, clearAIConfig, sttConfig, setSTTConfig, clearSTTConfig, addJournal, setView } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);

  const [provider, setProvider] = useState(aiConfig?.provider ?? DEFAULT_AI.provider);
  const [model, setModel] = useState(aiConfig?.model ?? DEFAULT_AI.model);
  const [apiKey, setApiKey] = useState(aiConfig?.apiKey ?? DEFAULT_AI.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const [sttProvider, setSttProvider] = useState(sttConfig?.provider ?? STT_PROVIDERS[0].id);
  const [sttModel, setSttModel] = useState(sttConfig?.model ?? STT_PROVIDERS[0].models[0]);
  const [sttKey, setSttKey] = useState(sttConfig?.apiKey ?? '');
  const [sttShowKey, setSttShowKey] = useState(false);
  const [sttTestState, setSttTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [sttTestMsg, setSttTestMsg] = useState('');

  const prov = providerById(provider);
  const sttProvInfo = sttProviderById(sttProvider);

  const runSttTest = async (cfg: STTConfig) => {
    setSttTestState('testing');
    setSttTestMsg('');
    try {
      await transcribeAudio(cfg, silentWavBlob());
    } catch (e) {
      const msg = (e as Error).message || 'Connection failed';
      if (msg !== 'No speech recognized') {
        setSttTestState('error');
        setSttTestMsg(msg);
        return false;
      }
    }
    setSttTestState('ok');
    setSttTestMsg('Connected — speech-to-text is ready');
    return true;
  };

  const saveSTT = async () => {
    if (sttProvider !== 'local' && !sttKey.trim()) {
      setSttTestState('error');
      setSttTestMsg('Enter an API key first');
      return;
    }
    const cfg: STTConfig = { provider: sttProvider as STTConfig['provider'], apiKey: sttKey.trim(), model: sttModel };
    const ok = await runSttTest(cfg);
    if (ok) {
      setSTTConfig(cfg);
      addJournal('action', `Speech-to-text connected — ${sttProvInfo.label} / ${cfg.model}`);
      setSttTestState('ok');
      setSttTestMsg('Connected and saved. Tap the mic on the agent page and speak.');
    }
  };

  const runTest = async (cfg: AIConfig) => {
    setTestState('testing');
    setTestMsg('');
    try {
      const reply = await testAI(cfg);
      setTestState('ok');
      setTestMsg(reply);
      return true;
    } catch (e) {
      setTestState('error');
      setTestMsg((e as Error).message || 'Connection failed');
      return false;
    }
  };

  const saveConfig = async () => {
    if (prov.needsKey && !apiKey.trim()) {
      setTestState('error');
      setTestMsg('Enter an API key first');
      return;
    }
    if (!model.trim()) {
      setTestState('error');
      setTestMsg('Enter a model name');
      return;
    }
    const cfg: AIConfig = { provider, apiKey: apiKey.trim(), model: model.trim() };
    const ok = await runTest(cfg);
    if (ok) {
      setAIConfig(cfg);
      addJournal('action', `AI engine connected — ${prov.label} / ${cfg.model}`);
      setTestState('ok');
      setTestMsg('Connected and saved. The agent now thinks with this engine.');
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (groupsRef.current) {
        const cards = groupsRef.current.querySelectorAll('.settings-group');
        tl.fromTo(cards, { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.07 }, '-=0.15');
      }
    }, [headerRef, groupsRef]);
    return () => ctx.revert();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>
          Settings
        </h1>
        <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>Preferences and configuration</p>
      </div>

      <div ref={groupsRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        <div className="card p-5 settings-group" style={{ background: 'var(--surface-1)', border: `1px solid ${aiConfig ? 'rgba(129,199,132,0.35)' : 'var(--hairline-strong)'}` }}>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: aiConfig ? '#81C784' : avatar.accent }}>
              <Cpu size={15} />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Engine</h2>
            {aiConfig && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ color: '#81C784', background: 'rgba(129,199,132,0.1)', border: '1px solid rgba(129,199,132,0.3)', fontFamily: 'var(--font)' }}>
                <CheckCircle2 size={11} /> connected
              </span>
            )}
          </div>
          <p className="text-xs font-light mb-4" style={{ color: 'var(--text-dim)' }}>
            Connect a provider so the agent can think, answer questions, remember with the brain and run triggers. Everything stays in this app — your key is stored only in your browser.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>Provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  const p = providerById(e.target.value);
                  setProvider(p.id);
                  setModel(aiConfig?.model ?? p.models[0] ?? '');
                  setTestState('idle');
                  setTestMsg('');
                }}
                className="mt-1.5 w-full text-sm select-field"
                style={{ height: 36 }}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>Model</label>
              {prov.customModel ? (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. qwen2.5"
                  className="mt-1.5 w-full px-3 rounded-md text-sm outline-none"
                  style={{ height: 36, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setTestState('idle');
                    setTestMsg('');
                  }}
                  className="mt-1.5 w-full text-sm select-field"
                  style={{ height: 36 }}
                >
                  {prov.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>API key</label>
              {prov.needsKey ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-md px-3" style={{ height: 36, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                    className="bg-transparent outline-none text-sm flex-1 min-w-0"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                  />
                  <button onClick={() => setShowKey(!showKey)} style={{ color: 'var(--text-faint)' }} title={showKey ? 'Hide' : 'Show'}>
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center px-3 rounded-md" style={{ height: 36, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                  <span className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>No key needed — runs locally</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={saveConfig}
              disabled={testState === 'testing'}
              className="flex items-center gap-1.5 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
              style={{ height: 34, padding: '0 16px', background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
            >
              {testState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Test & connect
            </button>
            <button
              onClick={async () => {
                if (!aiConfig) return;
                setTestState('testing');
                setTestMsg('');
                const ok = await runTest(aiConfig);
                setTestMsg(ok ? 'Connection is alive' : 'Provider unreachable right now');
              }}
              disabled={testState === 'testing' || !aiConfig}
              className="btn-ghost"
              style={{ height: 34, fontSize: 12 }}
            >
              Re-test saved config
            </button>
            {aiConfig && (
              <button
                onClick={() => {
                  clearAIConfig();
                  addJournal('action', 'AI engine disconnected');
                  setTestState('idle');
                  setTestMsg('');
                }}
                className="btn-ghost flex items-center gap-1"
                style={{ height: 34, fontSize: 12, color: '#8a5a5a' }}
              >
                <Trash2 size={12} /> Disconnect
              </button>
            )}
          </div>

          {(testState === 'ok' || testState === 'error') && testMsg && (
            <p
              className="mt-3 flex items-center gap-1.5 text-xs"
              style={{ color: testState === 'ok' ? '#81C784' : '#FF8A8A' }}
            >
              {testState === 'ok' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {testMsg}
            </p>
          )}

          {aiConfig && (
            <p className="mt-3 text-xs" style={{ color: 'var(--text-faint)' }}>
              Active engine: {providerById(aiConfig.provider).label} · {aiConfig.model}
            </p>
          )}
        </div>

        <div className="card p-5 mt-4 settings-group" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: avatar.accent }}>
              <Volume2 size={15} />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Assistant Voice</h2>
          </div>
          <p className="text-xs font-light mb-4" style={{ color: 'var(--text-dim)' }}>
            Choose the voice the assistant speaks with. It is used everywhere — the agent page, quick answers and previews.
          </p>

          <VoicePicker />
        </div>

        <div className="card p-5 mt-4 settings-group" style={{ background: 'var(--surface-1)', border: `1px solid ${sttConfig ? 'rgba(129,199,132,0.35)' : 'var(--hairline-strong)'}` }}>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: sttConfig ? '#81C784' : avatar.accent }}>
              <AudioLines size={15} />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Speech-to-text</h2>
            {sttConfig && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ color: '#81C784', background: 'rgba(129,199,132,0.1)', border: '1px solid rgba(129,199,132,0.3)', fontFamily: 'var(--font)' }}>
                <CheckCircle2 size={11} /> connected
              </span>
            )}
          </div>
          <p className="text-xs font-light mb-4" style={{ color: 'var(--text-dim)' }}>
            Lets Umbra understand your voice in the desktop app. Local-first: it uses VoiceStudio ({'localhost:3900'}) or Voicebox ({'127.0.0.1:17493'}) when they are running — no key needed. Otherwise it falls back to a cloud Whisper provider you configure below.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>Provider</label>
              <select
                value={sttProvider}
                onChange={(e) => {
                  const p = sttProviderById(e.target.value);
                  setSttProvider(p.id);
                  setSttModel(sttConfig?.model ?? p.models[0]);
                  setSttTestState('idle');
                  setSttTestMsg('');
                }}
                className="mt-1.5 w-full text-sm select-field"
                style={{ height: 36 }}
              >
                {STT_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>Model</label>
              <select
                value={sttModel}
                onChange={(e) => {
                  setSttModel(e.target.value);
                  setSttTestState('idle');
                  setSttTestMsg('');
                }}
                className="mt-1.5 w-full text-sm select-field"
                style={{ height: 36 }}
              >
                {sttProvInfo.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}>API key</label>
              {sttProvider === 'local' ? (
                <div className="mt-1.5 flex items-center px-3 rounded-md" style={{ height: 36, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                  <span className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>No key needed — runs on your machine</span>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-2 rounded-md px-3" style={{ height: 36, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                  <input
                    type={sttShowKey ? 'text' : 'password'}
                    value={sttKey}
                    onChange={(e) => setSttKey(e.target.value)}
                    placeholder={sttProvider === 'groq' ? 'gsk_…' : 'sk-…'}
                    className="bg-transparent outline-none text-sm flex-1 min-w-0"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                  />
                  <button onClick={() => setSttShowKey(!sttShowKey)} style={{ color: 'var(--text-faint)' }} title={sttShowKey ? 'Hide' : 'Show'}>
                    {sttShowKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={saveSTT}
              disabled={sttTestState === 'testing'}
              className="flex items-center gap-1.5 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
              style={{ height: 34, padding: '0 16px', background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
            >
              {sttTestState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Test & save
            </button>
            {sttConfig && (
              <button
                onClick={() => {
                  clearSTTConfig();
                  addJournal('action', 'Speech-to-text disconnected');
                  setSttTestState('idle');
                  setSttTestMsg('');
                }}
                className="btn-ghost flex items-center gap-1"
                style={{ height: 34, fontSize: 12, color: '#8a5a5a' }}
              >
                <Trash2 size={12} /> Disconnect
              </button>
            )}
          </div>

          {(sttTestState === 'ok' || sttTestState === 'error') && sttTestMsg && (
            <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: sttTestState === 'ok' ? '#81C784' : '#FF8A8A' }}>
              {sttTestState === 'ok' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {sttTestMsg}
            </p>
          )}
        </div>

        <div className="card p-5 mt-4 settings-group" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: avatar.accent }}>
              <Smartphone size={15} />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Devices</h2>
          </div>
          <p className="text-xs font-light mb-3" style={{ color: 'var(--text-dim)' }}>
            Connected devices, pairing and the transfer queue live in their own screen.
          </p>
          <button
            onClick={() => setView('devices')}
            className="flex items-center gap-1.5 text-sm font-medium rounded-xl transition-opacity"
            style={{ height: 34, padding: '0 16px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
          >
            Open devices <ArrowRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {settingGroups.map((group) => (
            <div key={group.id} className="settings-group card p-5" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: avatar.accent }}>
                  {groupIcons[group.icon]}
                </span>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.label}</h2>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <span className="text-sm font-light" style={{ color: 'var(--text-dim)' }}>{item.label}</span>
                    {item.id === 'accent' ? (
                      <div className="flex items-center gap-1.5">
                        {accentColors.map((c) => (
                          <button
                            key={c}
                            className="swatch"
                            style={{
                              width: 18,
                              height: 18,
                              background: c,
                              borderColor: avatar.accent === c ? '#fff' : 'transparent',
                              transform: avatar.accent === c ? 'scale(1.15)' : undefined,
                            }}
                            onClick={() => updateAvatar({ accent: c })}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>{item.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5 mt-4 flex items-center justify-between gap-4" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-4">
            <span
              className="rounded-full flex-shrink-0"
              style={{
                width: 46,
                height: 46,
                background: `radial-gradient(circle at 32% 30%, ${avatar.accent}, ${avatar.accent}55 70%, transparent 75%), var(--surface-2)`,
                border: `1px solid ${avatar.accent}44`,
                boxShadow: `0 0 16px ${avatar.accent}33`,
              }}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account</p>
              <p className="text-xs mt-0.5 font-light" style={{ color: 'var(--text-dim)' }}>
                Signed in as {user?.email} · {agents.length} agents active
              </p>
            </div>
          </div>
          <button className="btn-ghost" style={{ height: 34, fontSize: 12 }} onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
