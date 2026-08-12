import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useAppStore } from './stores/appStore';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { AgentView } from './components/AgentView';
import { RecallView } from './components/RecallView';
import { BrainView } from './components/BrainView';
import { DevicesView } from './components/DevicesView';
import { SettingsView } from './components/SettingsView';
import { SkillsView } from './components/SkillsView';
import { VaultView } from './components/VaultView';
import { ConnectorsView } from './components/ConnectorsView';
import { MeetingsView } from './components/MeetingsView';
import { UsageView } from './components/UsageView';
import { PhoneView } from './components/PhoneView';
import { Desktop2View } from './components/Desktop2View';
import { UmbraBar } from './components/UmbraBar';
import GlitterWrap from './components/GlitterWrap';

const viewComponents: Record<string, React.FC> = {
  agent: AgentView,
  recall: RecallView,
  brain: BrainView,
  devices: DevicesView,
  skills: SkillsView,
  vault: VaultView,
  connectors: ConnectorsView,
  meetings: MeetingsView,
  usage: UsageView,
  phone: PhoneView,
  desktop2: Desktop2View,
  settings: SettingsView,
};

function ViewRenderer() {
  const { currentView } = useAppStore();
  const ref = useRef<HTMLDivElement>(null);
  const prevView = useRef(currentView);
  const ViewComponent = viewComponents[currentView];

  useEffect(() => {
    if (prevView.current !== currentView && ref.current) {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }
      );
      prevView.current = currentView;
    }
  }, [currentView]);

  return (
    <div ref={ref} className="flex-1 overflow-hidden">
      <ViewComponent />
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isOnboarded, isAuthReady, currentView, initializeAuth } = useAppStore();

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  const isBarWindow = new URLSearchParams(window.location.search).get('view') === 'bar';
  if (isBarWindow) {
    return <UmbraBar />;
  }

  if (!isAuthReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div
          className="orb"
          style={{ width: 56, height: 56, background: 'var(--accent-gradient)', border: 'none', boxShadow: '0 0 40px rgba(59,130,246,0.35)' }}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (!isOnboarded) {
    return <OnboardingScreen />;
  }

  return (
    <div className="fixed inset-0" style={{ background: 'var(--bg)' }}>
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: 0.85 }}>
        <GlitterWrap
          particleCount={420}
          color1="#ffffff"
          color2="#60A5FA"
          color3="#3B82F6"
          speed={4}
          density={55}
          starSize={9}
          focalDepth={14}
          turbulence={0}
          brightness={65}
          glitterIntensity={4}
          trailAmount={96}
          reverse={false}
        />
      </div>

      <div className="relative z-10 h-full">
        {!isAuthenticated ? (
          <LoginScreen />
        ) : (
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {currentView === 'agent' ? <ViewRenderer /> : (
                <>
                  <TitleBar />
                  <ViewRenderer />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
