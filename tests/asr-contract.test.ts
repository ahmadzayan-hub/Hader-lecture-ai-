import { describe, expect, it } from "vitest"
import { buildTranscribeBody } from "@/lib/asr/engines"
import { transcribeRequestSchema } from "@/lib/schemas"

const AUDIO = "U1lOVEhFVElDLWF1ZGlvLWJ5dGVz" // synthetic, not real audio

describe("browser to /api/asr/transcribe contract", () => {
  it.each(["ar", "en", "mixed", "auto"])("the body for language %s is accepted by the server schema", (language) => {
    const parsed = transcribeRequestSchema.safeParse(buildTranscribeBody(AUDIO, "audio/webm;codecs=opus", language))
    expect(parsed.success).toBe(true)
  })

  it("sends the audio under the field the server reads", () => {
    const body = buildTranscribeBody(AUDIO, "audio/webm", "ar")
    expect(transcribeRequestSchema.parse(body).audio).toBe(AUDIO)
    expect(body).not.toHaveProperty("audioBase64")
  })

  it("falls back to a valid MIME type when the browser reports none", () => {
    expect(transcribeRequestSchema.safeParse(buildTranscribeBody(AUDIO, "", "en")).success).toBe(true)
  })

  it("the old body shape is rejected, which is the defect this guards", () => {
    expect(transcribeRequestSchema.safeParse({ audioBase64: AUDIO, mimeType: "audio/webm", language: "en" }).success).toBe(false)
  })
})
