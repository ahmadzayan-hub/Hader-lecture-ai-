# Hader: a practical no-subscription session assistant

## What ships in this change

The `/assistant` workspace works without credentials or a model download: import TXT/SRT/VTT or Hader JSON, inspect timestamped evidence, catch up from the latest captured time, find matching excerpts, review possible actions/decisions, prepare questions, explicitly save in this browser, and export/restore a portable session. Arabic text stays intact and renders per line with automatic direction. Partial recognition hypotheses are excluded. Demo provenance survives export.

This baseline is **lexical retrieval and sentence extraction, not deep learning, semantic understanding, speaker diarization, or model training**. It deliberately returns insufficient evidence rather than constructing an answer. Questions are proposed templates, not meeting facts. Keyword action/decision candidates can include negations; users must inspect context, ownership, dates and later corrections.

A real, optional llama.cpp adapter is implemented for a **local Hader installation**. Only a bounded selection of evidence is sent to `127.0.0.1:8080`; requests require a same-origin loopback address, have timeouts, reject redirects, and validate exact citation IDs/quotes. Invalid output falls back to extraction. Valid quotations do not prove that the model's interpretation is correct: all outputs remain review-required drafts. No tool execution, meeting sending, automatic speaking, credential storage or external fallback is attached.

`HADER_PAID_PROVIDERS=0` is the default. An existing Qwen key alone cannot cause paid transcription, generation or probe requests. Qwen requires an explicit deployment opt-in. Browser SpeechRecognition is a separate browser service and is **not guaranteed offline**. Real-engine failure never silently starts simulation. Simulation requires explicit selection.

## Two honest deployment paths

1. **Hosted web / mobile browser today:** local import, evidence search, capture when browser permissions and platform support permit, save/export. No model server or paid subscription is required. Loading the website initially needs a connection; only static assets are cached. This is not a full offline-installation guarantee.
2. **Local desktop installation:** run Hader and llama.cpp on the same Windows, macOS or Linux computer. Existing recorded audio can be transcribed with whisper.cpp and imported as VTT/SRT. Live native capture and an installable companion are future stages, not features already delivered.

A Vercel function's localhost is the deployment machine, **not the user's computer**. The adapter is disabled when `VERCEL` is set and rejects requests addressed to a non-loopback host. There is no insecure public tunnel, browser-to-localhost CORS workaround, or automatic LAN exposure. A phone cannot use the desktop localhost service through this release. Move a reviewed JSON transcript explicitly between devices instead.

## Open-source choices, licenses, and reproducibility

Inspected official sources on 2026-10-23. Small sparse checkouts were used for interface/license review only. No setup scripts, inference binaries, large model downloads, microphone recordings, or model training ran as part of that inspection.

| Component | Inspected revision | License / use |
| --- | --- | --- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | `1a24df163920a4744a95373d178d790b72a9bb2f` | MIT runtime; optional local OpenAI-compatible chat-completion server |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | `231638a0717b7822784297e5980965ffcec05810` | MIT runtime; multilingual audio-to-VTT/SRT before import |

Do not copy whole applications into this repository. Keep these tools external, pin a reviewed revision when deploying, preserve their LICENSE/third-party notices when redistributing, and review CMake/submodule/dependency changes before building. No third-party runtime code or model weights are vendored here.

