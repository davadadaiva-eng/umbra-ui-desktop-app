import { useMemo, useRef, useEffect, useState, type JSX } from 'react';
import gsap from 'gsap';
import { useAppStore } from '../stores/appStore';
import { Search, Cpu, Hammer, Play, Layout, TrendingUp, Share2, Megaphone, Handshake, Clapperboard, Phone, Scale, LifeBuoy, BarChart3, ShieldCheck, Route, Users, Cloud, Newspaper, Languages, Rocket, Truck, Lightbulb, Sparkles, Wrench } from 'lucide-react';

interface MicroSkill {
  id: string;
  name: string;
}

interface SkillDomain {
  n: number;
  title: string;
  tagline: string;
  icon: JSX.Element;
  skills: MicroSkill[];
}

const DOMAINS: SkillDomain[] = [
  { n: 1, title: 'Tax & Accounting', tagline: 'Il Commercialista Digitale', icon: <Scale size={15} />, skills: [
    { id: 'tax-ai/regime-fiscale-analyzer', name: 'Regime fiscale analyzer — simulation of tax regimes (Forfettario, Semplificato, Ordinario, SRL)' },
    { id: 'accounting/f24-tax-calculator', name: 'F24 tax calculator — withholding, contributions and F24 generation' },
    { id: 'finance-pro/deduzioni-detrazioni', name: 'Deductions & reliefs — maximize legal tax deductions from invoices' },
    { id: 'invoicing/e-fattura-validator', name: 'E-fattura validator — formal & semantic SDI validation' },
    { id: 'tax-tech/cassetto-fiscale-sync', name: 'Cassetto fiscale sync — deadlines, notices and fiscal standing' },
  ] },
  { n: 2, title: 'Frontend & UI/UX', tagline: "L'Eccellenza Visiva", icon: <Layout size={15} />, skills: [
    { id: 'emilkowalski/skill', name: 'Design engineering — fluid transitions and spring physics' },
    { id: 'Leonxlnx/taste-skill', name: 'Typographic hierarchy — rhythmic spacing, high-end minimal design' },
    { id: 'shadcn-ui/agent-skills', name: 'Accessible components — Tailwind + Radix native integration' },
    { id: 'gsap-ai/motion-skills', name: 'Motion design — scroll-driven animations and cinematic layout' },
    { id: 'vercel/agent-react-skills', name: 'Clean React patterns — virtual DOM optimization' },
    { id: 'tailwindlabs/tailwindcss-skills', name: 'Design-system guard — coherent utility usage' },
  ] },
  { n: 3, title: 'SEO & Growth', tagline: 'Visibilità Organica', icon: <TrendingUp size={15} />, skills: [
    { id: 'coreyhaines31/marketingskills', name: 'Technical SEO audits and keyword clustering' },
    { id: 'openclaudia/openclaudia-skills', name: 'Core Web Vitals assessment and site scanning' },
    { id: 'growth-engineering/programmatic-seo', name: 'Scalable page generation from structured data' },
    { id: 'twominutereports/marketing-skills', name: 'Search Console & GA4 traffic trend analysis' },
    { id: 'topoteretes/cognee', name: 'Semantic memory mapping of domain authority' },
  ] },
  { n: 4, title: 'Social & Content', tagline: 'Viralità & Brand Awareness', icon: <Share2 size={15} />, skills: [
    { id: 'adkit/ads-skills', name: 'High-retention copywriting frameworks and social psychology' },
    { id: 'openclaudia/social-content-pack', name: 'Editorial calendars for X, LinkedIn, TikTok, IG' },
    { id: 'mutonby/openshorts-skills', name: 'Directorial rules for viral vertical videos' },
    { id: 'hyperfx-ai/marketing-skills', name: 'High-engagement visual & textual pattern analysis' },
    { id: 'blader/humanizer', name: 'Natural copy — strips robotic styling' },
  ] },
  { n: 5, title: 'Paid Ads', tagline: 'Acquisizione a Pagamento', icon: <Megaphone size={15} />, skills: [
    { id: 'hyperfx-ai/marketing-skills', name: 'Budget & audience targeting via MCP layers' },
    { id: 'adkit/google-ads-optimizer', name: 'Keyword optimization, bidding and CTR maximization' },
    { id: 'adkit/meta-ads-scaling', name: 'Audience segmentation and creative fatigue mitigation' },
    { id: 'adkit/tiktok-ads-master', name: 'Sponsored short-form positioning frameworks' },
    { id: 'coreyhaines31/paid-media-framework', name: 'ROI analysis, CAC/LTV and retargeting flows' },
  ] },
  { n: 6, title: 'Sales & Copy', tagline: 'Vendite e Chiusura', icon: <Handshake size={15} />, skills: [
    { id: 'coreyhaines31/copywriting-masterclass', name: 'AIDA, PAS and Hook-Story-Offer frameworks' },
    { id: 'sales-automation/email-sequences', name: 'Personalized outbound sequences for response' },
    { id: 'openclaudia/landing-page-conversion', name: 'Friction-removal copy rewriting' },
    { id: 'koinod/sales-psychology', name: 'Urgency, scarcity and social proof triggers' },
    { id: 'openclaw/funnel-architecture', name: 'End-to-end logical sales funnel design' },
  ] },
  { n: 7, title: 'Video & Multimedia', tagline: 'Produzione Video & Audio', icon: <Clapperboard size={15} />, skills: [
    { id: '0xsline/OpenChatCut-skills', name: 'Multi-track timeline management and clipping' },
    { id: 'DojoCodingLabs/remotion-superpowers', name: 'Programmatic Remotion — transitions & voiceover sync' },
    { id: 'av/remotion-bits-mcp', name: 'Animated component library, fetched instantly' },
    { id: 'vibe-voice/synthesis-skills', name: 'Emotional parameters and synthetic voice sync' },
    { id: 'remotion-dev/render-pipeline', name: 'Headless cloud rendering with FFmpeg' },
  ] },
  { n: 8, title: 'Meetings & AgentPhone', tagline: 'Comunicazione Vocale', icon: <Phone size={15} />, skills: [
    { id: 'agentphone/realtime-voice-skills', name: 'Low-latency bidirectional voice calling flows' },
    { id: 'googleworkspace/cli-meet', name: 'Transcription, summarization and action items' },
    { id: 'openclaudia/meeting-intelligence', name: 'Sentiment analysis and key point extraction' },
    { id: 'vibe-voice/realtime-stream', name: 'Real-time streaming text-to-speech' },
    { id: 'ai-agents/call-routing', name: 'Intelligent call queue handling and routing' },
  ] },
  { n: 9, title: 'Legal & Compliance', tagline: 'Protezione e Normative', icon: <Scale size={15} />, skills: [
    { id: 'openclaudia/legal-compliance', name: 'Privacy, Cookie Policies and Terms generation' },
    { id: 'gdpr-automation/consent-manager', name: 'GDPR consent management and tracking' },
    { id: 'ai-law/copyright-validator', name: 'Copyright infringement checks for assets' },
    { id: 'enterprise-security/compliance-checker', name: 'Security benchmark code audits' },
    { id: 'legal-tech/contract-analyzer', name: 'Critical clause extraction from contracts & NDAs' },
  ] },
  { n: 10, title: 'Customer Support', tagline: 'Assistenza e Fidelizzazione', icon: <LifeBuoy size={15} />, skills: [
    { id: 'support-ai/ticket-routing', name: 'Automated classification and triage of tickets' },
    { id: 'intercom-skills/auto-resolver', name: 'Contextual responses from official docs' },
    { id: 'sentiment-analysis/churn-predictor', name: 'Early churn detection from dissatisfaction' },
    { id: 'customer-success/onboarding-flows', name: 'Interactive guided paths via chat or voice' },
    { id: 'knowledge-base/auto-writer', name: 'Resolved tickets into FAQs and guides' },
  ] },
  { n: 11, title: 'Data & BI', tagline: 'Metriche e Decisioni', icon: <BarChart3 size={15} />, skills: [
    { id: 'analytics-pro/sql-query-generator', name: 'SQL writing & optimization (Tencent DB, Supabase)' },
    { id: 'growth-engine/kpi-tracker', name: 'Real-time MRR, Churn, CAC and LTV tracking' },
    { id: 'bi-agents/dashboard-builder', name: 'Autonomous dashboard and report generation' },
    { id: 'cohort-analysis/retention-metrics', name: 'Behavioral cohort analysis over time' },
    { id: 'anomaly-detection/metrics-watchdog', name: 'Early-warning KPI anomaly alerts' },
  ] },
  { n: 12, title: 'Cybersecurity', tagline: 'Sicurezza Infrastruttura e AI', icon: <ShieldCheck size={15} />, skills: [
    { id: 'ai-security/prompt-firewall', name: 'Prompt injection and jailbreak defense' },
    { id: 'cybersec/vulnerability-scanner', name: 'Container dependency CVE scanning' },
    { id: 'auth-sec/jwt-oauth-master', name: 'Token lifecycle, auth and E2E encryption' },
    { id: 'data-privacy/pii-redactor', name: 'Automatic PII masking before API calls' },
    { id: 'infosec/rate-limiting-guard', name: 'DDoS and cloud resource abuse protection' },
  ] },
  { n: 13, title: 'Product Management', tagline: 'Visione di Prodotto', icon: <Route size={15} />, skills: [
    { id: 'product-ai/prn-generator', name: 'Detailed PRD generation' },
    { id: 'agile-master/backlog-grooming', name: 'Backlog estimation and prioritization' },
    { id: 'user-feedback/synthesizer', name: 'Feedback aggregation into high-demand features' },
    { id: 'roadmap-planner/timeline-engine', name: 'Roadmaps mapped to milestones & cloud resources' },
  ] },
  { n: 14, title: 'HR & Operations', tagline: 'Gestione Risorse & Operazioni', icon: <Users size={15} />, skills: [
    { id: 'hr-ai/cv-screener', name: 'CV and portfolio evaluation' },
    { id: 'interview-bot/evaluator', name: 'Technical questions and behavioral test suites' },
    { id: 'ops-automation/workflow-orchestrator', name: 'Internal operational process optimization' },
    { id: 'onboarding-hr/employee-handbook', name: 'Guides and onboarding paths for staff or agents' },
  ] },
  { n: 15, title: 'DevOps & Cloud', tagline: 'Infrastruttura & DevOps', icon: <Cloud size={15} />, skills: [
    { id: 'devops-ai/docker-orchestrator', name: 'Dockerfile optimization and resource limiting' },
    { id: 'cloud-infra/auto-scaling-rules', name: 'Predictive container scaling on workloads' },
    { id: 'ci-cd/pipeline-generator', name: 'GitHub Actions / GitLab CI pipelines' },
    { id: 'k8s-master/cluster-health', name: 'Network diagnostics, crash & leak resolution' },
    { id: 'infra-sec/backup-restore-bot', name: 'Automated snapshots and disaster recovery' },
  ] },
  { n: 16, title: 'PR & Crisis', tagline: 'Ufficio Stampa & Gestione Crisi', icon: <Newspaper size={15} />, skills: [
    { id: 'pr-expert/press-release-writer', name: 'Press releases for tech and financial press' },
    { id: 'crisis-management/sentiment-watchdog', name: 'Continuous online mention monitoring' },
    { id: 'media-relations/pitch-generator', name: 'Customized journalist pitch emails' },
    { id: 'brand-reputation/crisis-response', name: 'Communication strategies and official statements' },
    { id: 'thought-leadership/author-voice', name: 'High-profile op-ed development' },
  ] },
  { n: 17, title: 'Localization', tagline: 'Localizzazione Globale', icon: <Languages size={15} />, skills: [
    { id: 'localization-ai/native-translator', name: 'Contextual translation with slang and idioms' },
    { id: 'i18n-dev/codebase-localizer', name: 'i18n file management (JSON/PO) for multi-language UIs' },
    { id: 'cultural-fit/market-validator', name: 'Compliance analysis of international marketing copy' },
    { id: 'multilingual-seo/hreflang-manager', name: 'International SEO and hreflang tags' },
    { id: 'dubbing-sync/multilingual-audio', name: 'Multi-language audio timing adaptation' },
  ] },
  { n: 18, title: 'Fundraising & VC', tagline: 'Finanza Straordinaria', icon: <Rocket size={15} />, skills: [
    { id: 'vc-pitch/deck-generator', name: 'Silicon Valley-standard investor decks' },
    { id: 'finance-model/saas-metrics', name: 'Predictive modeling — LTV/CAC, burn, runway' },
    { id: 'investor-relations/data-room-manager', name: 'Virtual Data Rooms for due diligence' },
    { id: 'valuation-engine/company-worth', name: 'DCF and market-multiple valuation' },
    { id: 'term-sheet/clause-analyzer', name: 'Term sheet analysis and negotiation advisory' },
  ] },
  { n: 19, title: 'Supply Chain', tagline: 'Logistica & Forniture', icon: <Truck size={15} />, skills: [
    { id: 'logistics-ai/inventory-tracker', name: 'Real-time stock monitoring with reordering' },
    { id: 'supply-chain/vendor-optimizer', name: 'Global supplier cost comparison' },
    { id: 'shipping-manager/fulfillment-bot', name: 'Shipment tracking with delay alerts' },
    { id: 'procurement/smart-contract-rfq', name: 'Automated RFQ generation to partners' },
    { id: 'warehouse-ops/cost-reduction', name: 'Storage and handling cost optimization' },
  ] },
  { n: 20, title: 'IP & Patents', tagline: 'Proprietà Intellettuale & Brevetti', icon: <Lightbulb size={15} />, skills: [
    { id: 'ip-expert/prior-art-search', name: 'Global patent database originality scans' },
    { id: 'patent-ai/claims-writer', name: 'Technical claims drafting (USPTO / EUIPO)' },
    { id: 'trademark-guard/brand-protection', name: 'Domain, social and trademark registry monitoring' },
    { id: 'open-source/license-auditor', name: 'Dependency license compliance checks' },
    { id: 'ip-strategy/portfolio-manager', name: 'Corporate IP portfolio strategy' },
  ] },
];

