# HADER AI: setup, privacy and acceptance

[Back to the README](../README.md)

This guide follows source revision `49202b2ab418a6cb43e56a46b24a94dbb69e7f8f`. It distinguishes code-backed behavior from a live, verified service.

## First run without provider credentials

Use Node.js 22 and pnpm 10. From the repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`, review the profile and course settings, and choose Simulation for a controlled walkthrough. Do not infer that microphone or system audio is working from the simulation's activity.

The current engine chain includes Qwen, browser-native recognition where supported, and simulation. Check the displayed engine and any fallback after a failure. In particular, browser SpeechRecognition does not prove that the system/tab stream selected for the Qwen path is being transcribed.

## Real audio checklist

1. Confirm you are allowed to capture the lecture and, where applicable, send it to the selected provider.
2. Open the app on HTTPS or localhost. Browser media APIs need a suitable security context.
3. Choose microphone or system/tab audio intentionally. System capture asks for a sharing surface; the code immediately discards video tracks and requires an audio track.
4. Speak or play a short, non-sensitive test phrase. Check both the level meter and an accurate transcript; one does not prove the other.
5. Test a name-call alert, a false alarm and a stop action. Confirm that stopping releases capture and that no simulation output is mistaken for live speech.
6. Repeat on every intended browser/device. Background tabs, locked phones and network changes need their own acceptance evidence.

The active code does not write raw audio to the local session history. Qwen mode nevertheless sends short audio chunks through `/api/asr/transcribe` to the configured upstream. Browser speech recognition may use the browser vendor's service. Neither is an unconditional offline guarantee.

## Configuration by capability

| Capability | Variables read by the implementation | Boundary |
| --- | --- | --- |
| App origin | `NEXT_PUBLIC_APP_URL` | Use the actual development or deployed origin |
| Qwen ASR/text | `QWEN_API_KEY`, optional `QWEN_WORKSPACE_ID`, `QWEN_REGION`, `QWEN_ASR_MODEL`, `QWEN_TEXT_MODEL` | Server-side only; region, model access and usage limits must match the account |
| Cross-device Realtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Configures the transport, not a completed authorization or persistence design |
| Push-related settings in the template | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Presence in an environment template does not establish working background delivery |

Do not publish API keys or put server secrets in `NEXT_PUBLIC_*` values. The template also contains a Supabase service-role variable; do not add privileged credentials merely to make local exploration work.

## What local storage means

[lib/history.ts](../lib/history.ts) keeps up to 50 session summaries, their events and separately stored briefs in browser localStorage. Export includes sessions, briefs and profile/preferences/lecture settings. Treat the JSON as private lecture-related data and inspect it before sharing.

Storage is best-effort. Clearing browser data or using another device can lose access to it. Supabase Realtime in [lib/devices/channel.ts](../lib/devices/channel.ts) transports alerts; it does not turn this history into a cloud database. Local BroadcastChannel reaches only compatible tabs on the same origin/browser/device.

## Security and deployment gates

The current API limiter is an in-memory map. It is useful per instance but is not durable cross-instance quota enforcement or user authorization. Before opening provider-backed routes to an audience, validate authentication, origin/abuse controls, input limits and budget enforcement. No new paid provider or public backend is required for the first-run walkthrough.

For remote device alerts, verify room authorization, pairing expiry/revocation and message privacy in the actual Supabase configuration. A pairing code and an online heartbeat are not sufficient evidence of a secure multi-user deployment.

Existing Vercel configuration identifies a Next.js application. Use a preview deployment and real acceptance evidence before promoting it; preserve the current project and service identities.

## Tests and remaining acceptance

Source-declared commands, not newly executed results:

```bash
pnpm typecheck
pnpm test
pnpm build
```

[tests/asr-contract.test.ts](../tests/asr-contract.test.ts) checks the request field/schema contract. The other existing suites cover detection and session state. They do not certify upstream audio codec support, provider latency or physical-device alert delivery.

- [ ] Live microphone and system/tab capture transcribe a known phrase with the selected provider.
- [ ] Engine fallback remains conspicuous and simulation cannot be confused with a real lecture.
- [ ] Permission denial, missing audio, provider failure, rate limiting and network loss produce actionable states.
- [ ] Local briefs preserve only source-supported content; generated answers are reviewed for grounding.
- [ ] Remote alerts and background behavior pass device-specific, access-controlled tests.
- [ ] Export/deletion behavior is verified, including settings contained in the export.
- [ ] Legacy multi-format export and speech synthesis are either ported with tests or explicitly left unsupported.

Keep the previous `src/` implementation and existing PWA assets intact while closing those gaps.
