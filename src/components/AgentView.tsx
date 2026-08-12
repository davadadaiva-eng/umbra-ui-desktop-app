import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAppStore, type View } from '../stores/appStore';
import { aiChat, DEFAULT_AI, providerById } from '../lib/ai';
import { transcribeAudio, LOCAL_STT_DEFAULT } from '../lib/stt';
import { isVoiceStudioOnline, isVoiceboxOnline, speakWithVoiceStudio, speakWithVoicebox } from '../lib/voiceEngines';
import ParticleSphere from './ParticleSphere';
import { BrainView } from './BrainView';
import {
  Mic, ArrowUp, Volume2, Square, Sparkles, AudioLines, ChevronLeft, ChevronRight, Trash2, MessageSquare, X,
} from 'lucide-react';

const viewMap: { id: View; label: string; keys: string[] }[] = [
  { id: 'agent', label: 'the agent page', keys: ['agent'] },
  { id: 'recall', label: 'recall', keys: ['recall', 'files', 'memory'] },
  { id: 'brain', label: 'the brain', keys: ['brain', 'mind', 'graph', 'notes'] },
  { id: 'skills', label: 'the skill matrix', keys: ['skills', 'skill matrix', 'skillset'] },
  { id: 'vault', label: 'the vault', keys: ['vault', 'passwords', 'secrets'] },
  { id: 'connectors', label: 'connectors', keys: ['connectors', 'mcp', 'connections', 'plugins'] },
  { id: 'meetings', label: 'meetings', keys: ['meeting', 'meet', 'zoom', 'teams', 'call'] },
  { id: 'usage', label: 'usage', keys: ['usage', 'stats', 'cost', 'telemetry'] },
  { id: 'phone', label: 'agent phone', keys: ['phone', 'agentphone', 'calls', 'voice calls'] },
  { id: 'devices', label: 'devices', keys: ['devices', 'mobile'] },
  { id: 'desktop2', label: 'desktop two', keys: ['desktop two', 'desktop 2', 'second desktop', 'local store'] },
  { id: 'settings', label: 'settings', keys: ['settings', 'preferences'] },
];

const accentColors = ['#3B82F6', '#60A5FA', '#B600A8', '#0E7C7B', '#BE4C00', '#B0305E'];

const specialties: { re: RegExp; name: string; verb: string }[] = [
  { re: /summar|digest|brief|condense|synthes/, name: 'Scribe', verb: 'Summarizing' },
  { re: /search|research|find|look up|investigat|scout/, name: 'Scout', verb: 'Searching' },
  { re: /writ|draft|compos|whitepaper|document|report|copy/, name: 'Writer', verb: 'Drafting' },
  { re: /code|build|develop|debug|fix|implement|app|script/, name: 'Builder', verb: 'Building' },
  { re: /analyz|analy|insight|stat|metric|data|trend/, name: 'Analyst', verb: 'Analyzing' },
  { re: /remind|schedul|calendar|meeting|deadline|plan/, name: 'Keeper', verb: 'Tracking' },
  { re: /email|mail|message|reply|inbox/, name: 'Courier', verb: 'Handling' },
  { re: /transcri|voice|audio|clip|speech|podcast/, name: 'Echo', verb: 'Indexing' },
  { re: /design|ui|visual|mockup|logo|brand/, name: 'Atelier', verb: 'Designing' },
  { re: /translat|language|localiz/, name: 'Babel', verb: 'Translating' },
  { re: /music|song|playlist|audio mix/, name: 'Maestro', verb: 'Curating' },
];

const BRAIN_BUILD_KEY = 'umbra-brainbuilt-v2';

const BRAIN_QUESTIONS = [
  {
    tag: 'focus',
    short: 'your main focus',
    say: "Let's build your brain, one answer at a time. What are you working on lately — your main project, or focus?",
  },
  {
    tag: 'people',
    short: 'important people',
    say: "Who are the most important people in your life or work? I'll remember their names.",
  },
  {
    tag: 'peak-time',
    short: 'your best hours',
    say: 'What time of day are you most productive? I’ll time my reminders around it.',
  },
  {
    tag: 'style',
    short: 'how you like to talk',
    say: 'How do you like to communicate — short and direct, or with more context?',
  },
  {
    tag: 'tools',
    short: 'the tools you use',
    say: 'What tools or apps do you use every day? I’ll keep them handy in your vault.',
  },
  {
    tag: 'goals',
    short: 'your goals',
    say: 'What goals are you chasing right now? I’ll help you track them.',
  },
  {
    tag: 'boundaries',
    short: 'your boundaries',
    say: 'What should I never do? Tell me your boundaries and I’ll write them down.',
  },
  {
    tag: 'preferences',
    short: 'how you like things done',
    say: 'Anything you want me to always remember about how you like things done?',
  },
];

function taskFromCommand(raw: string): string {
  let s = raw
    .replace(/^(spawn|create|new|add|start|make|launch|open)\b/i, '')
    .replace(/\b(an?|the|another|for me)\b/g, ' ')
    .replace(/\b(agent|task|crew|assistant|worker)s?\b/g, ' ')
    .replace(/\b(to|that|which|who)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,:\-–—\s]+/, '')
    .trim();
  if (!s) return '';
  s = s.replace(/^./, (c) => c.toUpperCase()).replace(/[.!?。！？]+$/gu, '').trim();
  return s.slice(0, 60);
}

interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlternative; isFinal: boolean }
interface SpeechRecognitionEventLike extends Event { results: { length: number; [index: number]: SpeechRecognitionResultLike } }
interface SpeechRecognitionErrorLike extends Event { error: string }
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
}
interface WindowWithSpeech extends Window {
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  SpeechRecognition?: new () => SpeechRecognitionLike;
}

interface WindowWithAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

type StatusKind = 'idle' | 'wake' | 'armed' | 'busy' | 'error';
type IntroStep = 'idle' | 'ask-name' | 'ask-agent-name' | 'ask-about' | 'ask-fact' | 'done';

const cleanName = (t: string) =>
  t
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 24);

