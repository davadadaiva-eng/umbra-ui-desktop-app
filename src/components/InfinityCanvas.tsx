import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const TILE_W = 320;
const TILE_H = 214;
const MAX_K = 2.2;
const MIN_K = 0.3;

function tileUrl(i: number, j: number) {
  return `https://picsum.photos/seed/umbra-${i}x${j}/640/428`;
}

interface Range {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

interface Props {
  className?: string;
  style?: CSSProperties;
}

export function InfinityCanvas({ className, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const targetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number } | null>(null);
  const mouseRef = useRef({ mx: 0, my: 0, inside: false });
  const rangeRef = useRef<Range | null>(null);
  const rafRef = useRef(0);
  const [range, setRange] = useState<Range>({ i0: -3, i1: 3, j0: -2, j1: 2 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const k2 = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0014)));
      const wx = (sx - v.x) / v.k;
      const wy = (sy - v.y) / v.k;
      v.k = k2;
      v.x = sx - wx * k2;
      v.y = sy - wy * k2;
      targetRef.current = { ...v };
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    const loop = () => {
      const v = viewRef.current;
      const t = targetRef.current;
      const m = mouseRef.current;
      if (!dragRef.current && m.inside) {
        t.x = v.x + (m.mx - el.clientWidth / 2) * 0.04;
        t.y = v.y + (m.my - el.clientHeight / 2) * 0.04;
      }
      v.x += (t.x - v.x) * 0.07;
      v.y += (t.y - v.y) * 0.07;
      const world = worldRef.current;
      if (world) {
        world.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.k})`;
      }
      const left = -v.x / v.k;
      const top = -v.y / v.k;
      const i0 = Math.floor(left / TILE_W) - 1;
      const i1 = Math.floor((left + el.clientWidth / v.k) / TILE_W) + 1;
      const j0 = Math.floor(top / TILE_H) - 1;
      const j1 = Math.floor((top + el.clientHeight / v.k) / TILE_H) + 1;
      const r = rangeRef.current;
      if (!r || r.i0 !== i0 || r.i1 !== i1 || r.j0 !== j0 || r.j1 !== j1) {
        rangeRef.current = { i0, i1, j0, j1 };
        setRange({ i0, i1, j0, j1 });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { px: e.clientX, py: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    targetRef.current = { ...viewRef.current };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = { mx: e.clientX - rect.left, my: e.clientY - rect.top, inside: true };
    const d = dragRef.current;
    if (d) {
      viewRef.current.x += e.clientX - d.px;
      viewRef.current.y += e.clientY - d.py;
      targetRef.current = { ...viewRef.current };
      d.px = e.clientX;
      d.py = e.clientY;
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onPointerLeave = () => {
    mouseRef.current.inside = false;
  };

  const tiles: ReactNode[] = [];
  for (let i = range.i0; i <= range.i1; i++) {
    for (let j = range.j0; j <= range.j1; j++) {
      tiles.push(
        <div
          key={`${i}:${j}`}
          className="absolute"
          style={{ left: i * TILE_W, top: j * TILE_H, width: TILE_W, height: TILE_H, border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <img
            src={tileUrl(i, j)}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'grayscale(1) brightness(0.5) contrast(1.15)',
              opacity: 0,
              transition: 'opacity 0.7s ease',
            }}
            onLoad={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          />
        </div>
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg)',
        cursor: 'grab',
        touchAction: 'none',
        ...style,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <div ref={worldRef} className="absolute" style={{ top: 0, left: 0, transformOrigin: '0 0', willChange: 'transform' }}>
        {tiles}
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />
    </div>
  );
}
