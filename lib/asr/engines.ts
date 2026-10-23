/**
 * ASR engine chain for HADER AI.
 *
 * Level 1  QWEN_CHUNKED   — real Qwen transcription of short audio chunks via
 *                           our server route. Works on Vercel's serverless
 *                           runtime (no persistent socket required).
 * Level 2  BROWSER_NATIVE — SpeechRecognition, where the browser supports it.
 * Level 3  SIMULATION     — scripted transcript, always labelled DEMO.
 *
 * Design rule: an engine must never claim to be listening when it is not.
 * Every engine reports its own status and surfaces failures upward so the UI
 * can degrade honestly instead of showing a green light over a dead pipeline.
 */

import type { AsrEngineId, AsrStatus, TranscriptSegment } from "@/lib/types"
import type { CaptureHandle } from "@/lib/audio/capture"

export interface AsrCallbacks {
  onSegment(segment: TranscriptSegment): void
  onStatus(status: AsrStatus, detail?: string): void
  /** Fired when this engine cannot continue, so the chain can fall back. */
  onFatal(reason: string): void
}

export interface AsrEngine {
  id: AsrEngineId
  label: string
  start(): Promise<void>
  stop(): void
}

let segmentSeq = 0
function nextId(): string {
  segmentSeq += 1
  return `seg_${Date.now().toString(36)}_${segmentSeq}`
}

/* ------------------------------------------------------------------ *
 * Level 1 — Qwen chunked transcription
 * ------------------------------------------------------------------ */

const CHUNK_MS = 4000
const CHUNK_OVERLAP_MS = 400

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null
}

export class QwenChunkedEngine implements AsrEngine {
  id: AsrEngineId = "QWEN_CHUNKED"
  label = "Qwen transcription"

  private capture: CaptureHandle
  private callbacks: AsrCallbacks
  private recorder: MediaRecorder | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private consecutiveFailures = 0
  private language: string

  constructor(capture: CaptureHandle, callbacks: AsrCallbacks, language: string) {
    this.capture = capture
    this.callbacks = callbacks
    this.language = language
  }

  async start(): Promise<void> {
    const mime = pickRecorderMime()
    if (!mime) {
      this.callbacks.onFatal("MediaRecorder is unavailable in this browser.")
      return
    }

    this.running = true
    this.callbacks.onStatus("CONNECTING")

    // Probe the server before claiming we are connected.
    const probe = await fetch("/api/qwen/status", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)

    if (!probe?.asr?.configured) {
      this.callbacks.onFatal(probe?.asr?.detail ?? "Qwen credentials are not configured on the server.")
      return
    }

    this.callbacks.onStatus("LISTENING")
    this.spin(mime)
    this.timer = setInterval(() => {
      if (this.running) this.spin(mime)
    }, CHUNK_MS)
  }

  /**
   * Each cycle records one short slice and posts it. Slices are independent,
   * so a single failed chunk degrades one window instead of the whole session.
   */
  private spin(mime: string) {
    if (!this.running) return
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(this.capture.stream, { mimeType: mime, audioBitsPerSecond: 32000 })
    } catch {
      this.callbacks.onFatal("This browser refused to record the captured audio.")
      return
    }
    this.recorder = recorder

    const chunks: Blob[] = []
    const startedAt = Date.now()

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      if (!this.running || chunks.length === 0) return
      void this.transcribe(new Blob(chunks, { type: mime }), startedAt)
    }

    recorder.start()
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop()
    }, CHUNK_MS + CHUNK_OVERLAP_MS)
  }

  private async transcribe(blob: Blob, startedAt: number) {
    // Silence gate: skip near-silent windows so we don't burn quota on nothing.
    if (blob.size < 1200) return

    try {
      const base64 = await blobToBase64(blob)
      const response = await fetch("/api/asr/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildTranscribeBody(base64, blob.type, this.language)),
      })

      if (!response.ok) {
        this.registerFailure(`Transcription failed (${response.status}).`)
        return
      }

      const payload = (await response.json()) as { text?: string; latencyMs?: number }
      this.consecutiveFailures = 0
      this.callbacks.onStatus("LISTENING")

      const text = (payload.text ?? "").trim()
      if (!text) return

      this.callbacks.onSegment({
        id: nextId(),
        text,
        isFinal: true,
        startedAt,
        receivedAt: Date.now(),
        engine: this.id,
        latencyMs: payload.latencyMs,
      })
    } catch {
      this.registerFailure("Network error while transcribing.")
    }
  }

  private registerFailure(detail: string) {
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= 3) {
      this.callbacks.onFatal(detail)
      return
    }
    this.callbacks.onStatus("RECONNECTING", detail)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    this.recorder = null
    this.callbacks.onStatus("OFFLINE")
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

