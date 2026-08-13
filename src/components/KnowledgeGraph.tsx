import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useAppStore, type View } from '../stores/appStore';
import { X } from 'lucide-react';

interface AgentLike {
  id: string;
  name: string;
  task: string;
  accent: string;
}

interface GraphNode {
  id: string;
  label: string;
  kind: 'view' | 'agent' | 'file';
  view?: View;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  accent?: string;
  meta?: string;
}

type Edge = [string, string];

const VIEWS: View[] = ['agent', 'brain', 'skills', 'vault', 'connectors', 'meetings', 'usage', 'phone', 'devices', 'settings'];
const REST_LEN = 170;

const labelOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

function buildGraph(agents: AgentLike[], accent: string, files: { id: string; name: string; type: string; size: string; date: string; content?: string }[]) {
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const edges: Edge[] = [];
  const add = (n: GraphNode) => {
    nodes.push(n);
    byId.set(n.id, n);
  };
  const node = (id: string, label: string, kind: GraphNode['kind'], view?: View, r = 4, extra: Partial<GraphNode> = {}): GraphNode => ({
    id,
    label,
    kind,
    view,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r,
    ...extra,
  });

  add(node('agent', 'Agent', 'view', 'agent', 6, { accent }));
  VIEWS.filter((v) => v !== 'agent').forEach((v, i) => {
    const a = (i / (VIEWS.length - 1)) * Math.PI * 2 - Math.PI / 2;
    add(node(v, labelOf(v), 'view', v, 4, { x: Math.cos(a) * 300, y: Math.sin(a) * 300 }));
  });
  agents.forEach((a, i) => {
    const a0 = -0.6 + (i / Math.max(agents.length - 1, 1)) * 1.2;
    add(node(`agent-${a.id}`, a.name, 'agent', undefined, 5, { x: 430 + Math.cos(a0) * 120, y: Math.sin(a0) * 190, accent: a.accent, meta: a.task }));
  });
  files.forEach((f, i) => {
    const a0 = 0.9 + (i / Math.max(files.length - 1, 1)) * 1.4;
    add(node(`file-${f.id}`, f.name, 'file', undefined, 3, { x: Math.cos(a0) * 430, y: Math.sin(a0) * 320, meta: `${f.type} · ${f.size}` }));
  });

  for (const v of VIEWS) if (v !== 'agent') edges.push(['agent', v]);
  edges.push(['devices', 'brain']);
  agents.forEach((a) => {
    edges.push(['agent', `agent-${a.id}`], ['brain', `agent-${a.id}`]);
  });
  files.forEach((f) => edges.push(['brain', `file-${f.id}`]));

  for (let it = 0; it < 140; it++) {
    for (const n of nodes) {
      n.vx *= 0.82;
      n.vy *= 0.82;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = 4200 / d2;
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    for (const [ia, ib] of edges) {
      const a = byId.get(ia);
      const b = byId.get(ib);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - REST_LEN) * 0.02;
      dx /= d;
      dy /= d;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.005;
      n.vy -= n.y * 0.005;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  return { nodes, edges, byId };
}

export function KnowledgeGraph({ agents, accent }: { agents: AgentLike[]; accent: string }) {
  const { setView, brainFiles } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dataRef = useRef<{ nodes: GraphNode[]; edges: Edge[]; byId: Map<string, GraphNode> }>({ nodes: [], edges: [], byId: new Map() });
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<GraphNode | null>(null);
  const dragRef = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const built = buildGraph(agents, accent, brainFiles);
    dataRef.current = built;
    gsap.killTweensOf(viewRef.current);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewRef.current = { x: 0, y: 0, k: reduce ? 1 : 0.7 };
    if (!reduce) {
      gsap.to(viewRef.current, { k: 1, duration: 1.1, ease: 'power2.out' });
    }
  }, [agents, accent, brainFiles]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = canvas.getBoundingClientRect();
      const { w, h } = sizeRef.current;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const k2 = Math.min(3, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0013)));
      const wx = (sx - w / 2 - v.x) / v.k;
      const wy = (sy - h / 2 - v.y) / v.k;
      v.k = k2;
      v.x = sx - w / 2 - wx * k2;
      v.y = sy - h / 2 - wy * k2;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const hitTest = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const { w, h } = sizeRef.current;
      const v = viewRef.current;
      const wx = (clientX - rect.left - w / 2 - v.x) / v.k;
      const wy = (clientY - rect.top - h / 2 - v.y) / v.k;
      let best: string | null = null;
      let bestD = Infinity;
      for (const n of dataRef.current.nodes) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        const th = (n.r + 6) / v.k;
        if (d < th && d < bestD) {
          bestD = d;
          best = n.id;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { px: e.clientX, py: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        if (!d.moved && Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
        viewRef.current.x += e.clientX - d.px;
        viewRef.current.y += e.clientY - d.py;
        d.px = e.clientX;
        d.py = e.clientY;
        canvas.style.cursor = 'grabbing';
      } else {
        hoverRef.current = hitTest(e.clientX, e.clientY);
        canvas.style.cursor = hoverRef.current ? 'pointer' : 'grab';
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      canvas.style.cursor = 'grab';
      if (d && !d.moved) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
          const n = dataRef.current.byId.get(hit);
          if (n) {
            if (n.kind === 'view' && n.view) {
              setSelected(null);
              setView(n.view);
            } else {
              setSelected(n);
            }
          }
        } else {
          setSelected(null);
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    const loop = () => {
      const { w, h, dpr } = sizeRef.current;
      if (w > 0 && h > 0) {
        const v = viewRef.current;
        const data = dataRef.current;
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2d.clearRect(0, 0, w, h);
        ctx2d.save();
        ctx2d.translate(w / 2 + v.x, h / 2 + v.y);
        ctx2d.scale(v.k, v.k);
        const screen = (x: number, y: number): [number, number] => [w / 2 + v.x + x * v.k, h / 2 + v.y + y * v.k];
        const hovered = hoverRef.current ? data.byId.get(hoverRef.current) : undefined;

        for (const [ia, ib] of data.edges) {
          const a = data.byId.get(ia);
          const b = data.byId.get(ib);
          if (!a || !b) continue;
          const [ax, ay] = screen(a.x, a.y);
          const [bx, by] = screen(b.x, b.y);
          if (ax < -80 || ax > w + 80 || ay < -80 || ay > h + 80) continue;
          const involved = hovered ? a.id === hovered.id || b.id === hovered.id : false;
          ctx2d.beginPath();
          ctx2d.moveTo(ax, ay);
          ctx2d.lineTo(bx, by);
          ctx2d.strokeStyle = involved ? accent : 'rgba(255,255,255,0.08)';
          ctx2d.globalAlpha = involved ? 0.55 : 1;
          ctx2d.lineWidth = involved ? 1.4 : 1;
          ctx2d.stroke();
          ctx2d.globalAlpha = 1;
        }

        const sel = selectedRef.current;
        for (const n of data.nodes) {
          const [nx, ny] = screen(n.x, n.y);
          if (nx < -60 || nx > w + 60 || ny < -60 || ny > h + 60) continue;
          const isHover = hovered?.id === n.id;
          const isSel = sel?.id === n.id;
          const dim = n.kind === 'file' ? '#5C6B76' : n.kind === 'agent' ? (n.accent ?? accent) : '#8A9AA5';
          ctx2d.beginPath();
          ctx2d.arc(nx, ny, n.r, 0, Math.PI * 2);
          ctx2d.fillStyle = isHover || isSel ? accent : dim;
          ctx2d.fill();
          if (isHover || isSel) {
            ctx2d.beginPath();
            ctx2d.arc(nx, ny, n.r + 5, 0, Math.PI * 2);
            ctx2d.strokeStyle = accent;
            ctx2d.globalAlpha = 0.5;
            ctx2d.lineWidth = 1;
            ctx2d.stroke();
            ctx2d.globalAlpha = 1;
          }
          if (n.kind === 'view' && n.id === 'agent') {
            ctx2d.beginPath();
            ctx2d.arc(nx, ny, n.r + 8, 0, Math.PI * 2);
            ctx2d.strokeStyle = accent;
            ctx2d.globalAlpha = 0.25;
            ctx2d.lineWidth = 1;
            ctx2d.stroke();
            ctx2d.globalAlpha = 1;
          }
          if (v.k >= 0.55) {
            ctx2d.font = `${n.kind === 'file' ? 10 : 11}px Kanit, sans-serif`;
            ctx2d.textAlign = 'center';
            ctx2d.textBaseline = 'top';
            ctx2d.fillStyle = isHover || isSel ? '#D7E2EA' : 'rgba(138,154,165,0.8)';
            ctx2d.fillText(n.label, nx, ny + n.r + 7);
          }
        }
        ctx2d.restore();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [accent, setView]);

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ background: 'var(--bg)', userSelect: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ touchAction: 'none', cursor: 'grab' }} />
      {selected && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 card flex items-center gap-3 px-5 py-3" style={{ background: 'var(--surface-1)' }}>
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: selected.kind === 'file' ? '#5C6B76' : selected.accent ?? accent }}
          />
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>{selected.label}</p>
            {selected.meta && (
              <p className="text-xs mt-1 font-light leading-none" style={{ color: 'var(--text-faint)' }}>{selected.meta}</p>
            )}
          </div>
          <button className="btn-ghost" style={{ width: 26, height: 26, padding: 0, marginLeft: 6 }} onClick={() => setSelected(null)} aria-label="Close">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