Runtime licenses **do not license model weights**. [Qwen3-4B's official model card](https://huggingface.co/Qwen/Qwen3-4B) declares Apache-2.0; it is a candidate to benchmark, not a verified Arabic quality claim. A GGUF conversion has its own provenance, revision, checksum and included notices to inspect. [OpenAI Whisper's original repository](https://github.com/openai/whisper) and the chosen converted model's license must also be checked separately. Use a multilingual model, not an `.en` model, for Arabic. No download is automated.

“No subscription” does not mean zero resources: local hardware, RAM, battery, initial model bandwidth and electricity still matter. Model size and context length must fit the device. Small models can miss dialectal Arabic and reasoning details; do not promise ideal accuracy or real-time speed before measuring.

## Local installation, after choosing a model

Install Node.js 22 and the repository's pinned dependencies. Inspect the official [llama.cpp build instructions](https://github.com/ggml-org/llama.cpp/blob/1a24df163920a4744a95373d178d790b72a9bb2f/docs/build.md) and [server options](https://github.com/ggml-org/llama.cpp/blob/1a24df163920a4744a95373d178d790b72a9bb2f/tools/server/README.md). Use a previously downloaded, license-reviewed GGUF, and bind only to loopback:

```sh
llama-server -m /absolute/path/to/reviewed-model.gguf --host 127.0.0.1 --port 8080 -c 8192 --alias local
```

In Hader `.env.local`, set `HADER_LOCAL_AI=1`, keep `HADER_PAID_PROVIDERS=0`, and start Hader bound to loopback:

```sh
pnpm dev --hostname 127.0.0.1
# or, after pnpm build:
pnpm start --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/assistant`. “Local model responded” means `/health` succeeded, not that the selected model passed quality acceptance. Enable “Use the local model” deliberately. Draft generation still fails safely if the selected model cannot return the expected JSON or citations. Never expose these unauthenticated local servers publicly. Do not enable tools/MCP or file access in the inference server for this integration.

For an **existing audio file you are allowed to process**, use the [official whisper.cpp CLI](https://github.com/ggml-org/whisper.cpp/blob/231638a0717b7822784297e5980965ffcec05810/examples/cli/README.md), for example with a reviewed multilingual model and a compatible WAV file:

```sh
whisper-cli -m /absolute/path/to/multilingual-model.bin -f /absolute/path/to/lecture.wav -l ar -ovtt
```

Import the resulting VTT into Hader. CLI input constraints, model downloads and build dependencies remain the official tool's responsibility. This release does not claim live Whisper integration; it establishes the portable transcript boundary first.

## Platform acceptance matrix

| Surface | Useful path now | Native capture boundary / next gate |
| --- | --- | --- |
| Windows desktop browser | Import, evidence workspace; browser tab/mic capture if available; locally hosted llama.cpp option | System loopback companion needs [WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording), consent, audio-device switching and Teams/Zoom tests |
| macOS browser | Import, workspace, browser-permitted capture; local llama.cpp option | Desktop capture needs [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos) integration and recording permission; verify app audio, headphones and OS versions |
| Android browser | Import/export and evidence workspace; microphone support varies | [AudioPlaybackCapture](https://developer.android.com/media/platform/av-capture) requires MediaProjection consent, RECORD_AUDIO and capture-allowed source apps/usage. Cannot promise capture of every call or meeting |
| iPhone / iPad browser | Import/export and evidence workspace; microphone support varies | [ReplayKit](https://developer.apple.com/documentation/replaykit) is not universal access to other apps' meeting audio. Native permission/capture flow and same-device app restrictions need device tests |
| Hosted web on any platform | Same transcript contract, local-browser evidence lookup | [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) may provide no audio track. Browser SpeechRecognition may be remote. No guaranteed background listening |

Future delivery order: benchmark Arabic ASR on representative consented recordings → package a local companion using existing whisper.cpp/llama.cpp runtimes → implement native capture per OS → mobile companion/import workflow → optional authenticated encrypted sync only if requested. Do not duplicate ASR in Maktab: consume the explicit transcript export.

## Privacy, retention and limits

- Nothing is spoken or sent into a meeting automatically. A user can review a draft and choose to speak/share it manually.
- The new assistant never uploads import files. Optional local inference only sends selected transcript excerpts to the local server after user selection.
- Saving is explicit. Browser storage is unencrypted, origin-specific and not a backup. Up to 30 sessions; quota or corrupt data errors are visible and old sessions are not silently evicted.
- JSON import/export is versioned, capped at 2 MB, validates unique IDs, bounds strings/timestamps, and preserves source provenance. Restore loads a session; Save persists it explicitly. Legacy alert history is untouched.
- Active live context retains at most 10,000 segments in memory. The UI warns at that limit; no claim of unbounded recording. Refresh/closing an unsaved session loses in-memory context. Export before changing devices or clearing browser data.
- Legacy `src/export/ExportCenter.js` and `src/response/TTS.js` remain untouched. New work does not represent those legacy features as integrated or authorize unattended speaking.

## Required acceptance before “works on every platform”

Synthetic tests and a desktop browser smoke test are necessary but insufficient. Record measured results, do not fill this table with guessed values.

| Test | Required evidence | Status |
| --- | --- | --- |
| Arabic ASR, dialect + English terms | Consented 10–30 minute sample, reference transcript, word error rate, missed names/numbers, device/model/revision | Pending real-device/model test |
| Local generation | Citation validity, unsupported-answer rate, multilingual faithfulness, prompt-injection fixtures, p50/p95 latency and peak RAM | Adapter fixtures pass; real model pending |
| 60–120 minute capture | Dropouts, overlapping chunks, pause/resume, app switch, screen lock, battery/thermal impact | Pending |
| Windows/macOS/Android/iOS audio | Permission-denied, no-audio, source-app restrictions, headset/system switching | Pending device matrix |
| Persistence | Refresh, export/import, denied storage, corrupt JSON, quota full, schema mismatch | Automated fixtures plus browser checks |
| Communication safety | No automatic send/speak; suggestion distinct from meeting evidence | Code and browser checks; native stage pending |

A separate security maintenance change updates Next to 16.4.1 and resolved sharp to 0.35.5 for [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). No exploit testing was performed.

## Model retirement, limits and cancellation

Provider availability is not a permanent property. On 2026-10-23 the [official Model Studio catalog](https://www.alibabacloud.com/help/en/model-studio/models) advertises newer generations than this repository's former hard-coded `qwen-plus`/`qwen3-asr-flash` defaults. Their absence from the recommended list alone is not proof that every account has retired them. Therefore this release removes hidden defaults rather than silently upgrading to a different, possibly paid or incompatible endpoint. Both model IDs must be configured explicitly and checked against the account, region, API capability and current official catalog. Syntax validation is not an availability check.

[Official provider error documentation](https://help.aliyun.com/en/model-studio/error-code) informs separate safe categories for missing/disabled configuration, invalid credentials/access, model-unavailable/retired responses, exhausted quota, throttling, network/timeout and provider outage. No raw response body or credential is exposed. Routine health reads do not generate paid tokens. An explicit provider test may consume usage and does not guarantee later availability.

Text requests have one attempt with a deadline, not an endless retry or model-switch loop. ASR stops immediately on model/access/quota/throttle failures; transient windows are bounded to three consecutive failures and two in-flight requests. Late or cancelled transcription results cannot update the session; stopping aborts outstanding client requests. Engine choice happens before sending audio and does not switch providers after an upstream call fails. Partial/skipped windows are disclosed, not filled with fabricated speech. The browser workspace stays available when every model is offline.