/* ------------------------------------------------------------------ *
 * Level 2 — Browser SpeechRecognition
 * ------------------------------------------------------------------ */

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean; length: number }>
}

export function browserAsrAvailable(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition)
}

export class BrowserSpeechEngine implements AsrEngine {
  id: AsrEngineId = "BROWSER_NATIVE"
  label = "Browser speech recognition"

  private recognition: SpeechRecognitionLike | null = null
  private callbacks: AsrCallbacks
  private language: string
  private running = false

  constructor(callbacks: AsrCallbacks, language: string) {
    this.callbacks = callbacks
    this.language = language
  }

  async start(): Promise<void> {
    const w = window as unknown as Record<string, unknown>
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined
    if (!Ctor) {
      this.callbacks.onFatal("This browser has no built-in speech recognition.")
      return
    }

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = this.language === "ar" ? "ar-EG" : this.language === "en" ? "en-US" : "ar-EG"

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript?.trim()
        if (!text) continue
        this.callbacks.onSegment({
          id: nextId(),
          text,
          isFinal: Boolean(result.isFinal),
          startedAt: Date.now(),
          receivedAt: Date.now(),
          engine: this.id,
        })
      }
    }

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.callbacks.onFatal("Speech recognition permission was denied.")
        return
      }
      if (event.error === "network") {
        this.callbacks.onStatus("RECONNECTING", "Speech recognition network error.")
      }
    }

    // Chrome ends the session periodically; restart while we intend to run.
    recognition.onend = () => {
      if (!this.running) return
      try {
        recognition.start()
      } catch {
        this.callbacks.onStatus("RECONNECTING", "Restarting recognition.")
      }
    }

    this.recognition = recognition
    this.running = true
    try {
      recognition.start()
      this.callbacks.onStatus("LISTENING")
    } catch {
      this.callbacks.onFatal("Speech recognition refused to start.")
    }
  }

  stop(): void {
    this.running = false
    try {
      this.recognition?.stop()
    } catch {
      /* already stopped */
    }
    this.recognition = null
    this.callbacks.onStatus("OFFLINE")
  }
}

/* ------------------------------------------------------------------ *
 * Level 3 — Simulation
 * ------------------------------------------------------------------ */

export const SIMULATION_SCRIPT: string[] = [
  "Good evening everyone, welcome back to MBA AI Strategy.",
  "Today we will cover how firms build a durable data advantage.",
  "Before we start, let me take the attendance for tonight.",
  "Sara, are you with us?",
  "Ahmed, are you with us?",
  "Let us move on to the first case study.",
  "أحمد زيان موجود؟",
  "The assignment is due next Sunday, please submit through the portal.",
  "Ahmed, what do you think about this pricing model?",
  "That is all for tonight, thank you everyone.",
]

export class SimulationEngine implements AsrEngine {
  id: AsrEngineId = "SIMULATION"
  label = "Simulation (demo data)"

  private callbacks: AsrCallbacks
  private timer: ReturnType<typeof setInterval> | null = null
  private index = 0
  private script: string[]

  constructor(callbacks: AsrCallbacks, script: string[] = SIMULATION_SCRIPT) {
    this.callbacks = callbacks
    this.script = script
  }

  async start(): Promise<void> {
    this.callbacks.onStatus("LISTENING")
    this.timer = setInterval(() => this.emit(), 3200)
    this.emit()
  }

  private emit() {
    if (this.index >= this.script.length) {
      this.index = 0
    }
    const text = this.script[this.index]
    this.index += 1
    this.callbacks.onSegment({
      id: nextId(),
      text,
      isFinal: true,
      startedAt: Date.now(),
      receivedAt: Date.now(),
      engine: this.id,
      isDemo: true,
    })
  }

  /** Injects a single phrase immediately — used by the "simulate call" button. */
  inject(text: string) {
    this.callbacks.onSegment({
      id: nextId(),
      text,
      isFinal: true,
      startedAt: Date.now(),
      receivedAt: Date.now(),
      engine: this.id,
      isDemo: true,
    })
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.callbacks.onStatus("OFFLINE")
  }
}

/**
 * The body /api/asr/transcribe accepts (lib/schemas.ts transcribeRequestSchema). Kept here, next
 * to the only caller, and tested against that schema: the client once sent `audioBase64`, which
 * the server rejected on every chunk.
 */
export function buildTranscribeBody(audio: string, mimeType: string, language: string) {
  return {
    audio,
    mimeType: mimeType && mimeType.length >= 3 ? mimeType : "audio/webm",
    language: language === "ar" || language === "en" ? language : "auto",
  } as const
}
