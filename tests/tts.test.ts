import { describe, it, expect } from "vitest"
import { selectVoice, utteranceLang, isSpeechSupported } from "@/lib/tts"

const voices = [{ name: "Microsoft Mark", lang: "en-US" }, { name: "Microsoft Hoda", lang: "ar-SA" }]

describe("text-to-speech voice selection", () => {
  it("prefers an Arabic voice for Arabic text", () => {
    expect(selectVoice(voices, "مرحبا كيف حالك")?.lang).toBe("ar-SA")
  })
  it("prefers an English voice for Latin-script text", () => {
    expect(selectVoice(voices, "Hello there, see you soon")?.lang).toBe("en-US")
  })
  it("falls back to a name match when no voice reports an Arabic lang tag", () => {
    expect(selectVoice([{ name: "Arabic Voice", lang: "xx-XX" }], "مرحبا")?.name).toBe("Arabic Voice")
  })
  it("falls back to the first voice when nothing matches the script", () => {
    expect(selectVoice([{ name: "x", lang: "fr-FR" }], "hello")?.lang).toBe("fr-FR")
    expect(selectVoice([{ name: "y", lang: "fr-FR" }], "مرحبا")?.lang).toBe("fr-FR")
  })
  it("returns null with no voices available", () => {
    expect(selectVoice([], "hello")).toBeNull()
  })
  it("derives an utterance language from the chosen voice, or the text's script when none is available", () => {
    expect(utteranceLang({ name: "a", lang: "ar-EG" }, "hi")).toBe("ar-EG")
    expect(utteranceLang(null, "مرحبا")).toBe("ar-SA")
    expect(utteranceLang(null, "hi")).toBe("en-US")
  })
  it("reports speech synthesis unsupported outside a browser", () => {
    expect(isSpeechSupported()).toBe(false)
  })
})
