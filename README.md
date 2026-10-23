# HADER AI · حاضر

**Stay oriented during a live lecture, then turn the captured context into a useful study brief.** HADER brings audio-source checks, transcription, name-call alerts and session review into one React workspace.

[Local-first architecture & platform matrix](docs/LOCAL_FIRST_ARCHITECTURE.md) · [Setup & privacy guide](docs/GETTING_STARTED.md) · [Current app](app) · [Tests](tests) · [Environment template](.env.example)

## Who it helps

A student following a live lecture needs to know whether audio is actually being captured, notice when they are addressed, and leave with the assignments and concepts that were discussed. HADER makes those states visible instead of treating a green indicator or a plausible transcript as proof that the system is listening.

The app supports English and Arabic lecture context. Generated answers and briefs are aids to review, not a substitute for participation or a guarantee of accurate lecture content.

## Start with local context

Open **Session Assistant** (`/assistant`), paste or import a TXT/SRT/VTT transcript, ask for evidence, catch up, review possible actions and prepare questions. Save explicitly in this browser or export Hader JSON for backup and Maktab import. No credentials, model download or paid API calls are required. Exact-excerpt retrieval is clearly distinguished from optional local AI drafts.

Paid providers are **off by default**, even if a Qwen key exists. A local Hader + llama.cpp installation can enable local generation; a Vercel deployment cannot access the user's localhost. See the architecture guide for honest platform/capture boundaries and uncompleted real-device acceptance.

## What is implemented

| Capability | Implementation | Important limit |
| --- | --- | --- |
| Context assistant | Timestamped evidence lookup, catch-up, review candidates, proposed questions | Extractive baseline is not semantic AI; local model drafts still need review |
| Portable transcripts | Validated TXT/SRT/VTT/Hader JSON imports; explicit save; JSON/text exports | 2 MB portable session limit; browser-local unencrypted storage is not cloud backup |
| Local generation | Opt-in loopback-only llama.cpp adapter with validated citations | Requires local Hader, a separately installed model and device benchmarking; disabled on Vercel |
| Capture preflight | Microphone or system/tab audio through browser media APIs, with a level meter | Browser, OS and selected sharing surface determine which audio is available |
| Transcription | Qwen chunked transcription, browser SpeechRecognition and explicitly marked simulation | These are different engines; simulation is scripted, and browser recognition is not guaranteed offline |
| Name-call detection | Alias matching, context checks, alert states and confirmation/false-alarm tracking | Recognition and matching can miss a call or produce a false alarm |
| Lecture briefs | Qwen-generated output or a local sentence-extraction fallback | The local fallback extracts existing transcript content; it is not a generative model |
| Session review | Browser-local history, briefs and JSON export | Best-effort localStorage is not cloud backup or durable cross-device history |
| Device alerts | Same-browser BroadcastChannel or Supabase Realtime transport | Local transport does not pair a phone; remote use needs configured infrastructure and access-control validation |
| Course and settings screens | Course profiles, preferences, diagnostics and live-session controls | A configured profile does not verify a working audio or alert path |

The current application is **Next.js 16 + React 19 + TypeScript**, using the pnpm lockfile. Exact versions and available commands are in [package.json](package.json).

## Current status

This is an implemented application with external-service paths and honest local fallbacks, **not a claim that every production workflow has passed acceptance**.

