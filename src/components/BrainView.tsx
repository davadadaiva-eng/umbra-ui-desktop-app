import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { brainNotes, attachmentNotes, type BrainNote } from '../lib/brain';
import {
  Search,
  X,
  FileText,
  Bot,
  Bookmark,
  ArrowUpRight,
  ChevronRight,
  Trash2,
  Plus,
  Minus,
  Share2,
  FolderOpen,
  Frame,
  Focus,
  MessagesSquare,
} from 'lucide-react';
import { RecallPanel } from './RecallPanel';

const PALETTE = ['#3B82F6', '#60A5FA', '#22D3EE', '#34D399', '#A78BFA', '#F472B6', '#FB923C', '#FBBF24'];
const EXT_COLORS: Record<string, string> = {
  webm: '#60A5FA',
  mp4: '#F472B6',
  fig: '#A78BFA',
  wav: '#34D399',
  md: '#3B82F6',
  txt: '#9CA3AF',
  png: '#FB923C',
  pdf: '#F87171',
  csv: '#22D3EE',
  docx: '#5B8DEF',
  mp3: '#FBBF24',
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), b);
}

function nodeRadius(n: BrainNote): number {
  return 3 + Math.min(n.links.length * 0.45, 4.5);
}

function bfsHops(adj: Map<string, string[]>, start: string, hops: number): Set<string> {
  const out = new Set<string>([start]);
  let frontier = [start];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!out.has(nb)) {
      out.add(nb);
      next.push(nb);
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return out;
}

function hopDistances(adj: Map<string, string[]>, start: string, maxHops: number): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  for (let h = 1; h <= maxHops; h++) {
    const next: string[] = [];
    for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!dist.has(nb)) {
      dist.set(nb, h);
      next.push(nb);
    }
    if (!next.length) break;
    frontier = next;
  }
  return dist;
}

function buildTagNotes(notes: BrainNote[]): BrainNote[] {
  const s = new Set<string>();
  for (const n of notes) for (const t of n.tags) s.add(t);
  return Array.from(s)
    .sort()
    .map((t) => ({
      id: `tag:${t}`,
      name: t,
      folder: 'Tags',
      tags: [t],
      links: notes.filter((n) => n.tags.includes(t)).map((n) => n.id),
      content: `Notes tagged #${t}`,
      kind: 'tag',
    }));
}

function buildAllTags(notes: BrainNote[]): string[] {
  const s = new Set<string>();
  for (const n of notes) for (const t of n.tags) s.add(t);
  return Array.from(s).sort();
}

