import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, listDockerContainers, dockerRun, dockerStop, dockerRemove,
} from '../lib/backend';
import {
  Container, Play, Square, Trash2, Plus, RefreshCw, Loader2,
  ChevronDown, ChevronUp, X, AlertCircle, ServerCrash,
} from 'lucide-react';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports?: string;
}

export function DockerView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [runName, setRunName] = useState('');
  const [runImage, setRunImage] = useState('');
  const [runCommand, setRunCommand] = useState('');
  const [running, setRunning] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!(await isBackendAvailable())) {
        setError('Backend not available');
        setLoading(false);
        return;
      }
      const data = await listDockerContainers();
      const list = (data.containers ?? []) as DockerContainer[];
      setContainers(list);
    } catch (e) {
      setError((e as Error).message || 'Failed to load containers');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (listRef.current) {
        tl.fromTo(
          listRef.current.querySelectorAll('.docker-card'),
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, stagger: 0.04 },
          '-=0.15',
        );
      }
    }, [headerRef, listRef]);
    return () => ctx.revert();
  }, [containers, loading]);

  const handleRun = async () => {
    if (!runImage.trim()) return;
    setRunning(true);
    setError('');
    try {
      if (!(await isBackendAvailable())) {
        setError('Backend not available');
        setRunning(false);
        return;
      }
      await dockerRun({
        name: runName.trim() || `worker-${Date.now()}`,
        image: runImage.trim(),
        command: runCommand.trim() ? runCommand.trim().split(/\s+/) : undefined,
      });
      setRunName('');
      setRunImage('');
      setRunCommand('');
      await fetchContainers();
    } catch (e) {
      setError((e as Error).message || 'Failed to run container');
    }
    setRunning(false);
  };

  const handleStop = async (name: string) => {
    setActionLoading(name);
    setError('');
    try {
      if (!(await isBackendAvailable())) {
        setError('Backend not available');
        setActionLoading(null);
        return;
      }
      await dockerStop(name);
      await fetchContainers();
    } catch (e) {
      setError((e as Error).message || 'Failed to stop container');
    }
    setActionLoading(null);
  };

  const handleRemove = async (name: string) => {
    setActionLoading(name);
    setError('');
    try {
      if (!(await isBackendAvailable())) {
        setError('Backend not available');
        setActionLoading(null);
        return;
      }
      await dockerRemove(name);
      await fetchContainers();
    } catch (e) {
      setError((e as Error).message || 'Failed to remove container');
    }
    setActionLoading(null);
  };

  const runningContainers = containers.filter((c) => c.state === 'running');
  const stoppedContainers = containers.filter((c) => c.state !== 'running');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Docker Workers</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {containers.length === 0 ? 'No containers' : `${runningContainers.length} running · ${stoppedContainers.length} stopped`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchContainers} disabled={loading}
            className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium"
            style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <span className="flex items-center gap-1.5 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <Container size={13} style={{ color: avatar.accent }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font)' }}>{containers.length}</span>
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]" style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}>
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto" style={{ color: '#FF8A8A' }}><X size={12} /></button>
        </div>
      )}

      {/* Body */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        {/* Loading state */}
        {loading && containers.length === 0 && (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 size={16} className="animate-spin" style={{ color: avatar.accent }} />
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Loading containers…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && containers.length === 0 && !error && (
          <div className="docker-card text-center py-16">
            <ServerCrash size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 16px' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>No containers yet</p>
            <p className="text-xs font-light" style={{ color: 'var(--text-dim)' }}>Run your first container below to get started.</p>
          </div>
        )}

        {/* Running containers */}
        {runningContainers.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Running</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{runningContainers.length}</span>
            </div>
            <div className="space-y-2 mb-6">
              {runningContainers.map((c) => (
                <div key={c.id} className="docker-card card p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)' }}>
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#22C55E16', color: '#22C55E', border: '1px solid #22C55E44' }}>
                      <Container size={15} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{c.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: '#22C55E14', border: '1px solid #22C55E33', color: '#22C55E' }}>running</span>
                      </div>
                      <p className="text-[11px] font-light truncate mt-0.5" style={{ color: 'var(--text-dim)' }}>{c.image}</p>
                    </div>
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      className="flex items-center justify-center rounded-md"
                      style={{ width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-faint)', cursor: 'pointer' }}>
                      {expanded === c.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button onClick={() => handleStop(c.name)} disabled={actionLoading === c.id}
                      className="flex items-center justify-center rounded-md"
                      style={{ width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#F59E0B', cursor: 'pointer', opacity: actionLoading === c.id ? 0.4 : 1 }}>
                      {actionLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                    </button>
                    <button onClick={() => handleRemove(c.name)} disabled={actionLoading === c.id}
                      className="flex items-center justify-center rounded-md"
                      style={{ width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#EF4444', cursor: 'pointer', opacity: actionLoading === c.id ? 0.4 : 1 }}>
                      {actionLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                  {expanded === c.id && (
                    <div className="mt-3 pt-3 grid grid-cols-2 gap-3 text-[11px]" style={{ borderTop: '1px solid var(--hairline)' }}>
                      <div>
                        <span className="font-medium block" style={{ color: 'var(--text-faint)' }}>Container ID</span>
                        <span className="font-mono truncate block" style={{ color: 'var(--text-dim)' }}>{c.id.slice(0, 12)}</span>
                      </div>
                      <div>
                        <span className="font-medium block" style={{ color: 'var(--text-faint)' }}>Image</span>
                        <span className="font-mono truncate block" style={{ color: 'var(--text-dim)' }}>{c.image}</span>
                      </div>
                      <div>
                        <span className="font-medium block" style={{ color: 'var(--text-faint)' }}>Status</span>
                        <span style={{ color: 'var(--text-dim)' }}>{c.status}</span>
                      </div>
                      <div>
                        <span className="font-medium block" style={{ color: 'var(--text-faint)' }}>Created</span>
                        <span style={{ color: 'var(--text-dim)' }}>{c.created}</span>
                      </div>
                      {c.ports && (
                        <div className="col-span-2">
                          <span className="font-medium block" style={{ color: 'var(--text-faint)' }}>Ports</span>
                          <span className="font-mono block" style={{ color: 'var(--text-dim)' }}>{c.ports}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Stopped containers */}
        {stoppedContainers.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-faint)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Stopped</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{stoppedContainers.length}</span>
            </div>
            <div className="space-y-2 mb-6">
              {stoppedContainers.map((c) => (
                <div key={c.id} className="docker-card card p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)' }}>
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--hairline-strong)' }}>
                      <Container size={15} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{c.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{c.state}</span>
                      </div>
                      <p className="text-[11px] font-light truncate mt-0.5" style={{ color: 'var(--text-dim)' }}>{c.image}</p>
                    </div>
                    <button onClick={() => handleRemove(c.name)} disabled={actionLoading === c.id}
                      className="flex items-center justify-center rounded-md"
                      style={{ width: 28, height: 28, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#EF4444', cursor: 'pointer', opacity: actionLoading === c.id ? 0.4 : 1 }}>
                      {actionLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Run new container */}
        <div className="docker-card card p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)' }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${avatar.accent}16`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
              <Plus size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Run New Container</p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>Start a new worker container</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Container Name</label>
              <input value={runName} onChange={(e) => setRunName(e.target.value)}
                placeholder="my-worker"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Image *</label>
              <input value={runImage} onChange={(e) => setRunImage(e.target.value)}
                placeholder="nginx:alpine"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Command (optional)</label>
              <input value={runCommand} onChange={(e) => setRunCommand(e.target.value)}
                placeholder="serve --port 8080"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
            </div>
          </div>
          <button onClick={handleRun} disabled={running || !runImage.trim()}
            className="flex items-center justify-center gap-1.5 px-5 rounded-xl text-[11px] font-medium disabled:opacity-40"
            style={{ height: 38, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Starting…' : 'Run Container'}
          </button>
        </div>
      </div>
    </div>
  );
}
