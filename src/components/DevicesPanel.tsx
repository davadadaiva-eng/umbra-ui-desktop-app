import { useState } from 'react';
import { Smartphone, Tablet, Headphones, Watch, Battery, QrCode, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

const devices = [
  { id: 'pixel', name: 'Pixel 8 Pro', type: 'Phone', status: 'Connected', battery: 78, os: 'Android 15', icon: 'phone' },
  { id: 'ipad', name: 'iPad Pro M4', type: 'Tablet', status: 'Connected', battery: 42, os: 'iPadOS 18', icon: 'tablet' },
  { id: 'pixelbuds', name: 'Pixel Buds Pro 2', type: 'Audio', status: 'Connected', battery: 91, os: '—', icon: 'audio' },
  { id: 'watch', name: 'Pixel Watch 3', type: 'Wearable', status: 'Idle', battery: 33, os: 'Wear OS 5', icon: 'watch' },
];

const initialQueue = [
  { from: 'Pixel 8 Pro', to: 'Desktop', file: 'IMG_20260728_143205.jpg', size: '4.2 MB', progress: 100 },
  { from: 'Desktop', to: 'iPad Pro M4', file: 'storyboard_v1.pdf', size: '12 MB', progress: 63 },
  { from: 'Pixel 8 Pro', to: 'Umbra Cloud', file: 'backup_jul28.zip', size: '1.8 GB', progress: 100 },
];

function deviceIcon(icon: string, color: string) {
  const c = { size: 15, style: { color } };
  switch (icon) {
    case 'tablet': return <Tablet {...c} />;
    case 'audio': return <Headphones {...c} />;
    case 'watch': return <Watch {...c} />;
    default: return <Smartphone {...c} />;
  }
}

export function DevicesPanel({ onClose }: { onClose: () => void }) {
  const { avatar } = useAppStore();
  const [queue, setQueue] = useState(initialQueue);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-2xl" style={{ width: 300, background: 'linear-gradient(180deg, rgba(10,12,16,0.88), rgba(4,4,5,0.94))', border: '1px solid var(--hairline-strong)', backdropFilter: 'blur(24px)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
      <div className="flex items-center gap-2 px-3.5 py-3 hairline-b" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <span className="flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: `${avatar.accent}1f`, color: avatar.accent }}>
          <Smartphone size={12} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
          Devices
        </p>
        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{devices.filter((d) => d.status === 'Connected').length} connected</span>
        <button onClick={onClose} className="ml-auto p-1 rounded-md transition-colors" style={{ color: 'var(--text-faint)' }} title="Close devices">
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {devices.map((d) => (
          <div key={d.id} className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-3)', border: '1px solid var(--hairline)' }}>
                {deviceIcon(d.icon, d.status === 'Connected' ? avatar.accent : 'var(--text-faint)')}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>
                  {d.type} — {d.status}
                </p>
              </div>
              <Battery size={14} style={{ color: d.battery > 30 ? avatar.accent : '#FF6B6B' }} />
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full" style={{ width: `${d.battery}%`, background: d.battery > 30 ? 'var(--accent-gradient)' : '#FF6B6B' }} />
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{d.battery}%</span>
            </div>
          </div>
        ))}

        <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px dashed var(--hairline-strong)' }}>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-3)', border: '1px dashed var(--hairline-strong)' }}>
              <QrCode size={22} style={{ color: avatar.accent }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Connect a device</p>
              <p className="text-[11px] font-light leading-snug mt-0.5" style={{ color: 'var(--text-dim)' }}>
                Install Umbra and scan the code to link it.
              </p>
            </div>
          </div>
          <button
            className="w-full mt-2.5 rounded-lg py-2 text-xs font-medium transition-all"
            style={{ background: `${avatar.accent}22`, color: avatar.accent, border: `1px dashed ${avatar.accent}55`, fontFamily: 'var(--font)' }}
          >
            Pair new device
          </button>
        </div>

        <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Transfer queue</p>
            <button
              className="text-[10px] transition-colors"
              style={{ color: 'var(--text-faint)' }}
              onClick={() => setQueue((q) => q.filter((t) => t.progress < 100))}
            >
              Clear done
            </button>
          </div>
          <div className="space-y-2">
            {queue.length === 0 && (
              <p className="text-[11px] py-2 text-center font-light" style={{ color: 'var(--text-faint)' }}>No transfers</p>
            )}
            {queue.map((t, i) => (
              <div key={i}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.file}</span>
                  {t.progress === 100 && <CheckCircle2 size={11} style={{ color: avatar.accent, flexShrink: 0 }} />}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] font-light" style={{ color: 'var(--text-faint)' }}>
                    {t.from} <ArrowRight size={8} style={{ display: 'inline' }} /> {t.to} · {t.size}
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden mt-1" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: t.progress === 100 ? 'var(--text-dim)' : 'var(--accent-gradient)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
