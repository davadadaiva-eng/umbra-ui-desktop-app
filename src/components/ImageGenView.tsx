import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { isBackendAvailable, generateImage, type BackendError } from '../lib/backend';
import { Image, Sparkles, Download, Settings, Loader2, X, Clock, Wand2, Maximize2 } from 'lucide-react';

interface GeneratedImage {
  id: string;
  /** Absolute path of the PNG the backend wrote (e.g. ~/.umbra/images/…). */
  imagePath: string;
  /** Data URL loaded through the Electron bridge so the image can be displayed. */
  dataUrl: string | null;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  createdAt: string;
}

function bridge() {
  return (window as unknown as { umbraDesktop?: { readImageFile?: (p: string) => Promise<string | null> } }).umbraDesktop;
}

const WIDTH_OPTIONS = [256, 384, 512, 640, 768, 1024];
const HEIGHT_OPTIONS = [256, 384, 512, 640, 768, 1024];
const STEP_OPTIONS = [10, 15, 20, 25, 30, 40, 50];

export function ImageGenView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [steps, setSteps] = useState(25);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(
          bodyRef.current.querySelectorAll('.ig-card'),
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, stagger: 0.06 },
          '-=0.15'
        );
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setError('');
    setGenerating(true);

    try {
      const available = await isBackendAvailable();
      if (!available) {
        setError('Backend not available. Make sure the server is running.');
        setGenerating(false);
        return;
      }

      const result = await generateImage(trimmed, { width, height, steps });
      const imagePath = result.image?.imagePath;
      if (!imagePath) throw new Error('Backend returned no image path');
      // The backend writes the PNG to a local file; load it through Electron.
      let dataUrl: string | null = null;
      try {
        dataUrl = (await bridge()?.readImageFile?.(imagePath)) ?? null;
      } catch {
        dataUrl = null;
      }
      const newImage: GeneratedImage = {
        id: crypto.randomUUID(),
        imagePath,
        dataUrl,
        prompt: trimmed,
        width,
        height,
        steps,
        createdAt: new Date().toISOString(),
      };
      setHistory((prev) => [newImage, ...prev]);
    } catch (e) {
      const err = e as BackendError;
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (image: GeneratedImage) => {
    const url = image.dataUrl;
    if (!url) {
      alert(`Image saved on disk:\n${image.imagePath}`);
      return;
    }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `umbra-${image.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      alert(`Image saved on disk:\n${image.imagePath}`);
    }
  };

  const latestImage = history.length > 0 ? history[0] : null;

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
            Image Generation
          </h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Create images from text prompts — {width}×{height} · {steps} steps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium"
            style={{
              height: 34,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline-strong)',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font)',
            }}
          >
            <Clock size={12} /> {history.length} generated
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-6 mt-3 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[11px]"
          style={{ background: 'rgba(255,90,90,0.1)', border: '1px solid rgba(255,90,90,0.3)', color: '#FF8A8A' }}
        >
          <X size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto" style={{ color: '#FF8A8A' }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column: Prompt + Settings */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            {/* Prompt card */}
            <div className="ig-card card p-4" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${avatar.accent}1c`,
                    color: avatar.accent,
                    border: `1px solid ${avatar.accent}44`,
                  }}
                >
                  <Wand2 size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    Prompt
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    Describe the image you want
                  </p>
                </div>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A futuristic cityscape at sunset, cyberpunk style, neon lights reflecting on wet streets..."
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--hairline-strong)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
                }}
              />
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
                style={{
                  background: avatar.accent,
                  color: '#fff',
                  border: 'none',
                  fontFamily: 'var(--font)',
                }}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Generate Image
                  </>
                )}
              </button>
              <p className="text-[10px] font-light text-center mt-2" style={{ color: 'var(--text-faint)' }}>
                Ctrl+Enter to generate
              </p>
            </div>

            {/* Settings card */}
            <div className="ig-card card p-4" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}
                >
                  <Settings size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    Settings
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    Configure generation parameters
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {/* Width */}
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-faint)' }}>
                    Width
                  </label>
                  <select
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--hairline-strong)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {WIDTH_OPTIONS.map((w) => (
                      <option key={w} value={w}>{w}px</option>
                    ))}
                  </select>
                </div>
                {/* Height */}
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-faint)' }}>
                    Height
                  </label>
                  <select
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--hairline-strong)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {HEIGHT_OPTIONS.map((h) => (
                      <option key={h} value={h}>{h}px</option>
                    ))}
                  </select>
                </div>
                {/* Steps */}
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-widest mb-1 block" style={{ color: 'var(--text-faint)' }}>
                    Steps
                  </label>
                  <select
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--hairline-strong)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {STEP_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Generated images + History */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Generated image display */}
            <div className="ig-card card overflow-hidden" style={{ background: 'var(--surface-1)' }}>
              <div className="px-4 py-3 flex items-center justify-between hairline-b" style={{ borderColor: 'var(--hairline)' }}>
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}
                  >
                    <Image size={15} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                      Generated Image
                    </p>
                    <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                      {latestImage ? `${latestImage.width}×${latestImage.height} · ${latestImage.steps} steps` : 'No image yet'}
                    </p>
                  </div>
                </div>
                {latestImage && (
                  <button
                    onClick={() => handleDownload(latestImage)}
                    className="flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-medium"
                    style={{
                      height: 30,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--hairline-strong)',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    <Download size={12} /> Download
                  </button>
                )}
              </div>
              <div className="p-4 flex items-center justify-center" style={{ minHeight: 280 }}>
                {generating ? (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <div className="relative">
                      <Loader2 size={32} className="animate-spin" style={{ color: avatar.accent }} />
                      <Sparkles
                        size={14}
                        className="absolute"
                        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: avatar.accent }}
                      />
                    </div>
                    <p className="text-sm font-light" style={{ color: 'var(--text-dim)' }}>
                      Generating your image…
                    </p>
                    <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                      {width}×{height} · {steps} steps
                    </p>
                  </div>
                ) : latestImage ? (
                  <div className="w-full">
                    <div
                      className="rounded-xl overflow-hidden relative group"
                      style={{ border: '1px solid var(--hairline-strong)', background: 'var(--surface-2)' }}
                    >
                      {latestImage.dataUrl ? (
                        <img
                          src={latestImage.dataUrl}
                          alt={latestImage.prompt}
                          className="w-full h-auto block"
                          style={{ maxHeight: 480, objectFit: 'contain' }}
                        />
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-[11px] font-mono break-all" style={{ color: 'var(--text-dim)' }}>{latestImage.imagePath}</p>
                          <p className="text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>
                            Run inside the desktop app to preview the image inline.
                          </p>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-end justify-between"
                        style={{
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
                      >
                        <p className="text-xs font-light truncate max-w-[70%]" style={{ color: 'rgba(255,255,255,0.85)' }}>
                          {latestImage.prompt}
                        </p>
                        <div className="flex items-center gap-2">
                          <Maximize2 size={12} style={{ color: 'rgba(255,255,255,0.6)' }} />
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {latestImage.width}×{latestImage.height}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                      style={{
                        background: `${avatar.accent}0e`,
                        border: `1px dashed ${avatar.accent}33`,
                        color: avatar.accent,
                      }}
                    >
                      <Image size={28} />
                    </div>
                    <p className="text-sm font-light" style={{ color: 'var(--text-faint)' }}>
                      Enter a prompt and click Generate
                    </p>
                    <p className="text-[10px] font-light mt-1" style={{ color: '#333' }}>
                      Your image will appear here
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* History card */}
            <div className="ig-card card p-4" style={{ background: 'var(--surface-1)' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}
                >
                  <Clock size={15} />
                </span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                    History
                  </p>
                  <p className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    {history.length === 0 ? 'No images generated yet' : `${history.length} image${history.length !== 1 ? 's' : ''} in this session`}
                  </p>
                </div>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>
                    Generated images will appear here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {history.map((img) => (
                    <div
                      key={img.id}
                      className="rounded-xl overflow-hidden relative group cursor-pointer"
                      style={{ border: '1px solid var(--hairline-strong)', background: 'var(--surface-2)' }}
                      onClick={() => handleDownload(img)}
                    >
                      {img.dataUrl ? (
                        <img
                          src={img.dataUrl}
                          alt={img.prompt}
                          className="w-full h-28 object-cover block"
                        />
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                          <Image size={16} style={{ color: 'var(--text-faint)' }} />
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-light truncate" style={{ color: 'var(--text-dim)' }}>
                          {img.prompt}
                        </p>
                        <p className="text-[9px] font-light mt-0.5" style={{ color: 'var(--text-faint)' }}>
                          {img.width}×{img.height} · {img.steps} steps
                        </p>
                      </div>
                      <div
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
                      >
                        <Download size={11} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