export function AgentView() {
  const { user, avatar, avatarName, namedMain, agents, focusedAgentId, profile, aiConfig, voiceURI, voiceboxProfile, journal, sttConfig, talkAlways, setProfile, setAvatarName, markNamedMain, setView, addAgent, removeAgent, addJournal, addFact, focusAgent, addBrainFile } = useAppStore();
  const crew = [null, ...agents] as (NonNullable<typeof agents>[number] | null)[];
  const focusIdx = Math.max(0, crew.findIndex((a) => a && a.id === focusedAgentId));
  const focusedAgent = crew[focusIdx] ?? null;
  const accent = focusedAgent?.accent ?? avatar.accent;
      const effConfig = aiConfig ?? DEFAULT_AI;
  const SPHERE_D = '40vmin';
  const RING_RADIUS = 44;
  const RING_DIP = 10;
  const RING_SPREAD = crew.length === 2 ? 90 : 360 / Math.max(1, crew.length);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wakeOn, setWakeOn] = useState(false);
  const [input, setInput] = useState('');
  const [lastLine, setLastLine] = useState('');
  const [introStep, setIntroStep] = useState<IntroStep>('idle');
  const [status, setStatus] = useState<{ kind: StatusKind; text: string }>({
    kind: 'idle',
    text: 'starting up…',
  });
  const [space, setSpace] = useState<'brain' | null>(null);
  const [slide, setSlide] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState<null | { mode: 'main' } | { mode: 'new' }>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [proposal, setProposal] = useState<{ name: string; task: string } | null>(null);
  const chatTokenRef = useRef(0);

  useEffect(() => {
    if (!namedMain) {
      setNameDraft(avatarName);
      setNamePrompt({ mode: 'main' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sphereRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const wakeRef = useRef({ armed: false, buffer: '' });
  const finalIdxRef = useRef(0);
  const speechTokenRef = useRef(0);
  const wakeOnRef = useRef(false);
  const avatarNameRef = useRef(avatarName);
  const profileRef = useRef(profile);
  const introStepRef = useRef<IntroStep>(introStep);
  const handleIncomingRef = useRef<(text: string) => boolean>(() => true);
  const voiceURIRef = useRef(voiceURI);
  const voiceboxProfileRef = useRef(voiceboxProfile);
  const voiceboxOnlineRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimeoutRef = useRef(0);
  const silenceRafRef = useRef(0);
  const spawnProposalRef = useRef<{ name: string; task: string } | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);
  const pulseRef = useRef<HTMLDivElement>(null);
  const spherePulseRef = useRef<HTMLDivElement>(null);
  const synthBoundaryRef = useRef(0);
  const smoothAmpRef = useRef(0);
  const slideRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragDirRef = useRef<{ dir: 'h' | 'v' | null; moved: boolean }>({ dir: null, moved: false });
  const clickGuardRef = useRef(false);
  const barChannelRef = useRef<BroadcastChannel | null>(null);
  const lastBarPostRef = useRef('');
  const startWakeRef = useRef<() => void>(() => {});
  const stopWakeRef = useRef<() => void>(() => {});
  const talkAlwaysRef = useRef(talkAlways);
  const brainRef = useRef<{ active: boolean; index: number; answers: string[] }>({ active: false, index: 0, answers: [] });

  avatarNameRef.current = avatarName;
  profileRef.current = profile;
  introStepRef.current = introStep;
  voiceURIRef.current = voiceURI;
  voiceboxProfileRef.current = voiceboxProfile;
  talkAlwaysRef.current = talkAlways;

  useEffect(() => {
    Promise.all([isVoiceStudioOnline(1800), isVoiceboxOnline(1800)]).then(([vs, vb]) => {
      voiceboxOnlineRef.current = vs || vb;
      if (!vs && !vb) addJournal('action', 'Local voice engines not detected — using browser voices');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPulseLoop = () => {
    if (rafRef.current) return;
    smoothAmpRef.current = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      let amp = 0;
      const analyser = analyserRef.current;
      if (analyser) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const d = (data[i] - 128) / 128;
          sum += d * d;
        }
        amp = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
      } else {
        const now = performance.now();
        const since = now - synthBoundaryRef.current;
        const bump = since < 380 ? 0.45 * (1 - since / 380) : 0;
        const breath = 0.07 + 0.05 * Math.sin(now / 720);
        amp = Math.min(1, bump + breath);
      }
      smoothAmpRef.current = smoothAmpRef.current * 0.7 + amp * 0.3;
      const s = 1 + smoothAmpRef.current * 0.55;
      if (spherePulseRef.current) spherePulseRef.current.style.transform = `scale(${s})`;
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopPulseLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    analyserRef.current = null;
    smoothAmpRef.current = 0;
    if (pulseRef.current) pulseRef.current.style.transform = 'scale(1)';
    if (spherePulseRef.current) spherePulseRef.current.style.transform = 'scale(1)';
  };

  useEffect(() => {
    const prime = () => {
      if (audioCtxRef.current) return;
      const Ctor = window.AudioContext || (window as WindowWithAudio).webkitAudioContext;
      if (!Ctor) return;
      try {
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch {
        // ignore
      }
    };
    window.addEventListener('pointerdown', prime);
    window.addEventListener('keydown', prime);
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    speechTokenRef.current++;
    stopPulseLoop();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const browserSpeak = useCallback(
    (text: string, token: number) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const all = synth.getVoices();
        const chosen =
          (voiceURIRef.current ? all.find((v) => v.voiceURI === voiceURIRef.current) : undefined) ??
          all.find((v) => v.lang.toLowerCase().startsWith('en') && /google|natural|david|zira|samantha|aria|jenny|guy/i.test(v.name)) ??
          all.find((v) => v.lang.toLowerCase().startsWith('en'));
        if (chosen) u.voice = chosen;
        u.rate = 1.05;
        u.pitch = 1;
        u.onstart = () => {
          synthBoundaryRef.current = performance.now();
          startPulseLoop();
          if (token === speechTokenRef.current) setIsSpeaking(true);
        };
        u.onboundary = () => {
          if (token === speechTokenRef.current) synthBoundaryRef.current = performance.now();
        };
        u.onend = () => {
          if (token === speechTokenRef.current) {
            stopPulseLoop();
            setIsSpeaking(false);
          }
        };
        u.onerror = () => {
          if (token === speechTokenRef.current) {
            stopPulseLoop();
            setIsSpeaking(false);
          }
        };
        synth.speak(u);
      } catch {
        stopPulseLoop();
        setIsSpeaking(false);
      }
    },
    []
  );

  const speak = useCallback(
    (text: string) => {
      const t = text.trim();
      setLastLine(t);
      try {
        addJournal('agent', t);
        if (t) addBrainFile(`umbra_talk_${Date.now()}.md`, t, 'text/markdown');
      } catch {
        // ignore
      }
      if (!t) return;
      const token = ++speechTokenRef.current;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      if (voiceboxProfileRef.current && voiceboxOnlineRef.current) {
        const sel = voiceboxProfileRef.current;
        const selId = sel.slice(3);
        const localSpeak =
          sel.startsWith('vs:')
            ? speakWithVoiceStudio(t, selId)
            : sel.startsWith('vb:')
              ? speakWithVoicebox(t, selId)
              : Promise.reject(new Error('unknown voice'));
        localSpeak
          .then((url) => {
            if (token !== speechTokenRef.current) return;
            const audio = new Audio(url);
            audioRef.current = audio;
            setIsSpeaking(true);
            startPulseLoop();
            const ctx = audioCtxRef.current;
            if (ctx) {
              try {
                const source = ctx.createMediaElementSource(audio);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.85;
                source.connect(analyser);
                analyser.connect(ctx.destination);
                analyserRef.current = analyser;
              } catch {
                analyserRef.current = null;
              }
              if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
            } else {
              analyserRef.current = null;
            }
            audio.onended = () => {
              if (token === speechTokenRef.current) {
                stopPulseLoop();
                setIsSpeaking(false);
                audioRef.current = null;
              }
            };
            audio.onerror = () => {
              if (token === speechTokenRef.current) {
                stopPulseLoop();
                setIsSpeaking(false);
                audioRef.current = null;
              }
            };
            audio.play().catch(() => {
              if (token === speechTokenRef.current) {
                stopPulseLoop();
                setIsSpeaking(false);
                audioRef.current = null;
              }
            });
          })
          .catch(() => {
            browserSpeak(t, token);
          });
      } else {
        browserSpeak(t, token);
      }
    },
    [addJournal, browserSpeak, addBrainFile]
  );

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (pulseRef.current) {
        gsap.fromTo(pulseRef.current, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 1.1, ease: 'power3.out' });
      }
    }, [pulseRef]);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const beginIntro = useCallback(() => {
    introStepRef.current = 'ask-name';
    setIntroStep('ask-name');
    setStatus({ kind: 'busy', text: 'who are you?' });
    speak("Hi! I'm your Umbra — I don't know you yet. What's your name?");
  }, [speak]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (profileRef.current) {
        introStepRef.current = 'done';
        setIntroStep('done');
        setStatus({ kind: 'idle', text: `say "${avatarNameRef.current}, open the brain" — or type below` });
        speak(`Hey ${profileRef.current.name}, I'm ${avatarNameRef.current}. What do you need?`);
      } else {
        beginIntro();
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [beginIntro, speak]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      try {
        recogRef.current?.stop();
      } catch {
        // ignore
      }
      cancelAnimationFrame(silenceRafRef.current);
      window.clearTimeout(recTimeoutRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
    };
  }, [stopSpeaking]);

  const transcript = useMemo(
    () => journal.filter((e) => e.type === 'user' || e.type === 'agent' || e.type === 'action').slice(-80),
    [journal]
  );

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [journal]);

  const spawnAgent = useCallback(
    (raw?: string, customName?: string) => {
      const task = taskFromCommand(raw ?? '');
      const fallbackTasks = ['Scanning your timeline', 'Watching the transfer queue', 'Indexing voice clips', 'Tuning Desktop 2', 'Compiling daily digest'];
      const spec = specialties.find((s) => s.re.test(task.toLowerCase()));
      const names = ['Orbit', 'Flux', 'Prism', 'Halo', 'Mira', 'Echo', 'Nova'];
      const cleanName = (customName ?? '').trim();
      const name = cleanName || spec?.name || names[Math.floor(Math.random() * names.length)];
      const displayTask = task
        ? spec
          ? `${spec.verb} ${task.charAt(0).toLowerCase()}${task.slice(1)}`
          : task
        : fallbackTasks[Math.floor(Math.random() * fallbackTasks.length)];
      const agent = addAgent({
        name,
        task: displayTask.slice(0, 80),
        status: 'running',
        accent: (() => {
          const used = new Set(agents.map((a) => a.accent));
          const free = accentColors.filter((c) => !used.has(c));
          return free.length ? free[agents.length % free.length] : accentColors[agents.length % accentColors.length];
        })(),
        icon: 'sparkles',
      });
      try {
        addBrainFile(`agent_${name}.md`, `${name} — ${displayTask}\n\nSpawned by voice or text. Watching the timeline until done.`, 'text/markdown');
      } catch {
        // ignore
      }
      return agent;
    },
    [addAgent, agents, addBrainFile]
  );

  const goAgent = useCallback(
    (id: string | null) => {
      focusAgent(id);
      if (id) {
        const a = agents.find((x) => x.id === id);
        if (a) setStatus({ kind: 'busy', text: `→ ${a.name}: ${a.task}` });
      } else {
        setStatus({ kind: 'idle', text: `back to ${avatarName}` });
      }
    },
    [focusAgent, agents, avatarName]
  );

  const focusPrev = useCallback(() => {
    if (!agents.length) return;
    const idx = focusedAgentId ? agents.findIndex((a) => a.id === focusedAgentId) : -1;
    const prevIdx = idx === -1 ? agents.length - 1 : idx - 1;
    goAgent(prevIdx < 0 ? null : agents[prevIdx].id);
  }, [agents, focusedAgentId, goAgent]);

  const focusNext = useCallback(() => {
    if (!agents.length) return;
    const idx = focusedAgentId ? agents.findIndex((a) => a.id === focusedAgentId) : -1;
    const nextIdx = idx + 1;
    goAgent(nextIdx >= agents.length ? null : agents[nextIdx].id);
  }, [agents, focusedAgentId, goAgent]);

  const deleteAgent = useCallback(
    (id: string) => {
      const a = agents.find((x) => x.id === id);
      if (!a) return;
      removeAgent(id);
      addJournal('action', `Agent ${a.name} deleted`);
      setStatus({ kind: 'idle', text: `${a.name} removed` });
      speak(`${a.name} removed.`);
    },
    [agents, removeAgent, addJournal, setStatus, speak]
  );

  const submitNamePrompt = useCallback(() => {
    if (!namePrompt) return;
    const draft = nameDraft.trim();
    if (namePrompt.mode === 'main') {
      if (draft) {
        setAvatarName(draft);
        addJournal('action', `Agent named ${draft}`);
      }
      markNamedMain();
    } else {
      const a = spawnAgent(taskDraft.trim(), draft);
      addJournal('action', `Spawned agent ${a.name} — ${a.task}`);
      setStatus({ kind: 'busy', text: `spawned ${a.name} — ${a.task}` });
    }
    setNamePrompt(null);
  }, [namePrompt, nameDraft, taskDraft, setAvatarName, markNamedMain, spawnAgent, addJournal, setStatus]);

  const animateSlide = useCallback((target: number, onDone?: () => void) => {
    const from = slideRef.current;
    if (Math.abs(target - from) < 0.001) {
      onDone?.();
      return;
    }
    gsap.killTweensOf(slideRef);
    gsap.to(slideRef, {
      current: target,
      duration: 0.34,
      ease: 'power2.out',
      onUpdate: () => setSlide(slideRef.current),
      onComplete: () => {
        slideRef.current = target;
        setSlide(target);
        onDone?.();
      },
    });
  }, []);

  const openBrain = useCallback(() => {
    setSpace('brain');
    animateSlide(1);
  }, [animateSlide]);

  const closeBrain = useCallback(() => {
    animateSlide(0, () => setSpace(null));
  }, [animateSlide]);

  const onWorkspacePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (space === 'brain') return;
      const t = e.target as HTMLElement;
      if (t.closest('button, input, textarea, a, select, canvas')) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragDirRef.current = { dir: null, moved: false };
      setDragging(true);
    },
    [space]
  );

  const onWorkspacePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const d = dragDirRef.current;
    if (!d.dir) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      d.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (d.dir !== 'h') return;
    d.moved = true;
    clickGuardRef.current = true;
    gsap.killTweensOf(slideRef);
    const v = Math.min(1, Math.max(0, dx / 260));
    slideRef.current = v;
    setSlide(v);
  }, [dragging]);

  const onWorkspacePointerUp = useCallback(() => {
    if (!dragging) return;
    const wasDrag = dragDirRef.current?.dir === 'h';
    dragStartRef.current = null;
    dragDirRef.current = { dir: null, moved: false };
    setDragging(false);
    if (!wasDrag) return;
    window.setTimeout(() => {
      clickGuardRef.current = false;
    }, 120);
    if (slideRef.current > 0.4) openBrain();
    else animateSlide(0);
  }, [dragging, openBrain, animateSlide]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') focusNext();
      else if (e.key === 'ArrowLeft') focusPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusNext, focusPrev]);

  const runCommand = useCallback(
    (raw: string): boolean => {
      const cmd = raw.toLowerCase();

      if (/\b(stop|quiet|cancel|shut up|silence)\b/.test(cmd)) {
        stopSpeaking();
        setStatus({ kind: 'idle', text: 'stopped' });
        addJournal('action', 'Speech stopped');
        return true;
      }
      if (/spawn|create|new.*agent|add.*agent/.test(cmd) && /agent|crew|assistant/.test(cmd)) {
        const agent = spawnAgent(raw);
        setStatus({ kind: 'busy', text: `spawned ${agent.name} — ${agent.task}` });
        addJournal('action', `Spawned agent ${agent.name} — ${agent.task}`);
        speak(`Spawned ${agent.name}. ${agent.task}.`);
        return true;
      }
      if (/create|new|add|start/.test(cmd) && /task|job|work|chore/.test(cmd)) {
        const agent = spawnAgent(raw);
        setStatus({ kind: 'busy', text: `assigned ${agent.name} — ${agent.task}` });
        addJournal('action', `Created task — assigned ${agent.name} — ${agent.task}`);
        speak(`On it. I've assigned ${agent.name}. ${agent.task}.`);
        return true;
      }
      const focusMatch = cmd.match(/(?:switch to|focus on|talk to|go to|wake up)\s+(.+)/);
      if (focusMatch) {
        const target = focusMatch[1].trim().toLowerCase();
        const pName = (profileRef.current?.name ?? '').toLowerCase();
        if (/back|home|main|james|umbra|you/.test(target) || (pName && target === pName)) {
          goAgent(null);
          addJournal('action', `Switched back to ${avatarNameRef.current}`);
          speak(`Back with you, ${profileRef.current?.name ?? 'boss'}.`);
          return true;
        }
        const viewHit = viewMap.find((v) => v.keys.some((k) => target.includes(k)));
        if (viewHit) {
          if (viewHit.id === 'brain') openBrain();
          else if (viewHit.id === 'devices') setView('devices');
          else if (viewHit.id === 'recall') {
            setRecallOpen(true);
            openBrain();
          } else setView(viewHit.id);
          setStatus({ kind: 'busy', text: `→ ${viewHit.label}` });
          addJournal('action', `Opened ${viewHit.label}`);
          speak(`Opening ${viewHit.label}.`);
          return true;
        }
        const hit = agents.find((a) => target.startsWith(a.name.toLowerCase()) || a.name.toLowerCase().includes(target));
        if (hit) {
          goAgent(hit.id);
          addJournal('action', `Switched to ${hit.name} — ${hit.task}`);
          speak(`Switching to ${hit.name}. ${hit.task}.`);
          return true;
        }
        speak(`I don't have an agent named ${focusMatch[1].trim()}.`);
        return true;
      }
      if (/\bwho are you\b|\bwhat are you\b|introduce yourself|what can you do|help\b/.test(cmd)) {
        setStatus({ kind: 'busy', text: 'answering…' });
        const p = profileRef.current;
        const intro = p
          ? `I'm ${avatarNameRef.current}, your digital self. I remember ${p.name}${p.about ? ` — ${p.about}` : ''}.`
          : `I'm your Umbra — a sphere of ${(agents.length || 1) * 10000} particles and your digital self.`;
        speak(`${intro} Say my name and a command, like "${avatarNameRef.current}, open the brain".`);
        return true;
      }
      if (/^(hi|hello|hey|yo|ciao|good (morning|afternoon|evening))\b/.test(cmd)) {
        setStatus({ kind: 'busy', text: 'greeting…' });
        speak(`Hey ${profileRef.current?.name ?? user?.name ?? 'there'}. What do you need?`);
        return true;
      }
      for (const v of viewMap) {
        if (v.keys.some((k) => cmd.includes(k)) && /(open|go|take|show|navigate|switch|start)/.test(cmd)) {
        if (v.id === 'brain') openBrain();
        else if (v.id === 'devices') setView('devices');
        else if (v.id === 'recall') {
          setRecallOpen(true);
          openBrain();
        } else setView(v.id);
          setStatus({ kind: 'busy', text: `→ ${v.label}` });
          addJournal('action', `Opened ${v.label}`);
          speak(`Opening ${v.label}.`);
          return true;
        }
      }
      if (/\bhow are you\b|\bstatus\b|\bsync\b/.test(cmd)) {
        const running = agents.filter((a) => a.status === 'running').length;
        setStatus({ kind: 'busy', text: `${agents.length} agents, ${running} running` });
        addJournal('action', `Status check — ${agents.length} agents, ${running} running`);
        speak(`${agents.length} agents online, ${running} running. Everything is synced.`);
        return true;
      }
      return false;
    },
    [stopSpeaking, speak, setView, spawnAgent, goAgent, openBrain, agents, user?.name, addJournal, setRecallOpen]
  );

  const introAnswer = (text: string) => {
    const step = introStepRef.current;
    const p = profileRef.current ?? { name: '', about: '', facts: [] };
    const t = text.trim();
    if (!t) return;

    if (step === 'ask-name') {
      const name = cleanName(t);
      const next = { ...p, name };
      profileRef.current = next;
      setProfile(next);
      introStepRef.current = 'ask-agent-name';
      setIntroStep('ask-agent-name');
      setStatus({ kind: 'busy', text: `${name} — what should I be called?` });
      addJournal('action', `Intro — user name set to ${name}`);
      speak(`Nice to meet you, ${name}. What should I be called? Your name works, or anything you like.`);
    } else if (step === 'ask-agent-name') {
      const an = cleanName(t) || profileRef.current?.name || 'Umbra';
      avatarNameRef.current = an;
      setAvatarName(an);
      introStepRef.current = 'ask-about';
      setIntroStep('ask-about');
      setStatus({ kind: 'busy', text: `I'm ${an} — tell me about you` });
      addJournal('action', `Intro — agent named ${an}`);
      speak(`Perfect, I'm ${an}. Now tell me something about yourself — where are you from, what do you do?`);
    } else if (step === 'ask-about') {
      const next = { ...(profileRef.current ?? p), about: t };
      profileRef.current = next;
      setProfile(next);
      introStepRef.current = 'ask-fact';
      setIntroStep('ask-fact');
      setStatus({ kind: 'busy', text: 'one more thing…' });
      speak('Nice. One more thing — anything else I should remember about you? A project, a place, a habit. Say "nothing" to finish.');
    } else if (step === 'ask-fact') {
      const skip = /^(no|nope|nothing|skip|none|that'?s it|that'?s all|i'?m good|im good|done)$/.test(t.toLowerCase());
      const pNow = profileRef.current ?? p;
      const next = { ...pNow, facts: skip ? pNow.facts : [...pNow.facts, t] };
      profileRef.current = next;
      setProfile(next);
      introStepRef.current = 'done';
      setIntroStep('done');
      setStatus({ kind: 'idle', text: `say "${avatarNameRef.current}, open the brain" — or type below` });
      addJournal('action', `Intro complete — brain writing started for ${next.name}`);
      try {
        const factsText = next.facts.length ? `\n\nFacts:\n${next.facts.map((f) => `- ${f}`).join('\n')}` : '';
        addBrainFile(`you_${next.name.toLowerCase().replace(/\s+/g, '_')}.md`, `# ${next.name}\n\n${next.about || 'No description yet.'}${factsText}`, 'text/markdown');
      } catch {
        // ignore
      }
      speak(`All set, ${next.name}. I've written you into the brain — open the brain tab and you'll see yourself in the graph. From now on, just say "${avatarNameRef.current}, open the brain". Or type below.`);
    }
  };

  const engineReply = useCallback(
    async (text: string) => {
  const effConfig = aiConfig ?? DEFAULT_AI;
      const token = ++chatTokenRef.current;
      setStatus({ kind: 'busy', text: 'thinking…' });
      const p = profileRef.current;
      const selfName = focusedAgent ? focusedAgent.name : avatarNameRef.current;
      const recent = useAppStore
        .getState()
        .journal.slice(-25)
        .map((e) =>
          e.type === 'user' ? `User: ${e.text}` : e.type === 'agent' ? `${avatarNameRef.current}: ${e.text}` : `Action: ${e.text}`
        )
        .join('\n');
      const facts = p?.facts?.length ? `\nFacts about the user:\n${p.facts.map((f) => `- ${f}`).join('\n')}` : '';
      const system =
        `You are ${selfName}, the digital self of ${p?.name ?? 'the user'} in Umbra OS — a personal operating system with a particle-sphere agent, a brain (a note graph), recall, voice control and agent crews. ` +
        (focusedAgent ? `You are a specialized crew agent working on: ${focusedAgent.task}. Stay focused on this task. ` : '') +
        `Your brain remembers everything said and done; the recent journal is below. Reply conversationally in 1-3 short spoken sentences. No markdown, no emoji. ` +
        `When the user says "remember X", it is stored as a fact in your memory and you should confirm it briefly. ` +
        `If asked about your capabilities, mention the wake word: say "${avatarNameRef.current}, open the brain".` +
        (focusedAgent ? '' : ` If the user asks you to do a multi-step background task (research, summarize, analyze, monitor, track, write, build, prepare), you may assign it to a crew agent. To spawn one, end your reply with exactly one line: [SPAWN]<short name>|<one-line task>. Only do this for a clear multi-step task, and only if there are fewer than 6 agents. `) +
        (p?.about ? `\nAbout the user: ${p.about}` : '') +
        facts +
        `\n\nRecent journal:\n${recent}`;
      try {
        const reply = await aiChat(effConfig, system, text, (delta) => {
          if (token !== chatTokenRef.current) return;
          void delta;
        });
        if (token !== chatTokenRef.current) return;
        let cleanReply = reply;
        if (!focusedAgent && agents.length < 6) {
          const m = reply.match(/\[SPAWN\]\s*([^|]+)\|(.+)/);
          if (m) {
            const name = (m[1].trim().split(/\s+/)[0].slice(0, 16) || 'Helper');
            const task = m[2].trim().slice(0, 60);
            cleanReply = reply.replace(/\[SPAWN\][\s\S]*$/, '').trim();
            spawnProposalRef.current = { name, task };
            setProposal({ name, task });
            const ask = `I can spawn a helper named ${name} to handle that. Say yes and I'll start it.`;
            speak(cleanReply ? `${cleanReply} ${ask}` : ask);
            setStatus({ kind: 'idle', text: `say "yes" to spawn ${name} — ${task}` });
            try {
              addBrainFile(`proposal_${Date.now()}.md`, `Proposed helper: ${name} — ${task}`, 'text/markdown');
            } catch {
              // ignore
            }
            return;
          }
        }
        speak(cleanReply);
        try {
          addBrainFile(`umbra_reply_${Date.now()}.md`, cleanReply, 'text/markdown');
        } catch {
          // ignore
        }
        setStatus({ kind: 'idle', text: `answered via ${providerById(effConfig.provider).label}` });
      } catch (e) {
        if (token !== chatTokenRef.current) return;
        const msg = (e as Error).message || 'engine error';
        setStatus({ kind: 'error', text: msg });
        addJournal('action', `Engine error: ${msg}`);
        speak(`My engine had a problem: ${msg}. Check the connection in settings.`);
      }
    },
    [aiConfig, speak, addJournal, focusedAgent, agents, addBrainFile]
  );

  const handleIncoming = (text: string): boolean => {
    if (brainRef.current.active) {
      brainAnswer(text);
      return true;
    }
    addJournal('user', text);
    try {
      addBrainFile(`conversation_${Date.now()}.md`, `You: ${text}`, 'text/markdown');
    } catch {
      // ignore
    }
    if (introStepRef.current !== 'done') {
      introAnswer(text);
      return true;
    }
    if (spawnProposalRef.current) {
      if (/^(yes|yeah|sure|yep|ok|okay|go ahead|do it|please)\b/.test(text.trim().toLowerCase())) {
        const p = spawnProposalRef.current;
        spawnProposalRef.current = null;
        setProposal(null);
        const agent = spawnAgent(p.task, p.name);
        addJournal('action', `Spawned agent ${agent.name} — ${agent.task}`);
        setStatus({ kind: 'busy', text: `spawned ${agent.name} — ${agent.task}` });
        speak(`On it. I've spawned ${agent.name}. ${agent.task}.`);
        return true;
      }
      spawnProposalRef.current = null;
      setProposal(null);
    }
    const memMatch = text.match(/\b(?:remember|don'?t forget|note that|keep in mind|remind me)\b[:\-,\s]*\s+(.+)/i);
    if (memMatch) {
      const fact = memMatch[1].replace(/[.!?。！？]+$/u, '').trim();
      if (fact) {
        addFact(fact);
        addJournal('action', `Remembered: ${fact}`);
        try {
          addBrainFile(`remembered_${Date.now()}.md`, fact, 'text/markdown');
        } catch {
          // ignore
        }
        setStatus({ kind: 'idle', text: `remembered — ${fact.slice(0, 48)}` });
        speak(`Got it. I'll remember: ${fact}.`);
        return true;
      }
    }
    if (runCommand(text)) return true;
    void engineReply(text);
    return true;
  };

  handleIncomingRef.current = handleIncoming;

  const stopMicStream = useCallback(() => {
    cancelAnimationFrame(silenceRafRef.current);
    window.clearTimeout(recTimeoutRef.current);
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startSilenceWatcher = (stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    let src: MediaStreamAudioSourceNode;
    try {
      src = ctx.createMediaStreamSource(stream);
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let silentFor = 0;
    const tick = () => {
      if (recorderRef.current?.state !== 'recording') return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      silentFor = Math.sqrt(sum / data.length) < 0.02 ? silentFor + 1 : 0;
      if (silentFor > 22) {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        return;
      }
      silenceRafRef.current = requestAnimationFrame(tick);
    };
    silenceRafRef.current = requestAnimationFrame(tick);
  };

  const recordAndTranscribe = async () => {
    const stt = useAppStore.getState().sttConfig ?? LOCAL_STT_DEFAULT;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus({ kind: 'error', text: 'microphone permission denied' });
      return;
    }
    streamRef.current = stream;
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const mime = rec.mimeType || 'audio/webm';
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mime });
      setIsRecording(false);
      if (!blob.size) return;
      setStatus({ kind: 'busy', text: 'transcribing…' });
      try {
        const text = await transcribeAudio(stt, blob);
        if (!text) {
          setStatus({ kind: 'idle', text: 'nothing heard — try again' });
          return;
        }
        handleIncomingRef.current(text);
      } catch (e) {
        setStatus({ kind: 'error', text: (e as Error).message || 'transcription failed' });
      }
    };
    setIsRecording(true);
    setStatus({ kind: 'wake', text: 'listening… tap the mic when done' });
    rec.start();
    startSilenceWatcher(stream);
    window.clearTimeout(recTimeoutRef.current);
    recTimeoutRef.current = window.setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, 15000);
  };

  const startWake = () => {
    if (wakeOnRef.current) return;
    const stt = useAppStore.getState().sttConfig;
    const cloudReady = !!stt?.apiKey && stt.provider !== 'local';
    const localReady = voiceboxOnlineRef.current;
    if (cloudReady || localReady) {
      const sttCfg = stt ?? LOCAL_STT_DEFAULT;
      addJournal('action', 'Always-listening turned on');
      wakeRef.current = { armed: false, buffer: '' };
      finalIdxRef.current = 0;
      wakeOnRef.current = true;
      setWakeOn(true);
      setStatus({
        kind: 'wake',
        text: brainRef.current.active
          ? 'listening… answer me'
          : introStepRef.current !== 'done'
            ? 'listening for your answer…'
            : `listening for "${avatarNameRef.current}"…`,
      });
      let fails = 0;
      void (async () => {
        if (!streamRef.current) {
          try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            stopWake();
            setStatus({ kind: 'error', text: 'microphone permission denied' });
            return;
          }
        }
        const segment = () => {
          if (!wakeOnRef.current || !streamRef.current) return;
          const rec = new MediaRecorder(streamRef.current);
          const segChunks: Blob[] = [];
          rec.ondataavailable = (e) => {
            if (e.data.size) segChunks.push(e.data);
          };
          rec.onstop = async () => {
            if (!wakeOnRef.current) return;
            const blob = new Blob(segChunks, { type: rec.mimeType || 'audio/webm' });
            if (blob.size) {
              try {
                const text = await transcribeAudio(sttCfg, blob);
                fails = 0;
                if (text && wakeOnRef.current) onWakeFinal(text);
              } catch (e) {
                const msg = (e as Error).message || '';
                if (/no speech recognized/i.test(msg)) {
                  fails = 0; // silence is normal
                } else {
                  fails += 1;
                  if (fails >= 3 && wakeOnRef.current) {
                    stopWake();
                    setStatus({ kind: 'error', text: 'Speech-to-text is unreachable — check Settings or start VoiceStudio/voicebox.' });
                  }
                }
              }
            }
            window.setTimeout(segment, 250);
          };
          rec.start();
          window.setTimeout(() => {
            if (rec.state === 'recording') rec.stop();
          }, 5000);
        };
        segment();
      })();
      return;
    }
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      const desktop = !!(window as unknown as { umbraDesktop?: unknown }).umbraDesktop;
      setStatus({
        kind: 'error',
        text: desktop
          ? 'Voice needs speech-to-text — add a key in Settings, or start VoiceStudio/voicebox, so the wake word can hear you.'
          : 'voice recognition is not supported in this browser',
      });
      return;
    }
    addJournal('action', 'Always-listening turned on');
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = 'en-US';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (e) => {
      for (let i = finalIdxRef.current; i < e.results.length; i++) {
        const res = e.results[i];
        if (res && res.isFinal) {
          finalIdxRef.current = i + 1;
          onWakeFinal(res[0].transcript);
        }
      }
    };
    recog.onend = () => {
      if (wakeOnRef.current) {
        try {
          recog.start();
        } catch {
          // ignore
        }
      }
    };
    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wakeOnRef.current = false;
        setWakeOn(false);
        setStatus({ kind: 'error', text: 'microphone permission denied' });
      }
    };
    wakeRef.current = { armed: false, buffer: '' };
    finalIdxRef.current = 0;
    wakeOnRef.current = true;
    setWakeOn(true);
    setStatus({
      kind: 'wake',
      text: introStepRef.current !== 'done' ? 'listening for your answer…' : `listening for "${avatarNameRef.current}"…`,
    });
    recog.start();
  };

  const stopWake = () => {
    wakeOnRef.current = false;
    setWakeOn(false);
    wakeRef.current = { armed: false, buffer: '' };
    finalIdxRef.current = 0;
    try {
      recogRef.current?.stop();
    } catch {
      // ignore
    }
    stopMicStream();
    addJournal('action', 'Always-listening turned off');
    setStatus({ kind: 'idle', text: introStepRef.current !== 'done' ? 'type your answer below…' : `say "${avatarNameRef.current}, open the brain" — or type below` });
  };

  startWakeRef.current = startWake;
  stopWakeRef.current = stopWake;

  const tapTalk = () => {
    const stt = useAppStore.getState().sttConfig;
    const cloudReady = !!stt?.apiKey && stt.provider !== 'local';
    const localReady = voiceboxOnlineRef.current;
    if (cloudReady || localReady) {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
        return;
      }
      void recordAndTranscribe();
      return;
    }
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      const desktop = !!(window as unknown as { umbraDesktop?: unknown }).umbraDesktop;
      setStatus({
        kind: 'error',
        text: desktop
          ? 'Voice needs speech-to-text — add a key in Settings, or start VoiceStudio/voicebox.'
          : 'voice recognition is not supported in this browser',
      });
      return;
    }
    addJournal('action', 'Listening…');
    const recog = new Ctor();
    recog.lang = 'en-US';
    recog.continuous = false;
    recog.interimResults = false;
    let heard = false;
    recog.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res && res.isFinal) {
          heard = true;
          const t = res[0].transcript.trim();
          if (t) handleIncomingRef.current(t);
        }
      }
    };
    recog.onend = () => {
      if (!heard) {
        setStatus({ kind: 'idle', text: introStepRef.current !== 'done' ? 'type your answer below…' : `say "${avatarNameRef.current}, open the brain" — or type below` });
      }
    };
    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus({ kind: 'error', text: 'microphone permission denied' });
      }
    };
    setStatus({ kind: 'wake', text: 'listening…' });
    recog.start();
  };

  const onWakeFinal = (text: string) => {
    if (brainRef.current.active) {
      const t = text.trim();
      wakeRef.current.buffer = '';
      if (t) handleIncomingRef.current(t);
      return;
    }
    if (introStepRef.current !== 'done') {
      const t = text.trim();
      if (t) {
        wakeRef.current.buffer = '';
        handleIncomingRef.current(t);
      }
      return;
    }
    const w = wakeRef.current;
    w.buffer = `${w.buffer} ${text}`.replace(/\s+/g, ' ').trim();
    const lower = w.buffer.toLowerCase();
    const name = avatarNameRef.current.toLowerCase();
    if (!w.armed) {
      const idx = lower.indexOf(name);
      if (idx >= 0) {
        w.armed = true;
        w.buffer = w.buffer.slice(idx + name.length).replace(/^[,.\s]+/, '');
        setStatus({ kind: 'armed', text: `${avatarNameRef.current}?` });
        speak(`Yes, ${avatarNameRef.current}?`);
      }
    }
    if (w.armed && w.buffer.trim()) {
      const handled = handleIncomingRef.current(w.buffer);
      if (handled) {
        w.armed = false;
        w.buffer = '';
      } else {
        speak("Sorry, I didn't catch that. Try: open the brain.");
        setStatus({ kind: 'wake', text: `listening for "${avatarNameRef.current}"…` });
        w.armed = false;
        w.buffer = '';
      }
    }
  };

  const beginBrainBuilding = () => {
    if (brainRef.current.active) return;
    brainRef.current = { active: true, index: 0, answers: [] };
    addJournal('action', 'Building the brain — let’s get to know you');
    const q = BRAIN_QUESTIONS[0];
    setStatus({ kind: 'busy', text: `tell me — ${q.short}` });
    speak(q.say);
  };

  const brainAnswer = (raw: string) => {
    const b = brainRef.current;
    const t = raw.trim();
    if (t) b.answers.push(t);
    b.index += 1;
    if (b.index >= BRAIN_QUESTIONS.length) {
      brainRef.current.active = false;
      try {
        localStorage.setItem(BRAIN_BUILD_KEY, '1');
      } catch {
        // ignore
      }
      const facts = BRAIN_QUESTIONS.map((q, i) => `${q.tag}: ${b.answers[i] ?? ''}`).filter((f) => !f.endsWith(': '));
      for (const f of facts) {
        if (f.includes(': ')) addFact(f);
      }
      try {
        addBrainFile(
          `brain_${Date.now()}.md`,
          `# What I know about you\n\n${BRAIN_QUESTIONS.map((q, i) => `## ${q.short}\n${b.answers[i] ?? '(skipped)'}`).join('\n\n')}`,
          'text/markdown'
        );
      } catch {
        // ignore
      }
      addJournal('action', 'Brain building complete — memory seeded');
      speak(`Done. I’ve written everything into your brain — say "${avatarNameRef.current}, open the brain" to see it grow.`);
      setStatus({ kind: 'idle', text: `say "${avatarNameRef.current}, open the brain" — or type below` });
    } else {
      const q = BRAIN_QUESTIONS[b.index];
      setStatus({ kind: 'busy', text: `tell me — ${q.short}` });
      speak(q.say);
    }
  };

  useEffect(() => {
    if (introStep !== 'done' || !profile) return;
    let done = false;
    try {
      done = localStorage.getItem(BRAIN_BUILD_KEY) === '1';
    } catch {
      // ignore
    }
    if (done || brainRef.current.active) return;
    const t = window.setTimeout(beginBrainBuilding, 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introStep, profile]);

  useEffect(() => {
    if (!talkAlwaysRef.current) {
      if (wakeOnRef.current) stopWakeRef.current();
      return;
    }
    if (introStep !== 'done') return;
    if (wakeOnRef.current) return;
    const t = window.setTimeout(() => {
      if (talkAlwaysRef.current && !wakeOnRef.current) startWakeRef.current();
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introStep, profile, talkAlways]);

  useEffect(() => {
    const ch = new BroadcastChannel('umbra-bar');
    barChannelRef.current = ch;
    ch.onmessage = (e: MessageEvent<{ type?: string; text?: string; on?: boolean }>) => {
      const m = e.data;
      if (!m) return;
      if (m.type === 'command' && typeof m.text === 'string') {
        handleIncomingRef.current(m.text);
      } else if (m.type === 'voice') {
        if (m.on === false) stopWakeRef.current();
        else if (m.on === true) startWakeRef.current();
      }
    };
    return () => {
      ch.close();
      barChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ch = barChannelRef.current;
    if (!ch) return;
    const s = isSpeaking ? 'speaking' : status.kind === 'busy' ? 'processing' : status.kind === 'wake' || status.kind === 'armed' ? 'listening' : 'idle';
    const key = `${s}|${status.text}`;
    if (key === lastBarPostRef.current) return;
    lastBarPostRef.current = key;
    ch.postMessage({ type: 'state', state: s, text: status.text });
  }, [status, isSpeaking]);

  const brainMode = brainRef.current.active;

  const runInput = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    handleIncomingRef.current(text);
  };

  const introMode = introStep !== 'done';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: 'transparent', touchAction: 'pan-y', userSelect: dragging ? 'none' : undefined }}
      onPointerDown={onWorkspacePointerDown}
      onPointerMove={onWorkspacePointerMove}
      onPointerUp={onWorkspacePointerUp}
      onPointerCancel={onWorkspacePointerUp}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '38px 38px' }}
      />

      <div
        className="absolute inset-0"
        style={{
          opacity: Math.max(0, 1 - slide * 1.2),
          transform: `translateX(${-slide * 70}px) scale(${1 - slide * 0.32})`,
          filter: slide > 0.6 ? `blur(${(slide - 0.6) * 10}px)` : 'none',
          transformOrigin: '50% 44%',
          pointerEvents: slide > 0.25 ? 'none' : 'auto',
        }}
      >
        <div ref={sphereRef} className="absolute inset-0" style={{ transformOrigin: 'center' }}>
          <div ref={pulseRef} className="absolute inset-0" style={{ transformOrigin: 'center' }}>
            <div className="absolute" style={{ left: 'calc(50% - 20vmin)', top: '40%' }}>
              {lastLine && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: '50%',
                    top: 0,
                    transform: 'translate(-50%, calc(-100% - 22vmin))',
                    zIndex: 200,
                  }}
                >
                  <div
                    className="relative rounded-2xl px-4 py-2.5 text-sm font-light leading-snug"
                    style={{
                      maxWidth: 'min(46vw, 460px)',
                      maxHeight: '16vh',
                      overflow: 'hidden',
                      background: 'rgba(10,12,16,0.92)',
                      border: `1px solid ${accent}55`,
                      color: 'var(--text-primary)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {lastLine}
                    <div
                      className="absolute"
                      style={{
                        left: '50%',
                        bottom: -5,
                        width: 10,
                        height: 10,
                        transform: 'translateX(-50%) rotate(45deg)',
                        background: 'rgba(10,12,16,0.92)',
                        borderRight: '1px solid var(--hairline-strong)',
                        borderBottom: '1px solid var(--hairline-strong)',
                      }}
                    />
                  </div>
                </div>
              )}
              {crew.map((agent, i) => {
                const o = i - focusIdx;
                const isMain = !agent;
                const acc = agent ? agent.accent : avatar.accent;
                const name = agent ? agent.name : avatarName;
                const isFocus = o === 0;
                const rad = (o * RING_SPREAD * Math.PI) / 180;
                const ringX = RING_RADIUS * Math.sin(rad);
                const ringY = RING_DIP * (1 - Math.cos(rad));
                const scale = isFocus ? 1.6 : Math.max(0.5, 0.62 - Math.abs(o) * 0.08);
                const op = isFocus ? 1 : Math.max(0.4, 0.85 - Math.abs(o) * 0.15);
                return (
                  <div
                    key={isMain ? 'main-agent' : agent.id}
                    onClick={() => {
                      if (clickGuardRef.current) return;
                      if (!isFocus) goAgent(agent ? agent.id : null);
                    }}
                    className="absolute"
                    style={{
                      width: SPHERE_D,
                      height: SPHERE_D,
                      left: 0,
                      top: 0,
                      transform: `translateX(${ringX.toFixed(2)}vmin) translateY(calc(-50% + ${ringY.toFixed(2)}vmin)) scale(${scale})`,
                      opacity: op,
                      zIndex: 100 - Math.abs(o),
                      transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease',
                      cursor: isFocus ? 'default' : 'pointer',
                    }}
                  >
                    <div className="relative w-full h-full">
                      <div
                        ref={isFocus ? spherePulseRef : undefined}
                        className="relative w-full h-full"
                        style={{ transformOrigin: '50% 50%' }}
                      >
                        {isFocus && (
                          <div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ background: `radial-gradient(circle, ${acc}2e 0%, transparent 62%)`, filter: 'blur(20px)' }}
                          />
                        )}
                        <ParticleSphere
                          particlesCount={isMain ? 12000 : 10000}
                          particleScale={isMain ? 7 : 5}
                          speed={isMain ? 18 : 14}
                          smoothing={4}
                          scale={isMain ? 5 : 4}
                          drag
                          dragSpeed={3}
                          stopOnHover
                          cursorOn={isFocus}
                          cursorRadiusUI={70}
                          cursorStrengthUI={10}
                          clickForce={4}
                          sphereColor={acc}
                        />
                      </div>
                    </div>
                    <div
                      className="absolute left-0 right-0 flex flex-col items-center"
                      style={{
                        top: '88%',
                        marginTop: 0,
                        pointerEvents: isFocus ? 'none' : 'auto',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isFocus && !clickGuardRef.current) goAgent(agent ? agent.id : null);
                      }}
                    >
                      <p
                        className="text-[13px] font-semibold uppercase tracking-widest text-center truncate max-w-full px-2"
                        style={{ color: isFocus ? acc : 'var(--text-faint)', fontFamily: 'var(--font)', textShadow: '0 1px 10px rgba(0,0,0,0.9)' }}
                      >
                        {name}
                      </p>
                      <p
                        className="text-[10px] font-light text-center truncate max-w-full px-2"
                        style={{ color: 'var(--text-faint)', fontFamily: 'var(--font)' }}
                      >
                        {agent ? agent.task : 'digital self'}
                      </p>
                    </div>
                    {agent && isFocus && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAgent(agent.id);
                        }}
                        className="absolute flex items-center justify-center rounded-full transition-transform hover:scale-110"
                        style={{
                          top: 8,
                          right: 8,
                          width: 28,
                          height: 28,
                          background: 'rgba(20,20,24,0.85)',
                          border: '1px solid rgba(255,138,138,0.4)',
                          color: '#FF8A8A',
                          backdropFilter: 'blur(10px)',
                          zIndex: 5,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        }}
                        title={`Delete ${agent.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {crew.length > 1 && (
        <>
          <button
            onClick={focusPrev}
            className="absolute flex items-center justify-center z-40"
            style={{
              left: 'calc(50% - 50vmin - 56px)',
              top: 'calc(50% - 2vmin)',
              transform: 'translateY(-50%)',
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--veil)',
              border: '1px solid var(--hairline-strong)',
              color: 'var(--text-dim)',
              backdropFilter: 'blur(16px)',
              opacity: 1 - slide,
              pointerEvents: slide > 0.3 ? 'none' : 'auto',
              transition: 'color 0.2s, opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            title="Previous agent (←)"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={focusNext}
            className="absolute flex items-center justify-center z-40"
            style={{
              right: 'calc(50% - 50vmin - 56px)',
              top: 'calc(50% - 2vmin)',
              transform: 'translateY(-50%)',
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--veil)',
              border: '1px solid var(--hairline-strong)',
              color: 'var(--text-dim)',
              backdropFilter: 'blur(16px)',
              opacity: 1 - slide,
              pointerEvents: slide > 0.3 ? 'none' : 'auto',
              transition: 'color 0.2s, opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            title="Next agent (→)"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 pointer-events-none" style={{ zIndex: 30 }}>
        <div className="flex items-center gap-2.5">
          {space ? (
            <button
              onClick={closeBrain}
              className="flex items-center gap-2 pointer-events-auto rounded-full px-4 transition-colors"
              style={{ height: 34, background: 'var(--veil)', border: `1px solid ${avatar.accent}66`, color: avatar.accent, backdropFilter: 'blur(16px)', fontFamily: 'var(--font)', fontSize: 12 }}
              title="Back to the agent"
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--veil)')}
            >
              <ChevronLeft size={15} />
              <span className="uppercase tracking-widest font-medium">Back · {space === 'brain' ? 'The Brain' : 'Devices'}</span>
            </button>
          ) : (
            <>
              <div className="w-6 h-6 rounded-full accent-fill flex items-center justify-center pointer-events-auto">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-lg font-bold uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {focusedAgent ? focusedAgent.name : avatarName}
              </h1>
              <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>
                {focusedAgent ? `crew agent · ${focusedAgent.task}` : 'digital self · v2.2'}
              </span>
              {focusedAgent && (
                <button
                  onClick={() => goAgent(null)}
                  className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full pointer-events-auto transition-colors"
                  style={{ color: accent, border: `1px solid ${accent}55`, background: `${accent}14` }}
                  title="Back to the main agent"
                  onMouseEnter={(e) => (e.currentTarget.style.background = `${accent}28`)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = `${accent}14`)}
                >
                  <ChevronLeft size={12} /> {avatarName}
                </button>
              )}
              {effConfig && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full pointer-events-auto" style={{ color: '#81C784', border: '1px solid rgba(129,199,132,0.3)' }}>
                  <Sparkles size={11} /> {providerById(effConfig.provider).label} engine
                </span>
              )}
              {introMode && (
                <span
                  className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full"
                  style={{ color: avatar.accent, border: `1px solid ${avatar.accent}44`, animation: 'pulse-dot 1.6s infinite' }}
                >
                  getting to know you
                </span>
              )}
              {isSpeaking && !introMode && (
                <span
                  className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full"
                  style={{ color: avatar.accent, border: `1px solid ${avatar.accent}44` }}
                >
                  <Volume2 size={11} /> speaking
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {!space && (
            <button
              className="btn-ghost flex items-center gap-1.5"
              style={{ height: 32, fontSize: 12, color: transcriptOpen ? avatar.accent : undefined }}
              onClick={() => setTranscriptOpen((o) => !o)}
              title="Crew conversation"
            >
              <MessageSquare size={12} /> {transcriptOpen ? 'Hide chat' : 'Chat'}
            </button>
          )}
          {isSpeaking && (
            <button className="btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={stopSpeaking}>
              <Square size={12} /> Stop
            </button>
          )}
        </div>
      </header>

      {!space && transcriptOpen && (
        <div
          className="absolute z-30 flex flex-col rounded-2xl overflow-hidden"
          style={{
            right: 16,
            top: 72,
            bottom: 128,
            width: 330,
            maxWidth: '34vw',
            background: 'rgba(10,11,14,0.84)',
            border: '1px solid var(--hairline-strong)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 hairline-b">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
              Crew conversation
            </p>
            <button
              onClick={() => setTranscriptOpen(false)}
              className="btn-ghost"
              style={{ width: 26, height: 26, padding: 0, color: 'var(--text-faint)' }}
              title="Hide"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {transcript.length === 0 && (
              <p className="text-xs font-light text-center py-6" style={{ color: 'var(--text-faint)' }}>
                Say something to start the conversation.
              </p>
            )}
            {transcript.map((e) => {
              const isUser = e.type === 'user';
              const isAction = e.type === 'action';
              return (
                <div key={e.id} className="flex flex-col">
                  <p
                    className="text-[10px] font-medium uppercase tracking-widest"
                    style={{ color: isUser ? accent : isAction ? 'var(--text-faint)' : avatar.accent }}
                  >
                    {isUser ? 'you' : isAction ? '·' : avatarName}
                  </p>
                  <p
                    className="text-[13px] leading-snug break-words"
                    style={{
                      color: isAction ? 'var(--text-faint)' : 'var(--text-primary)',
                      fontStyle: isAction ? 'italic' : undefined,
                      opacity: isAction ? 0.8 : 1,
                    }}
                  >
                    {e.text}
                  </p>
                </div>
              );
            })}
            <div ref={transcriptEndRef} />
          </div>
          {proposal && (
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid var(--hairline)' }}>
              <span className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                Spawn <span style={{ color: accent }}>{proposal.name}</span> — {proposal.task}? Say <b>yes</b>.
              </span>
            </div>
          )}
        </div>
      )}

      {!space && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: Math.max(0, 1 - slide * 1.1) }}>
          <div
            className="absolute flex items-center gap-1.5 rounded-full px-4"
            style={{ right: 24, top: '50%', transform: 'translateY(-50%)', height: 44, background: 'var(--veil)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', backdropFilter: 'blur(16px)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, zIndex: 30, pointerEvents: 'auto' }}
            onClick={openBrain}
            title="Open the brain — or drag right"
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${avatar.accent}88`)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--hairline-strong)')}
          >
            <span className="uppercase tracking-widest font-medium">Brain</span>
            <ChevronRight size={15} />
          </div>
        </div>
      )}

      {(space === 'brain' || slide > 0.005) && (
        <div
          className="absolute left-0 right-0 bottom-0 z-10"
          style={{
            top: 64,
            background: 'transparent',
            opacity: slide,
            transform: `scale(${0.45 + slide * 0.55})`,
            transformOrigin: '50% 40%',
            clipPath: `circle(${Math.max(0, slide * 100)}% at 50% 40%)`,
            pointerEvents: slide > 0.92 ? 'auto' : 'none',
          }}
        >
          <BrainView recallOpen={recallOpen} onRecallOpenChange={setRecallOpen} />
        </div>
      )}

      {!space && (
        <div
          className="absolute bottom-0 left-0 right-0 pb-7 px-6 pointer-events-none"
          style={{ opacity: Math.max(0, 1 - slide * 1.1), pointerEvents: slide > 0.3 ? 'none' : 'auto' }}
        >
        <div className="flex flex-col items-center gap-2.5" style={{ maxWidth: 620, margin: '0 auto' }}>
          <div className="flex items-center gap-2 pointer-events-auto w-full">
            <button
              className="flex-shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-105"
              style={{
                width: 44,
                height: 44,
                background: isRecording ? accent : 'var(--veil)',
                border: `1px solid ${isRecording ? accent : 'var(--hairline-strong)'}`,
                color: isRecording ? '#fff' : accent,
                boxShadow: isRecording ? `0 0 0 0 ${accent}66, 0 0 20px ${accent}44` : undefined,
              }}
              onClick={tapTalk}
              title={sttConfig?.apiKey ? (isRecording ? 'Stop recording' : 'Talk to Umbra — tap, speak, done') : 'Talk to Umbra — tap, speak, done'}
            >
              <Mic size={17} />
            </button>

            <button
              className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 transition-colors"
              style={{
                height: 44,
                background: wakeOn ? `${accent}1e` : 'var(--veil)',
                border: `1px solid ${wakeOn ? accent + '66' : 'var(--hairline-strong)'}`,
                color: wakeOn ? accent : 'var(--text-dim)',
                fontFamily: 'var(--font)',
                fontSize: 11,
              }}
              onClick={wakeOn ? stopWake : startWake}
              title={wakeOn ? 'Stop listening' : "Always listen — then just say your agent's name"}
            >
              <AudioLines size={15} />
              <span className="uppercase tracking-widest font-medium">{wakeOn ? 'wake · on' : 'wake'}</span>
            </button>

            <div
              className="flex items-center gap-3 flex-1 rounded-full px-5"
              style={{ height: 44, background: 'var(--surface-2)', border: `1px solid ${wakeOn ? accent + '55' : 'var(--hairline-strong)'}` }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runInput();
                }}
                placeholder={brainMode ? 'Answer to help build your brain…' : introMode ? 'Type or speak your answer…' : 'Say something to Umbra — or type here…'}
                className="bg-transparent outline-none text-sm flex-1 min-w-0"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
            </div>

            <button
              className="flex-shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-105"
              style={{ width: 44, height: 44, background: accent, color: '#fff', border: 'none' }}
              onClick={runInput}
              title="Send"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          <div
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-widest pointer-events-auto"
            style={{
              background: status.kind === 'error' ? 'rgba(255,90,90,0.12)' : 'var(--veil)',
              color: status.kind === 'error' ? '#FF8A8A' : status.kind === 'wake' || status.kind === 'armed' ? accent : 'var(--text-faint)',
              border: `1px solid ${status.kind === 'wake' || status.kind === 'armed' ? accent + '44' : status.kind === 'error' ? 'rgba(255,90,90,0.3)' : 'var(--hairline)'}`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: status.kind === 'wake' || status.kind === 'armed' ? accent : status.kind === 'error' ? '#FF6B6B' : 'var(--text-faint)',
                animation: status.kind === 'wake' || status.kind === 'armed' ? 'pulse-dot 1s infinite' : 'none',
              }}
            />
            {status.text}
          </div>

          {agents.length > 0 && (
            <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)', opacity: 0.5 }}>
              ◀ ▶ switch agents · drag right to open the brain
            </p>
          )}
        </div>
      </div>
      )}

      {namePrompt && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center"
          style={{ background: 'rgba(3,3,5,0.65)', backdropFilter: 'blur(8px)' }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && namePrompt.mode === 'new') setNamePrompt(null);
          }}
        >
          <div
            className="rounded-2xl p-6"
            style={{ width: 340, background: 'linear-gradient(180deg, rgba(18,20,26,0.95), rgba(8,9,12,0.98))', border: '1px solid var(--hairline-strong)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
              {namePrompt.mode === 'main' ? 'Name your agent' : 'New crew agent'}
            </p>
            <p className="text-xs font-light mt-1" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
              {namePrompt.mode === 'main'
                ? 'Give your digital self a name — you can change it later in settings.'
                : 'What should this agent be called?'}
            </p>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNamePrompt()}
              placeholder={namePrompt.mode === 'main' ? 'Umbra' : 'e.g. Atlas'}
              className="mt-4 w-full rounded-xl px-3 text-sm outline-none"
              style={{ height: 40, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
            {namePrompt.mode === 'new' && (
              <input
                value={taskDraft}
                onChange={(e) => setTaskDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNamePrompt()}
                placeholder="What should it do? (optional)"
                className="mt-2 w-full rounded-xl px-3 text-sm outline-none"
                style={{ height: 40, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
            )}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={submitNamePrompt}
                className="flex-1 rounded-xl text-sm font-medium transition-transform hover:scale-[1.02]"
                style={{ height: 40, background: accent, color: '#fff', fontFamily: 'var(--font)' }}
              >
                {namePrompt.mode === 'main' ? 'Start' : 'Create agent'}
              </button>
              {namePrompt.mode === 'new' && (
                <button
                  onClick={() => setNamePrompt(null)}
                  className="rounded-xl px-4 text-sm"
                  style={{ height: 40, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes task-ping {
          0% { transform: scale(1); opacity: 0.6; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes chat-dot {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        @keyframes chat-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
