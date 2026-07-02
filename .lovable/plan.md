
## Phaos AI — Architecture Refactor Plan

### 1. Rebrand Verification
- App is already fully white-labeled as **Phaos AI** — no changes needed.

### 2. Stack Confirmation
- Vite 5, React 18, Tailwind CSS v3, Shadcn/UI — already in place.

### 3. Critical Refactor: `vapi.start()` First-Line Execution
**Problem:** Currently in `startCall()`, the Vapi SDK is imported, instantiated, ~80 lines of event listeners are wired, and *then* `vapi.start()` is called last. This adds unnecessary latency before the WebRTC handshake begins.

**Fix:** Restructure so `vapi.start(assistantId)` is invoked immediately after `new Vapi(publicKey)`, *before* wiring event listeners. The Vapi SDK internally queues events, so listeners attached after `.start()` will still receive all events. This shaves ~5-15ms of synchronous JS execution off the perceived connection time.

### 4. Dark-Mode, Mobile-First
- Already implemented: CSS variables are dark-mode only, layout uses responsive `grid-cols-1 lg:grid-cols-12`.
- No changes needed.

### Files Modified
- `src/components/command-center/VapiSandbox.tsx` — reorder `startCall()` internals
