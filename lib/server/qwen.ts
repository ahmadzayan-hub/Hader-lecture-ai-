/**
 * Server-only Qwen (Alibaba Model Studio / DashScope) client.
 *
 * SECURITY: this module must never be imported from a client component.
 * QWEN_API_KEY stays in the server runtime; the browser only ever talks to
 * our own /api routes.
 */

import "server-only"
import { providerFailure } from "@/lib/ai/provider-failure"

export type QwenRegion = "singapore" | "beijing"

const REGION_HOSTS: Record<QwenRegion, string> = {
  singapore: "https://dashscope-intl.aliyuncs.com",
  beijing: "https://dashscope.aliyuncs.com",
}

export type QwenConfig = {
  apiKey: string
  workspaceId: string
  region: QwenRegion
  asrModel: string
  textModel: string
  host: string
}

export class QwenConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Qwen is not configured: missing ${missing.join(", ")}`)
    this.name = "QwenConfigError"
  }
}

export class QwenRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Safe, user-facing hint. Never contains credentials. */
    public readonly hint: string,
    public readonly code = "PROVIDER_REQUEST_FAILED",
    public readonly retryable = false,
  ) {
    super(message)
    this.name = "QwenRequestError"
  }
}

function normalizeRegion(value: string | undefined): QwenRegion {
  const v = (value ?? "").trim().toLowerCase()
  if (v.startsWith("cn") || v === "beijing" || v.includes("hangzhou")) return "beijing"
  return "singapore"
}

/** Reads config from the server environment. Never throws for a probe. */
export function readQwenConfig(): { ok: true; config: QwenConfig } | { ok: false; missing: string[] } {
  // QWEN_API_KEY is the documented name. API_KEY is accepted as a fallback
  // because some deployments provision the DashScope key under that name.
  const apiKey = (process.env.QWEN_API_KEY ?? process.env.API_KEY)?.trim() ?? ""
  const missing: string[] = []
  if (process.env.HADER_PAID_PROVIDERS !== "1") missing.push("HADER_PAID_PROVIDERS=1 (explicit paid-provider opt-in)")
  if (!apiKey) missing.push("QWEN_API_KEY")
  const asrModel = (process.env.QWEN_ASR_MODEL ?? process.env.QWEN_ASR_MODEL_2)?.trim() ?? ""
  const textModel = (process.env.QWEN_TEXT_MODEL ?? process.env.QWEN_TEXT_MODEL_2)?.trim() ?? ""
  const validModel = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/
  if (!validModel.test(asrModel)) missing.push("QWEN_ASR_MODEL (explicit compatible model ID)")
  if (!validModel.test(textModel)) missing.push("QWEN_TEXT_MODEL (explicit compatible model ID)")

  if (missing.length) return { ok: false, missing }

  // The *_2 variants exist in some environments; either name is honoured.
  const region = normalizeRegion(process.env.QWEN_REGION ?? process.env.QWEN_REGION_2)
  return {
    ok: true,
    config: {
      apiKey,
      workspaceId: process.env.QWEN_WORKSPACE_ID?.trim() ?? "",
      region,
      asrModel,
      textModel,
      host: REGION_HOSTS[region],
    },
  }
}

export function requireQwenConfig(): QwenConfig {
  const result = readQwenConfig()
  if (!result.ok) throw new QwenConfigError(result.missing)
  return result.config
}

export function isQwenConfigured(): boolean {
  return readQwenConfig().ok
}

type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string | unknown[]
}

async function qwenChat(
  config: QwenConfig,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  }
  if (config.workspaceId) headers["X-DashScope-WorkSpace"] = config.workspaceId

  try {
    const response = await fetch(`${config.host}/compatible-mode/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      const failure = providerFailure(response.status, text)
      throw new QwenRequestError(`Qwen HTTP ${response.status}`, response.status, failure.hint, failure.code, failure.retryable)
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[]
    }
    const content = json.choices?.[0]?.message?.content

    if (typeof content === "string") return content
    // ASR responses may return a content array of parts.
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === "string"
            ? part
            : typeof (part as { text?: string })?.text === "string"
              ? (part as { text: string }).text
              : "",
        )
        .join(" ")
        .trim()
    }
    return ""
  } catch (error) {
    if (error instanceof QwenRequestError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new QwenRequestError("Qwen timeout", 504, "Provider timed out. Retry manually; no automatic replacement was used.", "PROVIDER_TIMEOUT", true)
    }
    throw new QwenRequestError(
      "Qwen network failure",
      503,
      "Could not reach Qwen. Check network connectivity.",
      "PROVIDER_NETWORK", true,
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Transcribes a short audio chunk.
 * Uses the OpenAI-compatible endpoint with an inline base64 data URL.
 */
export async function transcribeChunk(options: {
  audioBase64: string
  mimeType: string
  language: "ar" | "en" | "auto"
  timeoutMs?: number
}): Promise<{ text: string; model: string }> {
  const config = requireQwenConfig()
  const dataUrl = `data:${options.mimeType};base64,${options.audioBase64}`

  const asrOptions: Record<string, unknown> = { enable_itn: true }
  if (options.language !== "auto") asrOptions.language = options.language

  const text = await qwenChat(
    config,
    {
      model: config.asrModel,
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: dataUrl } }],
        },
      ],
      asr_options: asrOptions,
    },
    options.timeoutMs ?? 20_000,
  )

  return { text: text.trim(), model: config.asrModel }
}

/** Calls the text model and returns raw content. */
export async function completeText(options: {
  messages: ChatMessage[]
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
}): Promise<{ text: string; model: string }> {
  const config = requireQwenConfig()
  const body: Record<string, unknown> = {
    model: config.textModel,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 800,
    temperature: options.temperature ?? 0.2,
  }
  if (options.jsonMode) body.response_format = { type: "json_object" }

  const text = await qwenChat(config, body, options.timeoutMs ?? 20_000)
  return { text, model: config.textModel }
}

/** Extracts the first JSON object from a model response. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** Lightweight credential probe used by /api/health and the settings screen. */
export async function pingQwen(kind: "text" | "asr"): Promise<{
  ok: boolean
  latencyMs: number
  detail: string
  model: string
}> {
  const started = Date.now()
  const cfg = readQwenConfig()
  if (!cfg.ok) {
    return {
      ok: false,
      latencyMs: 0,
      detail: `Missing ${cfg.missing.join(", ")}`,
      model: "",
    }
  }

  try {
    if (kind === "text") {
      const { model } = await completeText({
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        maxTokens: 8,
        timeoutMs: 12_000,
      })
      return { ok: true, latencyMs: Date.now() - started, detail: "Authenticated", model }
    }
    // ASR reachability is verified by the models list; a real audio round-trip
    // happens in the settings "Test realtime ASR" flow with the user's voice.
    return {
      ok: true,
      latencyMs: Date.now() - started,
      detail: "Credentials present. Run a voice test to verify transcription.",
      model: cfg.config.asrModel,
    }
  } catch (error) {
    const hint = error instanceof QwenRequestError ? error.hint : "Unknown Qwen error"
    return { ok: false, latencyMs: Date.now() - started, detail: hint, model: "" }
  }
}