export function SkillsView() {
  const { avatar } = useAppStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [openDomains, setOpenDomains] = useState<Set<number>>(() => new Set([1, 2, 3]));

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } });
      tl.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0 });
      if (listRef.current) {
        tl.fromTo(listRef.current.querySelectorAll('.skill-domain'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.04 }, '-=0.15');
      }
    }, [headerRef, listRef]);
    return () => ctx.revert();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOMAINS;
    return DOMAINS.map((d) => ({
      ...d,
      skills: d.skills.filter((s) => `${s.id} ${s.name}`.toLowerCase().includes(q)),
    })).filter((d) => d.skills.length > 0 || `${d.title} ${d.tagline}`.toLowerCase().includes(q));
  }, [query]);

  const totalSkills = DOMAINS.reduce((n, d) => n + d.skills.length, 0);

  const toggle = (n: number) => {
    setOpenDomains((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div ref={headerRef} className="px-6 py-5 hairline-b flex items-end justify-between gap-4" style={{ background: 'rgba(6,7,9,0.68)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div>
          <h1 className="hero-heading font-black uppercase tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)' }}>Skills</h1>
          <p className="text-sm mt-1 font-light" style={{ color: 'var(--text-dim)' }}>
            Skill Stack Matrix — {DOMAINS.length} domains · {totalSkills} micro-skills
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 rounded-xl" style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)' }}>
            <Search size={13} style={{ color: 'var(--text-faint)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills…"
              className="bg-transparent outline-none text-sm w-40"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
            />
          </div>
          <button className="flex items-center gap-1.5 px-3.5 rounded-xl" style={{ height: 34, background: avatar.accent, color: '#fff', border: 'none', fontFamily: 'var(--font)', fontSize: 12 }}>
            <Cpu size={13} /> Router
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div className="card p-4 mb-5 flex items-center gap-4" style={{ background: 'var(--surface-1)' }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${avatar.accent}1c`, color: avatar.accent, border: `1px solid ${avatar.accent}44` }}>
            <Sparkles size={16} />
          </span>
          <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Every domain is a self-contained skill pack the router invokes on demand — the agent selects the narrowest relevant skill instead of loading the whole matrix, keeping every call fast and cheap under the Graphify-Caveman protocol.
          </p>
          <button className="btn-ghost flex-shrink-0 flex items-center gap-1.5" style={{ height: 30, fontSize: 11 }}>
            <Hammer size={12} /> Compile workflow
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => {
            const open = openDomains.has(d.n);
            return (
              <div key={d.n} className="skill-domain card overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                <button onClick={() => toggle(d.n)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left" style={{ cursor: 'pointer' }}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)', color: avatar.accent, border: '1px solid var(--hairline-strong)' }}>
                    {d.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold" style={{ color: 'var(--text-faint)' }}>{String(d.n).padStart(2, '0')}</span>
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>{d.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)', color: 'var(--text-faint)' }}>
                        {d.skills.length}
                      </span>
                    </div>
                    <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--text-dim)' }}>{d.tagline}</p>
                  </div>
                  <Wrench size={13} style={{ color: 'var(--text-faint)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
                {open && (
                  <div className="px-4 pb-3.5 space-y-1">
                    {d.skills.map((s) => (
                      <div key={s.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors" style={{ background: 'rgba(255,255,255,0.022)' }}>
                        <span className="text-[10px] font-mono flex-1 truncate" style={{ color: 'var(--text-dim)' }} title={s.name}>
                          {s.id}
                        </span>
                        <button
                          className="flex items-center justify-center rounded-md transition-colors opacity-60 group-hover:opacity-100"
                          style={{ width: 24, height: 24, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: avatar.accent }}
                          title="Run skill"
                        >
                          <Play size={11} />
                        </button>
                        <button
                          className="flex items-center justify-center rounded-md transition-colors opacity-60 group-hover:opacity-100"
                          style={{ width: 24, height: 24, background: 'var(--surface-2)', border: '1px solid var(--hairline-strong)', color: 'var(--text-faint)' }}
                          title="Compile into a native .exe"
                        >
                          <Hammer size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm font-light text-center py-16" style={{ color: 'var(--text-faint)' }}>No skills match “{query}”.</p>
        )}
      </div>
    </div>
  );
}
