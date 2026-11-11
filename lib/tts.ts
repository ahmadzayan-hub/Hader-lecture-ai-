import { dirFor } from "@/lib/utils"

export type TTSVoice = { name: string; lang: string }

/** Picks the best available voice for this text's script. Pure, mirrors legacy src/response/TTS.js's Arabic-preference logic, but per-call instead of a single global preference. */
export function selectVoice(voices: TTSVoice[], text: string): TTSVoice | null {
  if (!voices.length) return null
  if (dirFor(text) === "rtl") {
    return voices.find(v => /ar/i.test(v.lang)) ?? voices.find(v => /arabic/i.test(v.name)) ?? voices[0]
  }
  return voices.find(v => /^en/i.test(v.lang)) ?? voices[0]
}

/** BCP-47 language tag for the utterance: the chosen voice's own lang, or a script-based fallback when no voice is available. */
export function utteranceLang(voice: TTSVoice | null, text: string): string {
  return voice?.lang || (dirFor(text) === "rtl" ? "ar-SA" : "en-US")
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/**
 * Speaks text with the browser's SpeechSynthesis API, picking a voice via selectVoice.
 * Runtime-only (no DOM in the node test environment); selectVoice/utteranceLang carry the
 * tested logic. Honest limitation carried over from the legacy TTS.js: speechSynthesis output
 * cannot be routed to a specific output device.
 */
export function speak(text: string, onEnd?: () => void): boolean {
  if (!isSpeechSupported()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const nativeVoices = synth.getVoices()
  const voice = selectVoice(nativeVoices.map(v => ({ name: v.name, lang: v.lang })), text)
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = utteranceLang(voice, text)
  if (voice) {
    const native = nativeVoices.find(v => v.name === voice.name && v.lang === voice.lang)
    if (native) utterance.voice = native
  }
  if (onEnd) {
    utterance.onend = onEnd
    utterance.onerror = onEnd
  }
  synth.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
