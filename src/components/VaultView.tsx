import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Search, Plus, Copy, Trash2, Lock, Globe, CreditCard, Wifi, KeyRound, Eye, EyeOff, Check } from 'lucide-react';

interface VaultItem {
  id: number;
  kind: 'password' | 'card' | 'note' | 'wifi';
  name: string;
  username?: string;
  secret?: string;
  url?: string;
}

const SEED: VaultItem[] = [
  { id: 1, kind: 'password', name: 'Gmail — mazin@umbra.ai', username: 'mazin@umbra.ai', secret: 'pYx9!qLz2#mN7@', url: 'mail.google.com' },
  { id: 2, kind: 'password', name: 'Supabase production', username: 'root', secret: 'sb-9f2-kD31#qa', url: 'supabase.com' },
  { id: 3, kind: 'card', name: 'Umbra Corporate · Visa', username: '•••• 4821', secret: '4521 8890 3312 4821', url: '12/29' },
  { id: 4, kind: 'wifi', name: 'UmbraLab 5GHz', username: 'umbralab-5g', secret: 'Gr33nfield*24', url: 'WPA2-Personal' },
  { id: 5, kind: 'note', name: 'Recovery phrases', username: 'Solana mainnet', secret: 'mnemonic · 24 words', url: '—' },
  { id: 6, kind: 'password', name: 'AWS root console', username: 'mazin+aws', secret: 'aws#Rr11!dRf4', url: 'console.aws.amazon.com' },
  { id: 7, kind: 'card', name: 'Amex · Business Gold', username: '•••• 0031', secret: '3782 8224 6310 0031', url: '05/28' },
  { id: 8, kind: 'password', name: 'Notion workspace', username: 'mazin@umbra.ai', secret: 'n0t1on#Rb9&', url: 'notion.so' },
  { id: 9, kind: 'note', name: 'Recovery codes · GitHub', username: 'mazin-o', secret: 'backup · 8 codes', url: 'github.com' },
  { id: 10, kind: 'wifi', name: 'Umbra HQ · Guest', username: 'umbra-guest', secret: 'Umbra#Guest1', url: 'WPA2-Personal' },
];

const KIND_META: Record<VaultItem['kind'], { icon: typeof Globe; label: string }> = {
  password: { icon: KeyRound, label: 'Password' },
  card: { icon: CreditCard, label: 'Card' },
  note: { icon: Lock, label: 'Note' },
  wifi: { icon: Wifi, label: 'WiFi' },
};

export function VaultView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [items, setItems] = useState<VaultItem[]>(SEED);
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; secret: string }>({ name: '', secret: '' });

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (listRef.current) {
        tl.fromTo(listRef.current.querySelectorAll('.vault-row'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.03 }, '-=0.15');
      }
    }, [headerRef, listRef]);
    return () => ctx.revert();
  }, [unlocked]);

  const filtered = items.filter((i) => `${i.name} ${i.username} ${i.url}`.toLowerCase().includes(query.toLowerCase()));

  const copy = (id: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setCopied(id);
    setTimeout(() => setCopied(null), 1400);
  };

  const remove = (id: number) => setItems((cur) => cur.filter((i) => i.id !== id));

  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((cur) => [...cur, { id: Date.now(), kind: 'password', name: draft.name, secret: draft.secret || '••••', url: '—' }]);
    setDraft({ name: '', secret: '' });
    setAdding(false);
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6">
        <div className="card w-full max-w-sm p-8 text-center" style={{ background: 'var(--surface-1)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
            <Lock size={22} />
          </div>
          <h1 className="hero-heading font-black uppercase tracking-tight text-xl">Vault Locked</h1>
          <p className="text-xs font-light mt-1 mb-5" style={{ color: 'var(--text-dim)' }}>
            Everything is encrypted with your master key. This screen never leaves your machine.
          </p>
          <input
            type="password"
            value={masterKey}
            onChange={(e) => setMasterKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && masterKey.length >= 8 && setUnlocked(true)}
            placeholder="Master key · 8+ characters"
            className="w-full px-3 py-2.5 rounded-xl outline-none text-center text-sm mb-3"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
          />
          <button
            onClick={() => setUnlocked(true)}
            disabled={masterKey.length < 8}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 transition-opacity"
            style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
          >
            Unlock Vault
          </button>
          <button className="text-[11px] mt-4" style={{ color: 'var(--text-faint)', cursor: 'pointer' }}>
            Forgot master key?
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Vault</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            {items.length} items · AES-256 · offline-first
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vault…"
              className="bg-transparent outline-none text-sm w-40"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
          </div>
          <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }}>
            <Plus size={13} /> {adding ? 'Cancel' : 'Add item'}
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 880, width: '100%', margin: '0 auto' }}>
        {adding && (
          <div className="card p-4 mb-4 flex gap-3" style={{ background: 'var(--surface-1)' }}>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Name — e.g. Twitter admin"
              className="flex-1 px-3 py-2 rounded-xl outline-none text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
            <input
              value={draft.secret}
              onChange={(e) => setDraft((d) => ({ ...d, secret: e.target.value }))}
              placeholder="Secret"
              className="flex-1 px-3 py-2 rounded-xl outline-none text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
            <button onClick={addItem} className="px-4 rounded-xl text-sm" style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
              Save
            </button>
          </div>
        )}

        {filtered.map((i) => {
          const Icon = KIND_META[i.kind].icon;
          const isRevealed = revealed.has(i.id);
          const isCopied = copied === i.id;
          return (
            <div key={i.id} className="vault-row card flex items-center gap-4 px-4 py-3 mb-2 group" style={{ background: 'var(--surface-1)' }}>
              <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                <Icon size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{i.name}</span>
                  {i.url && i.url !== '—' && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
                      <Globe size={9} /> {i.url}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono mt-0.5 truncate" style={{ color: isRevealed ? 'var(--text-primary)' : 'var(--text-faint)' }}>
                  {isRevealed ? i.secret : '••••••••••••'}
                </p>
              </div>
              <button
                onClick={() => { setRevealed((r) => { const n = new Set(r); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; }); }}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors opacity-60 group-hover:opacity-100"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-dim)' }}
                title="Reveal / hide"
              >
                {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                onClick={() => copy(i.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors opacity-60 group-hover:opacity-100"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: isCopied ? '#22c55e' : 'var(--text-dim)' }}
                title="Copy to clipboard"
              >
                {isCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button
                onClick={() => remove(i.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: '#ef4444' }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm font-light text-center py-16" style={{ color: 'var(--text-faint)' }}>Nothing in the vault matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}
