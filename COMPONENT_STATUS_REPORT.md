# Umbra UI Desktop App — Component Status Report

**Date:** 2026-09-08
**Components:** 20 files analyzed

---

## 1. ConnectorsView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getMcpConnectors, getMcpCatalog, connectMcp, disconnectMcp, mcpOauthStart, mcpSyncRegistry
- **ISSUES:** CRM/Social/Carrusel tabs import separate components (CrmView, SocialView, CarruselView). Hardcoded fallback connectors in state.
- **WHAT_NEEDS:** Real MCP connector persistence after connect. OAuth flow validation for CRM providers. Verify catalog fetches live data.

---

## 2. DevicesView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, backendFetch, deviceInvite, deviceJoin, deviceRevoke, deviceSend, getMeshStatus, meshPair, meshPairDemo, getChromeStatus, getChromeLogins, getChromeSites, getConnectors, disconnectConnector
- **ISSUES:** Hardcoded initial devices (Umbra Phone, Lenovo ThinkPad, Steam Deck OLED). Hardcoded initial connectors (Tailscale, Ultrawide Monitor, Bluetooth Speaker). Chrome logins/sites are seed data.
- **WHAT_NEEDS:** Real device discovery via mesh network. Actual Chrome login integration (not seed data). Remove hardcoded fallbacks.

---

## 3. SmartHomeView.tsx
- **STATUS:** partial
- **WIRED_APIS:** fetchSmartThingsConfig, fetchSmartHomeDevices, sendSwitchCommand (from ../lib/smartthings)
- **ISSUES:** Uses separate smartthings lib, not backend.ts. All devices hardcoded in smartthings.ts fallback.
- **WHAT_NEEDS:** Real SmartThings API integration with OAuth tokens. Dynamic device discovery from hub. Handle offline devices gracefully.

---

## 4. MeetingsView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getMeetings, meetingJoin, meetingLeave, meetingMute, meetingStatus, meetingRaiseHand, meetingChatMessage, meetingSpeakDirect, meetingShare, meetingStopShare, meetingOrders, meetingListen
- **ISSUES:** Simulated transcript with hardcoded line-by-line delivery. Platform API integration is stubbed (Google Meet, Zoom, Teams, Phone).
- **WHAT_NEEDS:** Real platform APIs (Google Meet API, Zoom SDK, Teams Graph API). OAuth flows for each platform. Live transcript from real audio.

---

## 5. UsageView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getPlanUsage, getAuditStats, activatePlan, billingCheckout, getTenants, registerTenant, BackendError
- **ISSUES:** Chart rendering uses canvas context directly (no Chart.js). Hardcoded cost estimates ($3.70/gigabyte, $0.005/credit). Tenant management is UI-only.
- **WHAT_NEEDS:** Real billing integration (Stripe/etc). Accurate cost calculation. Tenant CRUD operations that persist.

---

## 6. PhoneView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getTelcoStatus, configureTelco, telcoCall, BackendError
- **ISSUES:** Seed call data (16 calls). Hardcoded transcript lines. Telco setup is UI-only (no real VoIP).
- **WHAT_NEEDS:** Real telephony backend (Twilio/etc). Live call handling. Actual transcript from speech-to-text.

---

## 7. SkillsView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getMcpCatalog, McpCatalogEntry
- **ISSUES:** Hardcoded skill domains (Tax, Frontend, React, Python, Django, Node, DevOps, UI, Media, Voice, Nano, Agents, Social, Office, Dev). Micro-skills are seed data.
- **WHAT_NEEDS:** Real skill registry from backend. Actual skill deployment/installation. Remove hardcoded domains.

---

## 8. VaultView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, getAuditStats, BackendError
- **ISSUES:** Seed vault items (8 secrets). Client-side hashing (localStorage-based, not real crypto). No actual encryption.
- **WHAT_NEEDS:** Real encrypted storage backend. Proper key management. Actual encryption (WebCrypto or backend).

---

## 9. BrainView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, searchKnowledge, recallMemory, rememberMemory, getMacros, getSessions, getActivitySummary, getPrivacyStats, generateJournal, KnowledgeResult
- **ISSUES:** Agent memory blocks are seed data (7 blocks). Macros are hardcoded. Sessions list is seed data. Activity/privacy views are placeholder.
- **WHAT_NEEDS:** Real knowledge graph backend. Persistent memory storage. Actual session logging. Privacy stats from real usage.

---

## 10. AgentView.tsx
- **STATUS:** working
- **WIRED_APIS:** isBackendAvailable, chat, submitTask, rememberMemory, cancelTask, retryTask, getActiveTasks, Task, aiChat, transcribeAudio, speakWithVoiceStudio, speakWithVoicebox, waitForTaskOutcome, BackendError
- **ISSUES:** viewMap routing is extensive (30+ views). Brain building flow is hardcoded (4 steps). Fallback agent list is seed data.
- **WHAT_NEEDS:** Verify task retry logic works end-to-end. Add error boundaries. Dynamic agent list from backend.

---

## 11. ScreenView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, screenState, screenLive, screenWatch, screenAsk, getGhostCapture, executeDesktop2
- **ISSUES:** Screen capture is placeholder UI (no real screenshot). Ghost capture is stub. Desktop execution is UI-only.
- **WHAT_NEEDS:** Real screen capture backend. Actual desktop automation. Live screen streaming.

