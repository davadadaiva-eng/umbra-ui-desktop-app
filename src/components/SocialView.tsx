import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import {
  isBackendAvailable, socialPostFull, socialSchedule,
  getSocialSchedule, cancelSocialSchedule, socialStatus,
  BackendError,
} from '../lib/backend';
import {
  Share2, Send, Clock, XCircle, Loader2, Play, Camera,
  Wifi, WifiOff, CalendarX, Trash2, Check,
} from 'lucide-react';

type Platform = 'X' | 'YouTube' | 'Instagram';

interface ScheduledPost {
  id: string;
  platform: string;
  text?: string;
  title?: string;
  description?: string;
  scheduledAt: number;
  status: string;
}

const PLATFORM_META: Record<Platform, { icon: typeof XCircle; color: string; bg: string; label: string }> = {
  X: { icon: XCircle, color: '#fff', bg: '#1a1a1a', label: 'X / Twitter' },
  YouTube: { icon: Play, color: '#FF0000', bg: '#FF000018', label: 'YouTube' },
  Instagram: { icon: Camera, color: '#E4405F', bg: '#E4405F18', label: 'Instagram' },
};

export function SocialView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [statusData, setStatusData] = useState<Record<string, unknown>>({});

  const [platform, setPlatform] = useState<Platform>('X');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postDesc, setPostDesc] = useState('');

  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(
          bodyRef.current.querySelectorAll('.social-block'),
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, stagger: 0.05 },
          '-=0.15',
        );
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  // Check backend + status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const online = await isBackendAvailable();
      if (cancelled) return;
      setBackendOnline(online);
      if (online) {
        try {
          const s = await socialStatus();
          if (!cancelled) setStatusData(s as Record<string, unknown>);
        } catch { /* keep empty */ }
        loadScheduled();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadScheduled = async () => {
    setLoadingScheduled(true);
    try {
      if (!(await isBackendAvailable())) return;
      const data = await getSocialSchedule();
      setScheduledPosts((data.scheduled ?? []) as ScheduledPost[]);
    } catch { /* keep empty */ }
    setLoadingScheduled(false);
  };

  const handlePost = async () => {
    if (!postContent.trim() || !email.trim() || !password.trim()) return;
    setPosting(true);
    setPostResult(null);
    try {
      await socialPostFull({
        platform,
        action: 'post',
        email: email.trim(),
        password: password.trim(),
        text: postContent.trim(),
        ...(platform === 'YouTube' ? { title: postTitle.trim(), description: postDesc.trim() } : {}),
      });
      setPostResult({ ok: true, msg: `Posted to ${platform} successfully` });
      setPostContent('');
      setPostTitle('');
      setPostDesc('');
    } catch (e) {
      const msg = e instanceof BackendError ? e.message : (e as Error).message;
      setPostResult({ ok: false, msg });
    }
    setPosting(false);
  };

  const handleSchedule = async () => {
    if (!postContent.trim() || !email.trim() || !password.trim() || !scheduleAt) return;
    setScheduling(true);
    setScheduleResult(null);
    try {
      const ts = new Date(scheduleAt).getTime();
      if (isNaN(ts) || ts <= Date.now()) {
        setScheduleResult({ ok: false, msg: 'Scheduled time must be in the future' });
        setScheduling(false);
        return;
      }
      await socialSchedule({
        platform,
        action: 'post',
        email: email.trim(),
        password: password.trim(),
        text: postContent.trim(),
        ...(platform === 'YouTube' ? { title: postTitle.trim(), description: postDesc.trim() } : {}),
        scheduledAt: ts,
      });
      setScheduleResult({ ok: true, msg: `Scheduled for ${new Date(ts).toLocaleString()}` });
      setScheduleAt('');
      loadScheduled();
    } catch (e) {
      const msg = e instanceof BackendError ? e.message : (e as Error).message;
      setScheduleResult({ ok: false, msg });
    }
    setScheduling(false);
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      if (await isBackendAvailable()) {
        await cancelSocialSchedule(id);
        setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch { /* keep list as-is */ }
    setCancellingId(null);
  };

  const statusLabel = backendOnline === null ? 'Checking…' : backendOnline ? 'Online' : 'Offline';
  const statusColor = backendOnline === null ? 'var(--text-faint)' : backendOnline ? '#22c55e' : '#ef4444';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        ref={headerRef}
        className="px-6 py-5 hairline-b flex items-end justify-between gap-4"
        style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      >
        <div>
          <h1
            className="hero-heading font-black uppercase tracking-tight leading-none"
            style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}
          >
            Social Media
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Post, schedule, and manage social automation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg"
            style={{
              background: backendOnline ? '#22c55e1c' : 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              color: statusColor,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: statusColor,
                boxShadow: backendOnline ? '0 0 8px rgba(34,197,94,0.9)' : 'none',
              }}
            />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="flex-1 overflow-y-auto px-6 py-5"
        style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}
      >
        {/* Status card */}
        <div
          className="social-block card p-5 mb-5"
          style={{ background: 'var(--surface-1)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: backendOnline ? '#22c55e' : '#ef4444', color: '#fff' }}
            >
              {backendOnline ? <Share2 size={16} /> : <WifiOff size={16} />}
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Automation Backend
              </p>
              <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                {backendOnline === null
                  ? 'Checking connection…'
                  : backendOnline
                    ? `Connected · ${Object.keys(statusData).length > 0 ? 'Social module loaded' : 'Health OK'}`
                    : 'Backend not reachable — start the server'}
              </p>
            </div>
            {backendOnline && (
              <span className="ml-auto flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg" style={{ background: '#22c55e16', border: '1px solid #22c55e44', color: '#22c55e' }}>
                <Wifi size={12} /> Live
              </span>
            )}
          </div>
          {Object.keys(statusData).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {Object.entries(statusData).slice(0, 6).map(([k, v]) => {
                // The backend reports sessions as { x: bool, youtube: bool, … }.
                if (k === 'sessions' && v !== null && typeof v === 'object') {
                  const sessions = v as Record<string, unknown>;
                  const names: Record<string, string> = {
                    x: 'X / Twitter',
                    youtube: 'YouTube',
                    instagram: 'Instagram',
                    threads: 'Threads',
                    linkedin: 'LinkedIn',
                    tiktok: 'TikTok',
                  };
                  return (
                    <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--hairline)' }}>
                      <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-faint)' }}>Sessions</p>
                      <div className="mt-1.5 space-y-1">
                        {Object.entries(sessions).map(([p, on]) => {
                          const label = names[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
                          return (
                            <div key={p} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-dim)' }}>{label}</span>
                              <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: on ? '#22c55e' : '#64748b' }}>
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: on ? '#22c55e' : '#475569',
                                    boxShadow: on ? '0 0 6px rgba(34,197,94,0.8)' : 'none',
                                  }}
                                />
                                {on ? 'Connected' : 'Offline'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                const isObject = v !== null && typeof v === 'object';
                return (
                  <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--hairline)' }}>
                    <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-faint)' }}>{k}</p>
                    <p className="text-xs font-medium mt-0.5 truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                      {isObject ? JSON.stringify(v) : String(v)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Platform selector */}
        <div className="social-block flex gap-2 mb-4">
          {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
            const meta = PLATFORM_META[p];
            const Icon = meta.icon;
            const active = platform === p;
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: active ? meta.bg : 'var(--surface-2)',
                  border: `1px solid ${active ? `${meta.color}44` : 'var(--hairline-strong)'}`,
                  color: active ? meta.color : 'var(--text-dim)',
                  fontFamily: 'var(--font)',
                }}
              >
                <Icon size={15} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Post composer */}
          <div className="social-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Compose Post
              </p>
              <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>{platform}</span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="account@email.com"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Content</label>
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              </div>

              {platform === 'YouTube' && (
                <>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Video Title</label>
                    <input
                      value={postTitle}
                      onChange={(e) => setPostTitle(e.target.value)}
                      placeholder="Video title"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Description</label>
                    <textarea
                      value={postDesc}
                      onChange={(e) => setPostDesc(e.target.value)}
                      placeholder="Video description"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                    />
                  </div>
                </>
              )}

              {postResult && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
                  style={{
                    background: postResult.ok ? '#22c55e16' : 'rgba(255,90,90,0.1)',
                    border: `1px solid ${postResult.ok ? '#22c55e44' : 'rgba(255,90,90,0.3)'}`,
                    color: postResult.ok ? '#22c55e' : '#FF8A8A',
                  }}
                >
                  {postResult.ok ? <Check size={12} /> : <XCircle size={12} />}
                  {postResult.msg}
                </div>
              )}

              <button
                onClick={handlePost}
                disabled={posting || !postContent.trim() || !email.trim() || !password.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
                style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
              >
                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {posting ? 'Posting…' : `Post to ${platform}`}
              </button>
            </div>
          </div>

          {/* Schedule */}
          <div className="social-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                Schedule Post
              </p>
              <Clock size={14} style={{ color: 'var(--text-faint)' }} />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="account@email.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Content</label>
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Post content to schedule…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-semibold mb-1 block" style={{ color: 'var(--text-faint)' }}>Scheduled Time</label>
                <input
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  type="datetime-local"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
                />
              </div>

              {scheduleResult && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
                  style={{
                    background: scheduleResult.ok ? '#22c55e16' : 'rgba(255,90,90,0.1)',
                    border: `1px solid ${scheduleResult.ok ? '#22c55e44' : 'rgba(255,90,90,0.3)'}`,
                    color: scheduleResult.ok ? '#22c55e' : '#FF8A8A',
                  }}
                >
                  {scheduleResult.ok ? <Check size={12} /> : <XCircle size={12} />}
                  {scheduleResult.msg}
                </div>
              )}

              <button
                onClick={handleSchedule}
                disabled={scheduling || !postContent.trim() || !email.trim() || !password.trim() || !scheduleAt}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
                style={{ background: '#38bdf8', color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
              >
                {scheduling ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                {scheduling ? 'Scheduling…' : 'Schedule Post'}
              </button>
            </div>
          </div>
        </div>

        {/* Scheduled posts list */}
        <div className="social-block card p-5 mt-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
              Scheduled Posts
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-light" style={{ color: 'var(--text-faint)' }}>
                {scheduledPosts.length} pending
              </span>
              <button
                onClick={loadScheduled}
                disabled={loadingScheduled}
                className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}
                title="Refresh"
              >
                <Loader2 size={12} className={loadingScheduled ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {loadingScheduled && scheduledPosts.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: avatar.accent }} />
              <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Loading scheduled posts…</span>
            </div>
          ) : scheduledPosts.length === 0 ? (
            <div className="text-center py-8">
              <CalendarX size={24} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
              <p className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>No scheduled posts</p>
              <p className="text-[11px] font-light mt-1" style={{ color: '#555' }}>Use the schedule card above to queue posts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scheduledPosts.map((post) => {
                const pMeta = PLATFORM_META[(post.platform as Platform) ?? 'X'] ?? PLATFORM_META.X;
                const Icon = pMeta.icon;
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: pMeta.bg, color: pMeta.color, border: `1px solid ${pMeta.color}33` }}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                        {post.text ?? post.title ?? 'Untitled'}
                      </p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                        {new Date(post.scheduledAt).toLocaleString()} · {post.status}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancel(post.id)}
                      disabled={cancellingId === post.id}
                      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#ef4444' }}
                      title="Cancel"
                    >
                      {cancellingId === post.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Trash2 size={11} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