- The client/server audio-field mismatch was fixed in [PR #5](https://github.com/ahmadzayan-hub/Hader-lecture-ai-/pull/5). The client now sends `audio`, with a schema-contract regression test. This fixes a contract defect; it does not replace a live recording test with the configured provider.
- Qwen credentials stay on the server. Real Qwen transcription and generation send the relevant audio or text to that provider and may incur usage charges; they require `HADER_PAID_PROVIDERS=1`.
- Session history is stored in the current browser. The active capture code does not save raw audio files, but that does not mean audio stays on the device when a remote transcription engine is selected.
- Per-instance API rate limiting is present. Multi-user authorization, abuse controls, remote pairing privacy and background alert behavior still need deployment-specific acceptance.
- The older implementation is preserved under `src/`. Its additional export formats and speech synthesis have **not** been ported into the current Next.js application.

Source baseline: [`49202b2`](https://github.com/ahmadzayan-hub/Hader-lecture-ai-/tree/49202b2ab418a6cb43e56a46b24a94dbb69e7f8f). No live deployment or provider call is certified by this README.

## Run locally

Use Node.js 22 and pnpm 10, matching CI:

```bash
git clone https://github.com/ahmadzayan-hub/Hader-lecture-ai-.git
cd Hader-lecture-ai-
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. Leave service keys empty for initial exploration and choose **Simulation** explicitly when checking scripted behavior. A simulated transcript is not a recording of the room.

For real audio, first read the [capture and privacy checklist](docs/GETTING_STARTED.md#real-audio-checklist). Allow only the intended source, obtain necessary participant permission, and verify the active engine and transcript before relying on alerts.

## Development checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

These commands match the current manifest; the first three are the checks used by CI after a frozen-lockfile install. `pnpm start` needs a completed production build. The context-workspace release runs unit/contract tests, typecheck and production builds. Real microphone, provider-model and mobile/native acceptance remain separate. See the local-first guide.

CI also runs the synthetic desktop/mobile `test:e2e` workflow after installing Chromium and uploads its screenshots. Those tests exercise imported fixtures, not microphones or real mobile hardware. The declared `lint` script is not a release check in this workflow.

## Repository map

- `app/`: current pages and server API routes.
- `components/`: app shell, preflight, transcript, waveform and alert UI.
- `lib/audio/`, `lib/asr/`, `lib/detection/`: capture, transcription engines and detection.
- `lib/session/`: state machine and session orchestration.
- `lib/ai/local-brief.ts`: deterministic transcript-derived fallback.
- `lib/devices/channel.ts`: local and Supabase alert transports.
- `lib/history.ts`: localStorage history and JSON export.
- `tests/`: ASR-contract, detection and state-machine tests.
- `public/`: existing PWA manifest and service worker.
- `src/`: preserved previous implementation, not part of the current app build.

## Preserve the previous implementation

The earlier Vite code remains useful reference material. In particular:

- `src/export/ExportCenter.js` supports JSON, Markdown, PDF, SRT, TXT and VTT; the current history export is JSON only.
- `src/response/TTS.js` implements speech synthesis; the current app has no equivalent.

Do not delete these modules or advertise their features as current until an intentional port or retirement has been reviewed. Other historical counterparts map to `lib/server/qwen.ts`, `lib/detection/`, `lib/ai/local-brief.ts`, `lib/asr/` and `lib/session/`.

## Existing design workflow

The repository originated in v0. Its existing [v0 project link](https://v0.app/chat/projects/prj_4BpwgU4KkAKBMyfwOpEk9yitZCyG) is retained for maintainers. Access depends on that project's permissions. Changes made there can write to the repository; inspect the diff, checks and actual deployment rather than assuming every generated update is ready to release.

The repository's Next.js-specific contributor guidance is in [AGENTS.md](AGENTS.md). Follow the installed version's documentation when making application changes.

## بالعربية

**حاضر** يساعد الطالب على متابعة المحاضرة: فحص مصدر الصوت، تحويل الكلام إلى نص، التنبيه عند مناداته، ثم مراجعة ملخص ومهام مستخرجة من السياق.

هناك فرق واضح بين الصوت الحقيقي، التعرّف الصوتي الخاص بالمتصفح، والمحاكاة المكتوبة مسبقاً. التلخيص المحلي يستخرج جملاً من النص ولا يخترع محتوى جديداً. خدمات Qwen قد ترسل الصوت أو النص خارج الجهاز، بينما السجل الحالي محفوظ في المتصفح وليس نسخة احتياطية سحابية. تصدير PDF والترجمة إلى صيغ الترجمة النصية وميزة النطق القديمة ليست جزءاً من الواجهة الحالية بعد.

## Licensing

No repository-wide `LICENSE` file is present in the reviewed tree. Existing code and assets are retained; this documentation does not grant a new license.
