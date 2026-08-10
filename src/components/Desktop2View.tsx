import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Box, Download, Play, Trash2, ArrowRight, LayoutGrid, MapPin, Wallet, Wrench, Film, CalendarClock, BookOpenText, PackagePlus, Sparkles } from 'lucide-react';

interface CompiledApp {
  id: string;
  name: string;
  desc: string;
  size: string;
  category: string;
  icon: typeof Box;
  installed: boolean;
}

const STORE: CompiledApp[] = [
  { id: 'sitemap', name: 'Sitemap Gen', desc: 'Crawl, cluster and emit sitemap.xml for 10k pages', size: '4.2 MB', category: 'SEO', icon: LayoutGrid, installed: true },
  { id: 'gps', name: 'GeoRouter', desc: 'Agency territory GPS — clients & routes on a map', size: '9.1 MB', category: 'Ops', icon: MapPin, installed: true },
  { id: 'bank', name: 'CashFlowPro', desc: 'Smart invoicing + liquidity forecasting', size: '6.8 MB', category: 'Finance', icon: Wallet, installed: false },
  { id: 'probe', name: 'SkillProbe', desc: 'Compile any skillset into a standalone .exe', size: '1.2 MB', category: 'Dev', icon: Wrench, installed: true },
  { id: 'dub', name: 'DubStudio', desc: 'Offline video dubbing in 40+ languages', size: '38.4 MB', category: 'Media', icon: Film, installed: false },
  { id: 'deadlines', name: 'Deadline Guard', desc: 'Fiscal calendar — alerts at every deadline', size: '2.7 MB', category: 'Tax', icon: CalendarClock, installed: true },
  { id: 'kb', name: 'KB Builder', desc: 'Turn resolved tickets into searchable docs', size: '3.9 MB', category: 'Support', icon: BookOpenText, installed: false },
];

const META = [
  { label: 'Installed exes', value: '4' },
  { label: 'Total size', value: '17.2 MB' },
  { label: 'Last compile', value: 'tax-ai v2.4' },
];

export function Desktop2View() {
  const { avatar, setView } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [apps, setApps] = useState<CompiledApp[]>(STORE);
  const [selected, setSelected] = useState<string | null>('probe');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current.querySelectorAll('.d2-block'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.05 }, '-=0.15');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  const install = (id: string) => {
    setApps((cur) => cur.map((a) => (a.id === id ? { ...a, installed: !a.installed } : a)));
    setFlash(id);
    setTimeout(() => setFlash(null), 1200);
  };

  const remove = (id: string) => {
    setApps((cur) => cur.filter((a) => a.id !== id));
    if (selected === id) setSelected(null);
  };

  const sel = apps.find((a) => a.id === selected);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, #0c0d14 0%, #07080d 100%)' }}>
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Desktop 2 · Local Store</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Skills compiled to native .exe — offline, always-on, zero latency
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }} onClick={() => setView('skills')}>
            <PackagePlus size={13} /> Compile a skill
          </button>
          <button className="btn-ghost flex items-center gap-1.5" style={{ height: 34, fontSize: 12 }} onClick={() => setView('devices')}>
            Sync <ArrowRight size={12} />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {META.map((m) => (
            <div key={m.label} className="d2-block card px-4 py-3" style={{ background: 'var(--surface-1)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-faint)' }}>{m.label}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          <div className="d2-block md:col-span-3 space-y-2">
            {apps.map((a) => {
              const Icon = a.icon;
              const isSel = selected === a.id;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  className="card flex items-center gap-3 px-4 py-3 group cursor-pointer"
                  style={{
                    background: isSel ? `linear-gradient(90deg, ${avatar.accent}12, transparent)` : 'var(--surface-1)',
                    border: isSel ? `1px solid ${avatar.accent}55` : '1px solid var(--hairline)',
                    transition: 'border 0.15s',
                  }}
                >
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                    <Icon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{a.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>{a.category}</span>
                    </div>
                    <p className="text-[11px] font-light mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>{a.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{a.size}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); install(a.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium flex-shrink-0"
                    style={{
                      background: a.installed ? `${avatar.accent}1c` : avatar.accent,
                      color: a.installed ? avatar.accent : '#fff',
                      border: `1px solid ${a.installed ? `${avatar.accent}44` : 'transparent'}`,
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {flash === a.id ? <Sparkles size={11} /> : a.installed ? <Box size={11} /> : <Download size={11} />}
                    {flash === a.id ? 'Done' : a.installed ? 'Installed' : 'Install'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(a.id); }}
                    className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#ef4444' }}
                    title="Remove"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
            {apps.length === 0 && (
              <p className="text-sm font-light text-center py-12" style={{ color: 'var(--text-faint)' }}>Store is empty — compile your first skill into a native exe.</p>
            )}
          </div>

          <div className="d2-block md:col-span-2">
            <div className="card p-5 mb-4" style={{ background: 'var(--surface-1)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Preview</p>
              {sel ? (
                <div className="text-center">
                  <span className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
                    <sel.icon size={26} />
                  </span>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{sel.name}</p>
                  <p className="text-[11px] font-light mt-1 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{sel.desc}</p>
                  <button className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
                    <Play size={14} /> {sel.installed ? 'Launch exe' : 'Install & launch'}
                  </button>
                </div>
              ) : (
                <p className="text-xs font-light text-center py-10" style={{ color: 'var(--text-faint)' }}>Select an app to preview it.</p>
              )}
            </div>
            <div className="card p-4" style={{ background: `linear-gradient(135deg, ${avatar.accent}14, transparent)`, border: `1px solid ${avatar.accent}33` }}>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>How compilation works</p>
              <p className="text-[11px] font-light mt-1.5 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
                Any skill in the Skills page can be frozen into a native binary by the SkillProbe compiler — pinned outputs, embedded models and full offline behavior, signed and synced to all devices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