export function BrainView({ recallOpen = false, onRecallOpenChange }: { recallOpen?: boolean; onRecallOpenChange?: (v: boolean) => void }) {
  const { agents, profile, journal, clearBrain, avatar, brainFiles } = useAppStore();
  const accent = avatar.accent;

  const [view, setView] = useState<'graph' | 'files' | 'memory'>('graph');
  const [search, setSearch] = useState('');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [proximity, setProximity] = useState(2);
  const [clusterCollapsed, setClusterCollapsed] = useState<Set<string>>(() => new Set(['Journal']));

  const wrapRef = useRef<HTMLDivElement>(null);

  // ---- data ----
  const vaultNotes = useMemo(() => {
    if (!profile) return brainNotes;
    return brainNotes.map((n) =>
      n.id === 'davide'
        ? { ...n, name: profile.name, content: profile.about || n.content, tags: ['me', 'profile'] }
        : n
    );
  }, [profile]);

  const vaultSource = useMemo(() => [...vaultNotes, ...attachmentNotes], [vaultNotes]);  const tagNotes = useMemo(() => buildTagNotes(vaultSource), [vaultSource]);
  const allTags = useMemo(() => buildAllTags(vaultSource), [vaultSource]);

  const journalNotes: BrainNote[] = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return journal.slice(-60).map((e) => {
      const d = new Date(e.ts);
      return {
        id: `j-${e.id}`,
        name: `${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        folder: 'Journal',
        tags: [e.type, 'journal'],
        links: ['journal-index'],
        content: `${e.type === 'user' ? 'You said' : e.type === 'agent' ? 'Agent said' : 'Action'}: ${e.text}`,
        kind: 'note',
      };
    });
  }, [journal]);

  const agentNotes: BrainNote[] = useMemo(
    () =>
      agents.map((a) => ({
        id: `agent-${a.id}`,
        name: a.name,
        folder: 'System',
        tags: ['agent'],
        links: ['how-brain-works'],
        content: `${a.task} — ${a.status}`,
        kind: 'agent',
      })),
    [agents]
  );

  const memoryNotes: BrainNote[] = useMemo(
    () =>
      brainFiles.map((f) => ({
        id: `mem-${f.id}`,
        name: f.name,
        folder: 'Memory',
        tags: ['memory', 'file'],
        links: ['journal-index'],
        content: f.content.slice(0, 220),
        kind: 'note',
      })),
    [brainFiles]
  );

  const journalCapped = useMemo(() => journalNotes.slice(-30), [journalNotes]);

  const memEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? journal.filter((e) => e.text.toLowerCase().includes(q)) : journal;
    return [...filtered].sort((a, b) => b.ts - a.ts).slice(0, 120);
  }, [journal, search]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? `${hh}:${mm}` : `${d.toLocaleDateString()} ${hh}:${mm}`;
  };

  const allById = useMemo(() => {
    const m = new Map<string, BrainNote>();
    for (const n of [...vaultNotes, ...attachmentNotes, ...tagNotes, ...journalNotes, ...agentNotes, ...memoryNotes]) m.set(n.id, n);
    return m;
  }, [vaultNotes, tagNotes, journalNotes, agentNotes, memoryNotes]);

  const folderTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of [...vaultNotes, ...attachmentNotes, ...journalNotes, ...agentNotes, ...memoryNotes]) {
      if (n.kind === 'tag') continue;
      m.set(n.folder, (m.get(n.folder) ?? 0) + 1);
    }
    return m;
  }, [vaultNotes, journalNotes, agentNotes, memoryNotes]);

  const passes = useCallback(
    (n: BrainNote): boolean => {
      const s = search.trim().toLowerCase();
      if (s && !`${n.name} ${n.folder} ${n.tags.join(' ')} ${n.content}`.toLowerCase().includes(s)) return false;
      if (tagFilters.length > 0 && !n.tags.some((t) => tagFilters.includes(t))) return false;
      return true;
    },
    [search, tagFilters]
  );

  // ---- graph data ----
  const baseGraph = useMemo(() => [...vaultNotes, ...journalCapped, ...agentNotes, ...memoryNotes].filter((n) => n.kind !== 'attachment' && n.kind !== 'tag'), [vaultNotes, journalCapped, agentNotes, memoryNotes]);

  const baseGraphAdj = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const n of baseGraph) adj.set(n.id, []);
    for (const n of baseGraph) for (const l of n.links) if (adj.has(l)) {
      adj.get(n.id)?.push(l);
      adj.get(l)?.push(n.id);
    }
    return adj;
  }, [baseGraph]);

  const graphNodes = useMemo(() => {
    if (focusId && baseGraphAdj.has(focusId)) {
      const ids = bfsHops(baseGraphAdj, focusId, proximity);
      return baseGraph.filter((n) => ids.has(n.id));
    }
    return baseGraph.filter((n) => passes(n));
  }, [focusId, proximity, baseGraphAdj, baseGraph, passes]);

  const graphEdges = useMemo(() => {
    const ids = new Set(graphNodes.map((n) => n.id));
    const e: [string, string][] = [];
    for (const n of graphNodes) for (const l of n.links) if (ids.has(l)) e.push([n.id, l]);
    return e;
  }, [graphNodes]);

  const graphAdj = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const n of graphNodes) adj.set(n.id, []);
    for (const [a, b] of graphEdges) {
      adj.get(a)?.push(b);
      adj.get(b)?.push(a);
    }
    return adj;
  }, [graphNodes, graphEdges]);

  const graphLayout = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    if (focusId && graphNodes.some((n) => n.id === focusId)) {
      const dist = hopDistances(baseGraphAdj, focusId, proximity);
      out.set(focusId, { x: 0, y: 0 });
      const byHop = new Map<number, string[]>();
      for (const n of graphNodes) {
        if (n.id === focusId) continue;
        const h = dist.get(n.id) ?? 1;
        const arr = byHop.get(h) ?? [];
        arr.push(n.id);
        byHop.set(h, arr);
      }
      for (const [hop, ids] of byHop.entries()) {
        const ring = hop === 1 ? 120 : hop === 2 ? 200 : 265;
        ids.forEach((id, i) => {
          const ang = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
          out.set(id, { x: Math.cos(ang) * ring, y: Math.sin(ang) * ring });
        });
      }
      return out;
    }
    const byFolder = new Map<string, BrainNote[]>();
    for (const n of graphNodes) {
      const arr = byFolder.get(n.folder) ?? [];
      arr.push(n);
      byFolder.set(n.folder, arr);
    }
    const folders = Array.from(byFolder.keys()).sort();
    const n = folders.length;
    const clusterRing = n <= 1 ? 0 : Math.min(170, 70 + n * 20);
    folders.forEach((folder, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(angle) * clusterRing;
      const cy = Math.sin(angle) * clusterRing;
      const list = byFolder.get(folder)!;
      const m = list.length;
      const rad = m === 1 ? 0 : Math.min(26 + m * 1.6, 58);
      list.forEach((node, j) => {
        const sub = (j / m) * Math.PI * 2;
        out.set(node.id, { x: cx + Math.cos(sub) * rad, y: cy + Math.sin(sub) * rad });
      });
    });
    return out;
  }, [graphNodes, focusId, proximity, baseGraphAdj]);

  const graphRef = useRef({ nodes: [] as BrainNote[], edges: [] as [string, string][], adj: new Map<string, string[]>(), layout: new Map<string, { x: number; y: number }>() });
  graphRef.current = { nodes: graphNodes, edges: graphEdges, adj: graphAdj, layout: graphLayout };

  const uiRef = useRef({ accent, openNoteId, focusId });
  uiRef.current = { accent, openNoteId, focusId };

  // ---- graph canvas ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ w: 0, h: 0, dpr: 1 });
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const didFitRef = useRef(false);

  const hitTest = useCallback((sx: number, sy: number): string | null => {
    const g = graphRef.current;
    const cam = camRef.current;
    for (let i = g.nodes.length - 1; i >= 0; i--) {
      const n = g.nodes[i];
      const p = g.layout.get(n.id);
      if (!p) continue;
      const r = Math.max(nodeRadius(n) * cam.zoom + 4, 6);
      const dx = p.x * cam.zoom + cam.x - sx;
      const dy = p.y * cam.zoom + cam.y - sy;
      if (dx * dx + dy * dy <= r * r) return n.id;
    }
    return null;
  }, []);

  const fitGraph = useCallback(() => {
    const v = viewRef.current;
    const g = graphRef.current;
    if (!g.nodes.length || !v.w || !v.h) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of g.nodes) {
      const p = g.layout.get(n.id);
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const bw = Math.max(maxX - minX, 120);
    const bh = Math.max(maxY - minY, 120);
    const zoom = clamp(Math.min((v.w - 120) / bw, (v.h - 120) / bh), 0.25, 1.5);
    const cam = camRef.current;
    cam.zoom = zoom;
    cam.x = (v.w - bw * zoom) / 2 - minX * zoom;
    cam.y = (v.h - bh * zoom) / 2 - minY * zoom;
  }, []);

  const fitGraphRef = useRef(fitGraph);
  fitGraphRef.current = fitGraph;

  useEffect(() => {
    if (view !== 'graph') return;
    const id = requestAnimationFrame(() => fitGraph());
    return () => cancelAnimationFrame(id);
  }, [view, focusId, fitGraph]);

  const zoomGraphAt = useCallback((px: number, py: number, factor: number) => {
    const cam = camRef.current;
    const nz = clamp(cam.zoom * factor, 0.2, 2.5);
    const nf = nz / cam.zoom;
    cam.x = px - (px - cam.x) * nf;
    cam.y = py - (py - cam.y) * nf;
    cam.zoom = nz;
  }, []);

  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = viewRef.current;
    const cam = camRef.current;
    const ui = uiRef.current;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);

    if (cam.zoom > 0.85) {
      const sp = 26 * cam.zoom;
      const a = Math.min((cam.zoom - 0.85) / 0.7, 1) * 0.055;
      if (a > 0.002) {
        ctx.fillStyle = hexToRgba(ui.accent, a);
        const ox = ((cam.x % sp) + sp) % sp;
        const oy = ((cam.y % sp) + sp) % sp;
        for (let gx = -ox; gx < v.w; gx += sp) for (let gy = -oy; gy < v.h; gy += sp) ctx.fillRect(gx, gy, 1.2, 1.2);
      }
    }

    const hovered = hoverRef.current;
    let hl: Set<string> | null = null;
    if (hovered && graphRef.current.adj.has(hovered)) hl = bfsHops(graphRef.current.adj, hovered, 2);

    const posOf = graphRef.current.layout;
    let edgeFlip = 0;
    for (const [a, b] of graphRef.current.edges) {
      const pa = posOf.get(a);
      const pb = posOf.get(b);
      if (!pa || !pb) continue;
      const sax = pa.x * cam.zoom + cam.x;
      const say = pa.y * cam.zoom + cam.y;
      const sbx = pb.x * cam.zoom + cam.x;
      const sby = pb.y * cam.zoom + cam.y;
      let alpha: number;
      if (hovered) {
        const hot = a === hovered || b === hovered;
        const inHl = !!hl && hl.has(a) && hl.has(b);
        alpha = hot ? 0.55 : inHl ? 0.26 : 0.05;
      } else {
        alpha = 0.17;
      }
      const edx = sbx - sax;
      const edy = sby - say;
      const ed = Math.hypot(edx, edy) || 1;
      const bend = Math.min(ed * 0.14, 30);
      edgeFlip = 1 - edgeFlip;
      const mx = (sax + sbx) / 2 - (edy / ed) * bend * (edgeFlip ? 1 : -1);
      const my = (say + sby) / 2 + (edx / ed) * bend * (edgeFlip ? 1 : -1);
      ctx.strokeStyle = hexToRgba(ui.accent, alpha * 0.3);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sax, say);
      ctx.quadraticCurveTo(mx, my, sbx, sby);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(ui.accent, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sax, say);
      ctx.quadraticCurveTo(mx, my, sbx, sby);
      ctx.stroke();
    }

    const labelZoom = Math.min(Math.max((cam.zoom - 0.45) / 0.5, 0), 1);
    const now = Date.now() / 1000;
    for (const n of graphRef.current.nodes) {
      const p = posOf.get(n.id);
      if (!p) continue;
      const sx = p.x * cam.zoom + cam.x;
      const sy = p.y * cam.zoom + cam.y;
      const isHover = n.id === hovered;
      const dimmed = !!hovered && !!hl && !hl.has(n.id) && !isHover;
      const isOpen = n.id === ui.openNoteId;
      const isFocus = n.id === ui.focusId;
      const color = n.kind === 'agent' ? '#7fb3ff' : colorFor(n.folder);
      const r = Math.max(nodeRadius(n) * cam.zoom, 2);
      if (!dimmed) {
        const c = isHover || isOpen || isFocus ? ui.accent : color;
        const pulse = isOpen || isFocus ? 1 + Math.sin(now * 2.6) * 0.1 : 1;
        const haloR = r * (isFocus ? 4.2 : 2.8) * pulse;
        const grad = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, haloR);
        grad.addColorStop(0, hexToRgba(c, isHover || isOpen || isFocus ? 0.28 : 0.13));
        grad.addColorStop(1, hexToRgba(c, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = dimmed ? 0.1 : 1;
      ctx.fillStyle = color;
      ctx.strokeStyle = isHover || isOpen || isFocus ? ui.accent : hexToRgba(color, 0.55);
      ctx.lineWidth = isHover || isOpen || isFocus ? 1.4 : 1;
      ctx.beginPath();
      if (n.kind === 'agent') {
        const rr = r * 1.5;
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k - Math.PI / 6;
          const px = sx + Math.cos(a) * rr;
          const py = sy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(sx, sy, r * 1.45, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      const showLabel = !dimmed && (isHover || !!hl?.has(n.id) || cam.zoom > 0.55);
      if (showLabel) {
        ctx.globalAlpha = isHover ? 1 : labelZoom * 0.78;
        ctx.fillStyle = isHover ? ui.accent : 'rgba(190,200,214,1)';
        ctx.font = '11px Kanit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.name, sx, sy + r * 1.9 + 6);
        ctx.globalAlpha = 1;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const loop = () => {
      drawRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const host = canvas.parentElement;
      if (!host) return;
      // Layout size, NOT getBoundingClientRect: the parent wrapper is CSS-scaled
      // (transform: scale) while the brain slides open, and transforms don't
      // affect clientWidth/Height — so we always get the real full size.
      const w = host.clientWidth || 0;
      const h = host.clientHeight || 0;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      const prevArea = viewRef.current.w * viewRef.current.h;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      viewRef.current = { w, h, dpr };
      // If the first measurement raced the layout (zero-size viewport), the
      // initial fit no-oped — refit now that we have a real size.
      if (prevArea === 0) {
        requestAnimationFrame(() => fitGraphRef.current());
      }
    };
    onResize();
    if (!didFitRef.current) {
      didFitRef.current = true;
      requestAnimationFrame(() => fitGraphRef.current());
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas.parentElement ?? canvas);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const s = rect.width / (canvas.clientWidth || rect.width) || 1;
      zoomGraphAt((e.clientX - rect.left) / s, (e.clientY - rect.top) / s, Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onLeave = () => {
      hoverRef.current = null;
    };
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [zoomGraphAt]);

  const onGraphMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = rect.width / (e.currentTarget.clientWidth || rect.width) || 1;
    const sx = (e.clientX - rect.left) / s;
    const sy = (e.clientY - rect.top) / s;
    dragRef.current = { sx, sy, px: sx, py: sy, moved: false };
    e.currentTarget.style.cursor = 'grabbing';
  };

  const onGraphMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = rect.width / (e.currentTarget.clientWidth || rect.width) || 1;
    const sx = (e.clientX - rect.left) / s;
    const sy = (e.clientY - rect.top) / s;
    const drag = dragRef.current;
    if (drag) {
      const dx = sx - drag.px;
      const dy = sy - drag.py;
      if (Math.abs(sx - drag.sx) > 3 || Math.abs(sy - drag.sy) > 3) drag.moved = true;
      if (drag.moved) {
        camRef.current.x += dx;
        camRef.current.y += dy;
      }
      drag.px = sx;
      drag.py = sy;
    }
    const hit = hitTest(sx, sy);
    hoverRef.current = hit;
    e.currentTarget.style.cursor = hit ? 'pointer' : 'grab';
  };

  const onGraphMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && !drag.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const s = rect.width / (e.currentTarget.clientWidth || rect.width) || 1;
      const hit = hitTest((e.clientX - rect.left) / s, (e.clientY - rect.top) / s);
      if (hit) {
        setOpenNoteId(hit);
        if (allById.get(hit)?.kind === 'note' || allById.get(hit)?.kind === 'agent') {
          hoverRef.current = null;
        }
      }
    }
    dragRef.current = null;
    e.currentTarget.style.cursor = 'grab';
  };

  // ---- files layer ----
  const filesViewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const camFilesRef = useRef({ x: 80, y: 80, zoom: 1 });
  const dragFilesRef = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  const suppressRef = useRef(false);

  const clusters = useMemo(() => {
    const list = [...vaultNotes, ...attachmentNotes, ...journalCapped, ...agentNotes, ...memoryNotes];
    const byFolder = new Map<string, BrainNote[]>();
    for (const n of list) {
      if (n.kind === 'tag') continue;
      if (!passes(n)) continue;
      const arr = byFolder.get(n.folder) ?? [];
      arr.push(n);
      byFolder.set(n.folder, arr);
    }
    return Array.from(byFolder.entries())
      .map(([folder, notes]) => [folder, notes.sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [vaultNotes, journalCapped, agentNotes, memoryNotes, passes]);

  const applyFilesCamera = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const { x, y, zoom } = camFilesRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  }, []);

  const zoomFilesAt = useCallback(
    (px: number, py: number, factor: number) => {
      const cam = camFilesRef.current;
      const nz = Math.min(2.5, Math.max(0.2, cam.zoom * factor));
      const nf = nz / cam.zoom;
      cam.x = px - (px - cam.x) * nf;
      cam.y = py - (py - cam.y) * nf;
      cam.zoom = nz;
      applyFilesCamera();
    },
    [applyFilesCamera]
  );

  const fitFiles = useCallback(() => {
    const wrap = wrapRef.current;
    const content = contentRef.current;
    if (!wrap || !content) return;
    const vw = wrap.clientWidth;
    const vh = wrap.clientHeight;
    const cw = content.offsetWidth + 96;
    const ch = content.offsetHeight + 96;
    const z = Math.min(Math.max(Math.min(vw / cw, vh / ch), 0.2), 1.1);
    camFilesRef.current.zoom = z;
    camFilesRef.current.x = (vw - cw * z) / 2;
    camFilesRef.current.y = (vh - ch * z) / 2;
    applyFilesCamera();
  }, [applyFilesCamera]);

  useEffect(() => {
    if (view !== 'files') return;
    const id = requestAnimationFrame(() => fitFiles());
    return () => cancelAnimationFrame(id);
  }, [view, fitFiles]);

  useEffect(() => {
    const el = filesViewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomFilesAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomFilesAt]);

  const onFilesMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    dragFilesRef.current = { sx: px, sy: py, px, py, moved: false };
    e.currentTarget.style.cursor = 'grabbing';
  };

  const onFilesMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragFilesRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dx = px - drag.px;
    const dy = py - drag.py;
    if (Math.abs(px - drag.sx) > 3 || Math.abs(py - drag.sy) > 3) {
      drag.moved = true;
      suppressRef.current = true;
    }
    if (drag.moved) {
      camFilesRef.current.x += dx;
      camFilesRef.current.y += dy;
      applyFilesCamera();
    }
    drag.px = px;
    drag.py = py;
  };

  const endFilesDrag = () => {
    const wrap = filesViewRef.current;
    const drag = dragFilesRef.current;
    if (drag && drag.moved && suppressRef.current) {
      window.setTimeout(() => {
        suppressRef.current = false;
      }, 0);
    }
    dragFilesRef.current = null;
    if (wrap) wrap.style.cursor = 'grab';
  };

  const toggleTag = (t: string) => {
    setTagFilters((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };

  const toggleCluster = (folder: string) => {
    setClusterCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const openNote = openNoteId ? allById.get(openNoteId) : null;
  const noteLinks = openNote ? openNote.links.map((l) => allById.get(l)).filter((n): n is BrainNote => !!n) : [];

  const kindIcon = (kind: string, size = 13) => {
    if (kind === 'agent') return <Bot size={size} />;
    return <FileText size={size} />;
  };

  const noteCard = (n: BrainNote) => {
    const isOpen = n.id === openNoteId;
    const fColor = colorFor(n.folder);
    let iconColor = fColor;
    let icon: React.ReactNode;
    if (n.kind === 'attachment') {
      const ext = extOf(n.name);
      iconColor = EXT_COLORS[ext] ?? '#9FB0C6';
      icon = <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: iconColor }}>{ext || 'file'}</span>;
    } else if (n.kind === 'agent') {
      iconColor = '#7fb3ff';
      icon = <Bot size={17} style={{ color: iconColor }} />;
    } else if (n.kind === 'tag') {
      icon = <FileText size={17} style={{ color: iconColor }} />;
    } else {
      icon = <FileText size={17} style={{ color: iconColor }} />;
    }
    const meta = n.kind === 'attachment' ? n.content : n.kind === 'agent' ? 'crew agent' : n.kind === 'tag' ? 'tag' : 'note';
    const snippet = n.kind === 'attachment' ? '' : n.content;
    return (
      <button
        key={n.id}
        onClick={() => {
          if (suppressRef.current) return;
          setOpenNoteId(n.id);
        }}
        className="group text-left w-full rounded-2xl p-3.5 flex-none select-none"
        style={{
          background: isOpen ? `${accent}0d` : 'rgba(255,255,255,0.032)',
          border: `1px solid ${isOpen ? `${accent}88` : 'var(--hairline-strong)'}`,
          boxShadow: isOpen ? `0 12px 34px ${hexToRgba(accent, 0.14)}` : 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          if (isOpen) return;
          e.currentTarget.style.borderColor = `${accent}55`;
          e.currentTarget.style.background = 'rgba(255,255,255,0.055)';
        }}
        onMouseLeave={(e) => {
          if (isOpen) return;
          e.currentTarget.style.borderColor = 'var(--hairline-strong)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.032)';
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: `${iconColor}1c`, color: iconColor, border: `1px solid ${iconColor}40` }}
          >
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
              {n.kind === 'tag' ? `#${n.name}` : n.name}
            </p>
            <p className="text-[11px] font-light truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>{meta}</p>
          </div>
        </div>
        {snippet && (
          <p
            className="text-[11px] font-light leading-relaxed mt-2"
            style={{ color: 'var(--text-dim)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {snippet}
          </p>
        )}
        {n.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {n.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: '#8f9bb0', fontFamily: 'var(--font)' }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
        {n.links.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] mt-2" style={{ color: '#667' }}>
            <ArrowUpRight size={10} /> {n.links.length} linked
          </span>
        )}
      </button>
    );
  };

  // ---- recall floating panel ----
  const recallElRef = useRef<HTMLDivElement>(null);
  const recallBoxRef = useRef({ x: 12, y: 12, w: 360, h: 460, maxed: false });
  const recallInitRef = useRef(false);

  const applyRecallBox = useCallback(() => {
    const el = recallElRef.current;
    const b = recallBoxRef.current;
    if (!el) return;
    if (b.maxed) {
      el.style.left = '12px';
      el.style.top = '12px';
      el.style.width = 'calc(100% - 24px)';
      el.style.height = 'calc(100% - 24px)';
    } else {
      el.style.left = `${b.x}px`;
      el.style.top = `${b.y}px`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
  }, []);

  useEffect(() => {
    if (!recallOpen || recallInitRef.current) return;
    recallInitRef.current = true;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    recallBoxRef.current = {
      x: Math.max(12, w - 372),
      y: Math.max(12, h - 500),
      w: 360,
      h: Math.min(470, Math.max(320, h - 60)),
      maxed: false,
    };
    applyRecallBox();
  }, [recallOpen, applyRecallBox]);

  const dragRecall = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const b = recallBoxRef.current;
      if (b.maxed) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = b.x;
      const oy = b.y;
      const onMove = (ev: PointerEvent) => {
        b.x = clamp(ox + ev.clientX - sx, 12, Math.max(12, wrap.clientWidth - b.w - 12));
        b.y = clamp(oy + ev.clientY - sy, 12, Math.max(12, wrap.clientHeight - b.h - 12));
        applyRecallBox();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [applyRecallBox]
  );

  const resizeRecall = useCallback(
    (e: React.PointerEvent) => {
      const b = recallBoxRef.current;
      if (b.maxed) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      const ow = b.w;
      const oh = b.h;
      const onMove = (ev: PointerEvent) => {
        b.w = clamp(ow + ev.clientX - sx, 300, Math.max(300, wrap.clientWidth - b.x - 12));
        b.h = clamp(oh + ev.clientY - sy, 300, Math.max(300, wrap.clientHeight - b.y - 12));
        applyRecallBox();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [applyRecallBox]
  );

  const toggleRecallMax = useCallback(() => {
    const b = recallBoxRef.current;
    b.maxed = !b.maxed;
    applyRecallBox();
  }, [applyRecallBox]);

  const focusName = focusId ? allById.get(focusId)?.name ?? '' : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openNoteId) setOpenNoteId(null);
        else if (focusId) setFocusId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNoteId, focusId]);

  return (
    <div ref={wrapRef} className="relative h-full overflow-hidden select-none" style={{ background: 'rgba(4,5,8,0.66)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', cursor: 'grab' }}>
      {/* ---- GRAPH LAYER ---- */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ display: view === 'graph' ? 'block' : 'none' }}
        onMouseDown={onGraphMouseDown}
        onMouseMove={onGraphMouseMove}
        onMouseUp={onGraphMouseUp}
      />

      {view === 'graph' && graphNodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <p className="text-sm font-light" style={{ color: '#666' }}>No notes match the current filters</p>
        </div>
      )}

      {view === 'graph' && focusId && (
        <div
          className="absolute top-14 left-1/2 z-20 flex items-center gap-2.5 px-3.5 py-2 rounded-full"
          style={{ transform: 'translateX(-50%)', background: 'rgba(12,14,18,0.92)', border: '1px solid var(--hairline-strong)', boxShadow: '0 12px 34px rgba(0,0,0,0.45)', backdropFilter: 'blur(18px)' }}
        >
          <Focus size={13} style={{ color: accent, flexShrink: 0 }} />
          <span className="text-[11px] truncate max-w-[160px]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
            Focusing · {focusName}
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={proximity}
            onChange={(e) => setProximity(Number(e.target.value))}
            className="w-20"
            style={{ accentColor: accent }}
            title="How many links deep"
            />
          <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{proximity} hop</span>
          <button
            onClick={() => setFocusId(null)}
            className="flex items-center justify-center rounded-full transition-colors"
            style={{ width: 20, height: 20, color: 'var(--text-dim)', border: '1px solid var(--hairline-strong)', background: 'rgba(255,255,255,0.04)' }}
            title="Exit focus — show the full graph"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ---- FILES LAYER ---- */}
      <div
        ref={filesViewRef}
        className="absolute inset-0"
        style={{ display: view === 'files' ? 'block' : 'none', cursor: 'grab' }}
        onMouseDown={onFilesMouseDown}
        onMouseMove={onFilesMouseMove}
        onMouseUp={endFilesDrag}
        onMouseLeave={endFilesDrag}
      >
        <div ref={stageRef} className="absolute top-0 left-0" style={{ transformOrigin: '0 0', willChange: 'transform' }}>
          <div ref={contentRef} className="flex items-start gap-9 p-10 min-w-max">
            {clusters.map(([folder, notes]) => {
              const closed = clusterCollapsed.has(folder);
              const total = folderTotals.get(folder) ?? notes.length;
              const capped = folder === 'Journal' && journalNotes.length > notes.length;
              return (
                <div key={folder} className="flex flex-col" style={{ width: 360, flexShrink: 0 }}>
                  <button onClick={() => toggleCluster(folder)} className="flex items-center gap-2 mb-3 w-full" style={{ cursor: 'pointer' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: colorFor(folder), flexShrink: 0 }} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{folder}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                      {capped ? `${total} · latest ${notes.length}` : `${total} ${total === 1 ? 'note' : 'notes'}`}
                    </span>
                    <ChevronRight size={12} style={{ color: '#666', marginLeft: 'auto', transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
                  </button>
                  {!closed && <div className="flex flex-col gap-2.5">{notes.map(noteCard)}</div>}
                </div>
              );
            })}
            {clusters.length === 0 && (
              <p className="text-sm font-light mt-24 mx-auto" style={{ color: '#666' }}>No notes match the current search or tags</p>
            )}
          </div>
        </div>
      </div>

      {/* ---- MEMORY LAYER ---- */}
      {view === 'memory' && (
        <div className="absolute inset-0 z-10 overflow-y-auto" style={{ padding: '68px 20px 20px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div className="mb-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--text-dim)' }}>
                About you
              </h2>
              <div className="card p-4" style={{ background: 'var(--surface-1)', border: `1px solid ${accent}33` }}>
                {profile ? (
                  <>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{profile.name || 'You'}</p>
                    {profile.about && (
                      <p className="text-[12px] font-light mt-1 leading-relaxed" style={{ color: 'var(--text-dim)' }}>{profile.about}</p>
                    )}
                    {profile.facts.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {profile.facts.map((f, i) => (
                          <span key={i} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: `${accent}14`, border: `1px solid ${accent}44`, color: 'var(--text-primary)' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] font-light" style={{ color: 'var(--text-faint)' }}>
                    No profile yet — answer the intro questions and everything about you gets stored here.
                  </p>
                )}
              </div>
            </div>

            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--text-dim)' }}>
              Conversations · {memEntries.length}
            </h2>
            <div className="space-y-1.5">
              {memEntries.length === 0 && (
                <p className="text-[12px] font-light py-6 text-center" style={{ color: 'var(--text-faint)' }}>
                  {search ? 'Nothing matches your search.' : 'Nothing registered yet — every conversation is stored here as it happens.'}
                </p>
              )}
              {memEntries.map((e) => (
                <div key={e.id} className="card px-4 py-2.5 flex items-start gap-3" style={{ background: 'var(--surface-1)' }}>
                  <span className="text-[9px] font-mono mt-1 flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{fmtTime(e.ts)}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest flex-shrink-0 mt-1" style={{ color: e.type === 'user' ? accent : e.type === 'agent' ? '#7fb3ff' : 'var(--text-faint)', width: 44 }}>
                    {e.type}
                  </span>
                  <p
                    className="text-[12px] leading-relaxed min-w-0 break-words"
                    style={{ color: e.type === 'action' ? 'var(--text-faint)' : 'var(--text-primary)', fontStyle: e.type === 'action' ? 'italic' : undefined }}
                  >
                    {e.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- TOP BAR ---- */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2 pointer-events-none">
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-full pointer-events-auto"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline-strong)', backdropFilter: 'blur(14px)' }}
        >
          <button
            onClick={() => setView('graph')}
            className="flex items-center gap-1.5 px-3 rounded-full transition-colors"
            style={{ height: 26, color: view === 'graph' ? '#fff' : 'var(--text-dim)', background: view === 'graph' ? `${accent}33` : 'transparent', fontFamily: 'var(--font)', fontSize: 11 }}
            title="Knowledge graph"
          >
            <Share2 size={11} /> Graph
          </button>
          <button
            onClick={() => setView('files')}
            className="flex items-center gap-1.5 px-3 rounded-full transition-colors"
            style={{ height: 26, color: view === 'files' ? '#fff' : 'var(--text-dim)', background: view === 'files' ? `${accent}33` : 'transparent', fontFamily: 'var(--font)', fontSize: 11 }}
            title="Browse files & notes as cards"
          >
            <FolderOpen size={11} /> Files
          </button>
          <button
            onClick={() => setView('memory')}
            className="flex items-center gap-1.5 px-3 rounded-full transition-colors"
            style={{ height: 26, color: view === 'memory' ? '#fff' : 'var(--text-dim)', background: view === 'memory' ? `${accent}33` : 'transparent', fontFamily: 'var(--font)', fontSize: 11 }}
            title="Everything registered about you — conversations & facts"
          >
            <MessagesSquare size={11} /> Memory
          </button>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 pointer-events-auto"
          style={{ height: 30, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline-strong)', borderRadius: 8, flex: 1, maxWidth: 380 }}
        >
          <Search size={12} style={{ color: 'var(--text-faint)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'graph' ? 'Filter the graph…' : view === 'memory' ? 'Search memory…' : 'Filter the vault…'}
            className="bg-transparent outline-none text-xs w-full"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="flex items-center" style={{ color: 'var(--text-faint)' }}>
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={() => onRecallOpenChange?.(!recallOpen)}
          className="ml-auto flex items-center gap-1.5 px-3 rounded-full transition-colors pointer-events-auto"
          style={{
            height: 28,
            color: recallOpen ? accent : 'var(--text-dim)',
            border: `1px solid ${recallOpen ? `${accent}66` : 'var(--hairline-strong)'}`,
            background: recallOpen ? `${accent}18` : 'rgba(255,255,255,0.03)',
            fontFamily: 'var(--font)',
            fontSize: 11,
          }}
          title="Ask the brain anything"
        >
          <Bookmark size={11} /> Recall
        </button>
        <button
          onClick={() => {
            if (window.confirm("Clear the brain? This wipes the journal, your profile and the agent name — only this app's own data, nothing else on this PC.")) {
              clearBrain();
              window.location.reload();
            }
          }}
          className="flex items-center justify-center rounded-full transition-colors pointer-events-auto"
          style={{ height: 28, width: 28, color: '#8a5a5a', border: '1px solid var(--hairline-strong)', background: 'rgba(255,255,255,0.03)' }}
          title="Wipe journal, profile and agent name (app data only)"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* ---- TAG CHIPS ---- */}
      {view !== 'memory' && allTags.length > 0 && (
        <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-1" style={{ maxWidth: '46vw' }}>
          {allTags.map((t) => {
            const on = tagFilters.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className="text-[10px] px-2 py-1 rounded-full transition-colors"
                style={{
                  color: on ? colorFor(t) : 'var(--text-faint)',
                  background: on ? `${colorFor(t)}1c` : 'rgba(255,255,255,0.028)',
                  border: `1px solid ${on ? `${colorFor(t)}55` : 'var(--hairline)'}`,
                  fontFamily: 'var(--font)',
                }}
              >
                #{t}
              </button>
            );
          })}
        </div>
      )}

      {/* ---- ZOOM CONTROLS ---- */}
      {view !== 'memory' && (
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5">
        {[
          {
            label: 'Zoom in',
            icon: <Plus size={12} />,
            fn: () => {
              if (view === 'graph') {
                const c = canvasRef.current;
                if (c) zoomGraphAt(c.clientWidth / 2, c.clientHeight / 2, 1.3);
              } else {
                const wrap = wrapRef.current;
                if (wrap) zoomFilesAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 1.3);
              }
            },
          },
          {
            label: 'Zoom out',
            icon: <Minus size={12} />,
            fn: () => {
              if (view === 'graph') {
                const c = canvasRef.current;
                if (c) zoomGraphAt(c.clientWidth / 2, c.clientHeight / 2, 0.77);
              } else {
                const wrap = wrapRef.current;
                if (wrap) zoomFilesAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 0.77);
              }
            },
          },
          view === 'graph'
            ? { label: 'Fit graph', icon: <Frame size={11} />, fn: fitGraph }
            : { label: 'Fit files', icon: <Frame size={11} />, fn: fitFiles },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.fn}
            title={b.label}
            className="flex items-center justify-center rounded-full transition-colors"
            style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.035)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = `${accent}66`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--hairline-strong)'; }}
          >
            {b.icon}
          </button>
        ))}
      </div>
      )}

      {view === 'graph' && (
        <p className="absolute bottom-2 left-1/2 z-10 pointer-events-none text-[10px]" style={{ transform: 'translateX(-50%)', color: '#555', fontFamily: 'var(--font)', letterSpacing: '0.06em' }}>
          {graphNodes.length} notes · drag to pan · scroll to zoom · click to open
        </p>
      )}

      {/* ---- NOTE DETAIL ---- */}
      {openNote && (
        <div
          className="absolute top-0 right-0 bottom-0 z-30 flex flex-col"
          style={{ width: 300, background: 'var(--surface-1)', borderLeft: '1px solid var(--hairline)', boxShadow: '-12px 0 40px rgba(0,0,0,0.45)' }}
        >
          <div className="flex items-start gap-3 px-4 pt-4">
            <span className="flex-shrink-0 mt-0.5" style={{ color: openNote.kind === 'agent' ? '#7fb3ff' : accent }}>
              {kindIcon(openNote.kind, 15)}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium leading-snug break-words" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
                {openNote.kind === 'tag' ? `#${openNote.name}` : openNote.name}
              </h2>
              <p className="text-[11px] mt-0.5 font-light" style={{ color: 'var(--text-faint)' }}>
                {openNote.folder}
                {openNote.kind === 'attachment' || openNote.kind === 'agent' ? ` · ${openNote.content}` : ''}
              </p>
              <div className="mt-2" style={{ height: 2, width: 36, borderRadius: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
            </div>
            {view === 'graph' && (
              <button
                onClick={() => {
                  setView('graph');
                  setFocusId(openNote.id);
                  setOpenNoteId(null);
                }}
                className="btn-ghost flex-shrink-0"
                style={{ width: 26, height: 26, padding: 0 }}
                title="Focus the graph on this note"
              >
                <Focus size={12} />
              </button>
            )}
            <button onClick={() => setOpenNoteId(null)} className="btn-ghost flex-shrink-0" style={{ width: 26, height: 26, padding: 0 }} title="Close (Esc)">
              <X size={13} />
            </button>
          </div>

          {openNote.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 mt-3">
              {openNote.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--text-dim)', border: '1px solid var(--hairline-strong)', background: 'rgba(255,255,255,0.028)', fontFamily: 'var(--font)' }}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="px-4 mt-4 flex-1 overflow-y-auto">
            <p className="text-[13px] leading-relaxed font-light" style={{ color: 'var(--text-dim)' }}>{openNote.content}</p>
            <p className="text-[10px] mt-4 font-medium uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Linked notes</p>
            {noteLinks.length > 0 ? (
              <div className="mt-2 space-y-0.5">
                {noteLinks.map((ln) => (
                  <button
                    key={ln.id}
                    onClick={() => setOpenNoteId(ln.id)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md transition-colors hover:opacity-80"
                    style={{ color: '#c9c9c9' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba(accent, 0.12); e.currentTarget.style.color = accent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c9c9c9'; }}
                  >
                    {kindIcon(ln.kind, 11)}
                    <span className="text-xs truncate flex-1" style={{ fontFamily: 'var(--font)' }}>{ln.kind === 'tag' ? `#${ln.name}` : ln.name}</span>
                    <ArrowUpRight size={11} style={{ color: '#666' }} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs mt-2" style={{ color: '#666' }}>No links.</p>
            )}
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: '#666' }}>
              {openNote.kind === 'tag' ? 'tag' : openNote.kind === 'attachment' ? 'attachment' : openNote.kind === 'agent' ? 'agent' : 'note'}
            </span>
            <span className="text-[10px]" style={{ color: '#666' }}>{noteLinks.length} links</span>
          </div>
        </div>
      )}

      {/* ---- RECALL FLOATING PANEL ---- */}
      {recallOpen && (
        <div
          ref={recallElRef}
          className="absolute z-40 flex flex-col"
          style={{ borderRadius: 16, overflow: 'hidden' }}
        >
          <div className="relative flex-1 min-h-0">
            <RecallPanel
              width="100%"
              onClose={() => onRecallOpenChange?.(false)}
              maximized={recallBoxRef.current.maxed}
              onToggleMaximize={toggleRecallMax}
              onDragStart={dragRecall}
            />
          </div>
          {!recallBoxRef.current.maxed && (
            <div
              onPointerDown={resizeRecall}
              title="Drag to resize"
              className="absolute bottom-0 right-0 z-10"
              style={{ width: 18, height: 18, cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.5) 50%)' }}
            />
          )}
        </div>
      )}
    </div>
  );
}