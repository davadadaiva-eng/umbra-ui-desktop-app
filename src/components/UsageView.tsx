import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { isBackendAvailable, getPlanUsage, getAuditStats, activatePlan, billingCheckout, getTenants, registerTenant, type BackendError } from '../lib/backend';
import { TrendingUp, TrendingDown, Zap, BarChart3, Clock, AlertTriangle, ArrowUpRight, CircleDollarSign, Shield, Users, CreditCard } from 'lucide-react';

const DAYS = 30;
const TOTAL_DAYS = 31;

function buildSeries() {
  const base = 840;
  const jitter = (n: number) => base + Math.round(Math.sin(n * 1.7) * 260 + Math.sin(n * 0.6) * 190 + (n % 3) * 120);
  const series = Array.from({ length: DAYS }, (_, i) => Math.max(180, jitter(DAYS - i)));
  return series;
}

function maxIndex(arr: number[]) {
  return arr.indexOf(Math.max(...arr));
}

const AGENT_COLORS = ['#f59e0b', '#818cf8', '#34d399', '#f472b6', '#22d3ee', '#a3e635', '#64748b', '#60a5fa', '#fb7185', '#fbbf24'];

export function UsageView() {
  const { avatar, usage } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<'30d' | '90d' | '12m'>('30d');
  const [auditStats, setAuditStats] = useState<Record<string, unknown> | null>(null);
  const [tenants, setTenants] = useState<unknown[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantTier, setTenantTier] = useState('');
  const [activatingTier, setActivatingTier] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const series = useRef(buildSeries()).current;
  const peak = maxIndex(series);
  const agentRows = Object.entries(usage.agents)
    .map(([name, u]) => ({ name, calls: u.calls, tokens: u.tokens }))
    .sort((a, b) => b.tokens - a.tokens);
  const maxAgentTokens = Math.max(1, ...agentRows.map((a) => a.tokens));
  const creditsUsed = Math.ceil(usage.totalTokens / 1000);
  const estCost = creditsUsed * 0.01;
  const avgTokens = usage.totalCalls ? Math.round(usage.totalTokens / usage.totalCalls) : 0;

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.45 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (bodyRef.current) {
        tl.fromTo(bodyRef.current.querySelectorAll('.usage-block'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.05 }, '-=0.15');
      }
      const bars = bodyRef.current?.querySelectorAll('.usage-bar');
      if (bars) {
        tl.fromTo(bars, { scaleY: 0.05, transformOrigin: 'bottom' }, { scaleY: 1, stagger: 0.012, duration: 0.7, ease: 'power1.out' }, '-=0.5');
      }
    }, [headerRef, bodyRef]);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const data = await getPlanUsage();
        if (cancelled || !data) return;
        void data;
      } catch { /* keep local data */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isBackendAvailable())) return;
      try {
        const [stats, tenantList] = await Promise.all([getAuditStats(), getTenants()]);
        if (cancelled) return;
        if (stats) setAuditStats(stats as Record<string, unknown>);
        if (tenantList) setTenants((tenantList as { tenants: unknown[] }).tenants ?? []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleActivate = async (tier: string) => {
    setActivatingTier(tier);
    try {
      await activatePlan(tier);
    } catch { /* silent */ }
    setActivatingTier(null);
  };

  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(tier);
    try {
      const res = await billingCheckout(tier);
      if (res?.checkout?.url) window.open(res.checkout.url, '_blank');
    } catch { /* silent */ }
    setCheckoutLoading(null);
  };

  const handleRegisterTenant = async () => {
    setRegisterError('');
    setRegisterSuccess('');
    if (!tenantId.trim()) { setRegisterError('Tenant ID is required.'); return; }
    try {
      await registerTenant(tenantId.trim(), tenantName.trim() || undefined, tenantTier.trim() || undefined);
      setRegisterSuccess('Tenant registered.');
      setTenantId('');
      setTenantName('');
      setTenantTier('');
      const updated = await getTenants();
      if (updated) setTenants((updated as { tenants: unknown[] }).tenants ?? []);
    } catch (e) {
      setRegisterError((e as BackendError).message || 'Registration failed');
    }
  };

  const max = Math.max(...series);
  const plan = 'Growth';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Usage</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Graphify-Caveman protocol · cost & call telemetry
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
          {(['30d', '90d', '12m'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: range === r ? avatar.accent : 'transparent',
                color: range === r ? '#fff' : 'var(--text-dim)',
                fontFamily: 'var(--font)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1040, width: '100%', margin: '0 auto' }}>
        <div className="usage-block grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total calls', value: usage.totalCalls.toLocaleString('en-US'), sub: `${agentRows.length} agent${agentRows.length === 1 ? '' : 's'} active`, good: true },
            { label: 'Credits used', value: creditsUsed.toLocaleString('en-US'), sub: `${avgTokens.toLocaleString('en-US')} tokens / call`, good: true },
            { label: 'Est. cost', value: `$${estCost.toFixed(2)}`, sub: '$0.01 per 1,000 tokens', good: false },
            { label: 'Active agents', value: String(agentRows.length), sub: 'on this device', good: true },
          ].map((k) => (
            <div key={k.label} className="card p-4" style={{ background: 'var(--surface-1)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-faint)' }}>{k.label}</p>
              <p className="mt-2 text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{k.value}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: k.good ? '#22c55e' : '#f59e0b' }}>
                {k.good ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                {k.sub}
              </p>
            </div>
          ))}
        </div>

        {auditStats && (
          <div className="usage-block card p-4 mb-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
                <Shield size={14} />
              </span>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Audit Vault</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total entries', value: String((auditStats as Record<string, unknown>).entries ?? (auditStats as Record<string, unknown>).totalEntries ?? '—') },
                { label: 'Last entry', value: (auditStats as Record<string, unknown>).lastEntryTime ? new Date(String((auditStats as Record<string, unknown>).lastEntryTime)).toLocaleDateString() : '—' },
                { label: 'Integrity', value: (auditStats as Record<string, unknown>).integrity === true || (auditStats as Record<string, unknown>).integrityOk === true ? 'Verified' : 'Unknown' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg p-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{s.label}</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="usage-block card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
                <BarChart3 size={14} />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Skill calls · daily</p>
                <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>{TOTAL_DAYS}-day rolling window · {range}</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
              <Zap size={11} /> {peak + 1} days ago peak {series[peak].toLocaleString('en-US')}
            </span>
          </div>

          <div className="flex items-end gap-[3px]" style={{ height: 180 }}>
            {series.map((v, i) => (
              <div
                key={i}
                className="usage-bar flex-1 rounded-t-[3px] transition-opacity"
                style={{
                  height: `${(v / max) * 100}%`,
                  background: i === peak ? avatar.accent : 'var(--surface-3)',
                  border: '1px solid var(--hairline)',
                }}
                title={`Day ${i + 1}: ${v.toLocaleString('en-US')} calls`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[9px]" style={{ color: 'var(--text-faint)' }}>
            <span>{TOTAL_DAYS} days ago</span>
            <span>Today</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div className="usage-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                <CircleDollarSign size={14} />
              </span>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Usage by agent</p>
            </div>
            {agentRows.length === 0 ? (
              <p className="text-[12px] font-light leading-relaxed" style={{ color: 'var(--text-faint)' }}>
                No usage yet — talk to your agents (or your crew) and the calls, tokens and credits will show up here.
              </p>
            ) : (
              <div className="space-y-3">
                {agentRows.map((a, i) => (
                  <div key={a.name}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono truncate" style={{ color: 'var(--text-dim)' }}>{a.name}</span>
                      <span className="flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                        {a.calls} calls · {(a.tokens / 1000).toFixed(1)}k tokens
                      </span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'var(--surface-3)' }}>
                      <div className="rounded-full" style={{ width: `${(a.tokens / maxAgentTokens) * 100}%`, height: '100%', background: AGENT_COLORS[i % AGENT_COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="usage-block card p-5" style={{ background: 'var(--surface-1)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: '#f59e0b', border: '1px solid var(--hairline-strong)' }}>
                <AlertTriangle size={14} />
              </span>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Anomalies & budget</p>
            </div>
            <div className="space-y-2.5">
              {[
                { t: 'Context saturation', d: 'tax-ai peaked at 1.98M tokens/day — consider narrower router pruning.', icon: <Clock size={12} />, tone: '#f59e0b' },
                { t: 'Cost spike detected', d: 'Voice calls jumped 31% on July 27 — review AgentPhone routing.', icon: <TrendingUp size={12} />, tone: '#ef4444' },
                { t: `Budget · ${plan}`, d: 'You are at 41% of monthly budget · 22 days remaining.', icon: <ArrowUpRight size={12} />, tone: '#22c55e' },
              ].map((x) => (
                <div key={x.t} className="flex items-start gap-3 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.022)', border: '1px solid var(--hairline)' }}>
                  <span className="mt-0.5 flex-shrink-0" style={{ color: x.tone }}>{x.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{x.t}</p>
                    <p className="text-[11px] font-light leading-snug" style={{ color: 'var(--text-dim)' }}>{x.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="usage-block card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
              <CreditCard size={14} />
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Plan & Billing</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { tier: 'Starter', desc: 'Up to 50,000 calls/mo' },
              { tier: 'Growth', desc: 'Up to 1,000,000 calls/mo' },
            ].map((p) => (
              <div key={p.tier} className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{p.tier}</p>
                  <p className="text-[11px] font-light" style={{ color: 'var(--text-dim)' }}>{p.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleActivate(p.tier)}
                    disabled={activatingTier === p.tier}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
                  >
                    {activatingTier === p.tier ? 'Activating…' : 'Activate'}
                  </button>
                  <button
                    onClick={() => void handleCheckout(p.tier)}
                    disabled={checkoutLoading === p.tier}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{ background: 'var(--surface-1)', color: 'var(--text-dim)', border: '1px solid var(--hairline-strong)', fontFamily: 'var(--font)' }}
                  >
                    {checkoutLoading === p.tier ? 'Loading…' : 'Checkout'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="usage-block card p-5 mb-5" style={{ background: 'var(--surface-1)' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
              <Users size={14} />
            </span>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Tenants</p>
          </div>

          {tenants.length > 0 ? (
            <div className="space-y-2 mb-4">
              {tenants.map((t, i) => {
                const tenant = t as Record<string, unknown>;
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{String(tenant.name ?? tenant.id ?? `Tenant ${i + 1}`)}</span>
                      {tenant.tier ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: `${avatar.accent}22`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>{String(tenant.tier)}</span> : null}
                    </div>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>{String(tenant.id ?? '—')}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] font-light leading-relaxed mb-4" style={{ color: 'var(--text-faint)' }}>No tenants registered yet.</p>
          )}

          <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <p className="text-[11px] uppercase tracking-wide font-semibold mb-3" style={{ color: 'var(--text-faint)' }}>Register tenant</p>
            <div className="flex gap-2 flex-wrap">
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Tenant ID"
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Name (optional)"
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <input
                value={tenantTier}
                onChange={(e) => setTenantTier(e.target.value)}
                placeholder="Tier (optional)"
                className="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
              />
              <button
                onClick={() => void handleRegisterTenant()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}
              >
                Register
              </button>
            </div>
            {registerError && <p className="text-[11px] mt-2" style={{ color: '#ef4444' }}>{registerError}</p>}
            {registerSuccess && <p className="text-[11px] mt-2" style={{ color: '#22c55e' }}>{registerSuccess}</p>}
          </div>
        </div>

        <div className="usage-block card p-5 flex items-center justify-between gap-4" style={{ background: `linear-gradient(120deg, ${avatar.accent}14, transparent)`, border: `1px solid ${avatar.accent}33` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>Growth plan · 1,000,000 calls included</p>
            <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Your teams stay in budget — upgrade doubles your call allocation.
            </p>
          </div>
          <button className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)' }}>
            Upgrade to Scale
          </button>
        </div>
      </div>
    </div>
  );
}