---

## 12. SocialView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, socialPostFull, socialSchedule, getSocialSchedule, cancelSocialSchedule, socialStatus, BackendError
- **ISSUES:** Platform support is UI-only (X, YouTube, Instagram). No real API integration. Schedule management is local state.
- **WHAT_NEEDS:** Real platform APIs (X API, YouTube Data API, Instagram Graph API). OAuth tokens. Persistent scheduling.

---

## 13. DockerView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, listDockerContainers, dockerRun, dockerStop, dockerRemove
- **ISSUES:** Container list is seed data (5 containers). Run form is UI-only. No real Docker daemon connection.
- **WHAT_NEEDS:** Real Docker socket connection. Container status polling. Actual container lifecycle management.

---

## 14. CarruselView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, carruselStart, carruselStop, carruselStatus, carruselCreate, carruselList, carruselChat, carruselExport, carruselBrand, carruselDelete, carruselDuplicate
- **ISSUES:** Carousel items are seed data (3 carousels). Chat is UI-only. Brand settings are placeholder. Export is stub.
- **WHAT_NEEDS:** Real carousel generation backend. Actual content pipeline. Brand consistency engine. Export to real formats.

---

## 15. CrmView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, twentyStart, twentyStop, twentyStatus, twentyGraphql
- **ISSUES:** Quick queries are hardcoded GraphQL strings. Results are seed data (5 contacts, 3 companies). CRM status is UI-only.
- **WHAT_NEEDS:** Real Twenty CRM connection. Dynamic query builder. Live data from CRM. OAuth for Twenty.

---

## 16. ImageGenView.tsx
- **STATUS:** partial
- **WIRED_APIS:** isBackendAvailable, generateImage, BackendError
- **ISSUES:** Image generation is UI-only (no real model). Uses window.umbraDesktop bridge for file reading. Seed gallery (6 images).
- **WHAT_NEEDS:** Real image generation service (Stable Diffusion/DALL-E). Actual file upload. Persistent gallery.

---

## 17. ConsentView.tsx
- **STATUS:** working
- **WIRED_APIS:** isBackendAvailable, requestConsent, armEmergencyStop, disarmEmergencyStop
- **ISSUES:** Consent states are seed data (8 states). Emergency stop is UI toggle. No real backend enforcement.
- **WHAT_NEEDS:** Real consent flow backend. Actual emergency stop enforcement. Consent persistence.

---

## 18. RecallView.tsx
- **STATUS:** working
- **WIRED_APIS:** isBackendAvailable, searchKnowledge, KnowledgeResult
- **ISSUES:** Local tokenization index (not real search). Brain notes from brain lib (seed data). No real knowledge graph.
- **WHAT_NEEDS:** Real knowledge backend with embeddings. Actual semantic search. Persistent notes.

---

## 19. RecallPanel.tsx
- **STATUS:** working
- **WIRED_APIS:** backendChat, isBackendAvailable, aiChat, waitForTaskOutcome, answerFor, suggestions
- **ISSUES:** System prompt builder is extensive but UI-only. No streaming support. Recall suggestions are hardcoded.
- **WHAT_NEEDS:** Real streaming AI responses. Dynamic suggestions from knowledge graph. Integrate with backend chat.

---

## 20. KnowledgeGraph.tsx
- **STATUS:** working
- **WIRED_APIS:** (none — purely frontend visualization)
- **ISSUES:** Canvas-based force-directed graph. Nodes are built from agents + views + brainFiles. No real backend data.
- **WHAT_NEEDS:** Integrate with real knowledge graph data. Dynamic node/edge updates. Persist layout.

---

## 21. DevicesPanel.tsx
- **STATUS:** working
- **WIRED_APIS:** (none — purely frontend display)
- **ISSUES:** Hardcoded device list (4 devices). Transfer queue is seed data. Pair new device is UI-only.
- **WHAT_NEEDS:** Connect to real device discovery. Live transfer status. Actual pairing flow.

---

## Summary

| Status | Count | Components |
|--------|-------|------------|
| **working** | 6 | AgentView, ConsentView, RecallView, RecallPanel, KnowledgeGraph, DevicesPanel |
| **partial** | 15 | ConnectorsView, DevicesView, SmartHomeView, MeetingsView, UsageView, PhoneView, SkillsView, VaultView, BrainView, ScreenView, SocialView, DockerView, CarruselView, CrmView, ImageGenView |

### Key Patterns
1. **Seed data everywhere** — Most components have hardcoded fallback data for when the backend is unavailable.
2. **UI-only flows** — Many forms/buttons are wired to UI state but don't call real backends.
3. **Partial API wiring** — Components import from backend.ts but many API calls are stubbed.
4. **Separate libs** — SmartHomeView uses smartthings.ts, not backend.ts. AI/voice use ai.ts, stt.ts, voiceEngines.ts.

### Next Steps
1. Verify which backend APIs are actually implemented in the Python backend.
2. Replace seed data with real backend calls where APIs exist.
3. Add error boundaries and loading states.
4. Implement real platform integrations (Meet, Docker, CRM, Social).
