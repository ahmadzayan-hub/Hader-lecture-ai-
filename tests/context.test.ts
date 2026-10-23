import { describe, it, expect, vi } from "vitest"
import { importTranscript, makeDocument, fromLive, storeDocument, readLibrary, sessionDocumentSchema, exportText, LIBRARY_KEY } from "@/lib/context/session"
import { answerExtractively, catchUp, reviewCandidates, proposedQuestions, validateModelAnswer } from "@/lib/context/assistant"
import { askLocalModel, isLocalRequest, localModelEnabled, localModelHealth } from "@/lib/context/local-model"
import { isQwenAsrConfigured, asrPlan } from "@/lib/asr/engines"

const doc = importTranscript(`WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThe assignment is due Sunday.\n\n00:05:03.000 --> 00:05:07.000\nقررنا تأجيل المشروع إلى الأسبوع القادم.\n\n00:06:00.000 --> 00:06:03.000\nNo final budget has been approved.`, "meeting.vtt")
function memory() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}
describe("portable session context", () => {
  it("preserves VTT timing, language and imported provenance", () => {
    expect(doc.segments[0].offsetMs).toBe(1000)
    expect(doc.segments[1].text).toContain("قررنا")
    expect(doc.segments.every(s => s.source === "import")).toBe(true)
  })
  it("reads SRT cue indices and milliseconds", () => {
    const srt = importTranscript("1\n00:01:02,050 --> 00:01:03,900\nHello there.\n", "x.srt")
    expect(srt.segments[0].offsetMs).toBe(62050)
  })
  it("keeps pasted text untimed, rather than inventing timestamps", () => {
    expect(importTranscript("First line\nSecond line").segments.map(s => s.offsetMs)).toEqual([null, null])
  })
  it("roundtrips a portable JSON backup", () => {
    expect(importTranscript(JSON.stringify(doc), "restore.json")).toEqual(doc)
    expect(exportText(doc)).toContain("[00:00:01] [s1]")
  })
  it("rejects invalid, oversized and unsupported imports", () => {
    expect(() => importTranscript("x".repeat(2_000_001))).toThrow(/2 MB/)
    expect(() => importTranscript("bad", "x.json")).toThrow()
    expect(() => importTranscript("00:99:03.000 --> 00:99:04.000\nBad", "x.vtt")).toThrow()
    expect(() => importTranscript("00:00:03.000 --> 00:00:02.000\nBad", "x.vtt")).toThrow()
    expect(() => importTranscript("No timings", "x.srt")).toThrow()
    expect(() => importTranscript(" ")).toThrow()
  })
  it("rejects duplicate source IDs and future schema versions", () => {
    expect(sessionDocumentSchema.safeParse({ ...doc, segments: [doc.segments[0], doc.segments[0]] }).success).toBe(false)
    expect(sessionDocumentSchema.safeParse({ ...doc, version: 2 }).success).toBe(false)
  })
  it("keeps demo provenance and excludes partial hypotheses", () => {
    const segment = { id: "seg1", text: "Demo speech", startedAt: 3000, receivedAt: 3500, engine: "SIMULATION" as const, isFinal: true }
    const result = fromLive([segment, { ...segment, id: "partial", isFinal: false }], 1000)
    expect(result).toEqual([{ id: "seg1", text: "Demo speech", offsetMs: 2000, source: "demo" }])
  })
  it("saves without duplicate IDs and preserves old data on write failure", () => {
    const storage = memory(); storeDocument(storage, doc); storeDocument(storage, { ...doc, title: "Updated" })
    expect(readLibrary(storage)).toHaveLength(1)
    expect(readLibrary(storage)[0].title).toBe("Updated")
    const broken = { ...storage, setItem: () => { throw new Error("QuotaExceededError") } }
    expect(() => storeDocument(broken, makeDocument("Other", doc.segments))).toThrow()
    expect(readLibrary(storage)[0].title).toBe("Updated")
  })
  it("does not silently erase corrupt history or evict full history", () => {
    const storage = memory(); storage.setItem(LIBRARY_KEY, "broken")
    expect(() => storeDocument(storage, doc)).toThrow()
    expect(storage.getItem(LIBRARY_KEY)).toBe("broken")
    storage.setItem(LIBRARY_KEY, JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ ...doc, id: `id-${i}` }))))
    expect(() => storeDocument(storage, doc)).toThrow(/full/)
  })
})
describe("grounded assistance", () => {
  it("returns matching exact evidence, never fabricated answers", () => {
    const result = answerExtractively(doc.segments, "When is the assignment due?")
    expect(result.mode).toBe("extractive")
    expect(result.citations[0].quote).toBe(doc.segments[0].text)
    expect(answerExtractively(doc.segments, "What is the weather in Tokyo?").status).toBe("insufficient")
  })
  it("matches Arabic diacritics without mutating the quote", () => {
    expect(answerExtractively(doc.segments, "المَشروع").citations[0].quote).toBe(doc.segments[1].text)
  })
  it("does not use untimed paste for precise catch-up windows", () => {
    const untimed = importTranscript("An untimed note").segments
    expect(catchUp(untimed, 0)).toEqual([])
    expect(catchUp(untimed, null)).toHaveLength(1)
    expect(catchUp(doc.segments, 300000)).toHaveLength(2)
  })
  it("labels candidates conservatively and keeps proposals separate", () => {
    expect(reviewCandidates(doc.segments).actions[0].segmentId).toBe("s1")
    // Includes a negated candidate intentionally; UI says candidates, not confirmed decisions.
    expect(reviewCandidates(doc.segments).decisions).toHaveLength(2)
    expect(proposedQuestions(doc.segments)[0].text).not.toBe(doc.segments[0].text)
  })
  it("rejects invented citations, altered quotes and uncited answers", () => {
    const valid = { answer: "Sunday", insufficient: false, citations: [{ segmentId: "s1", quote: "assignment is due Sunday" }] }
    expect(validateModelAnswer(valid, doc.segments)?.mode).toBe("local-model")
    expect(validateModelAnswer({ ...valid, citations: [{ segmentId: "fake", quote: "assignment is due Sunday" }] }, doc.segments)).toBeNull()
    expect(validateModelAnswer({ ...valid, citations: [{ segmentId: "s1", quote: "assignment is due Monday" }] }, doc.segments)).toBeNull()
    expect(validateModelAnswer({ ...valid, citations: [] }, doc.segments)).toBeNull()
  })
  it("discards unsupported generated prose on an insufficient verdict", () => {
    const result = validateModelAnswer({ answer: "Made-up deadline Monday", insufficient: true, citations: [] }, doc.segments)
    expect(result?.status).toBe("insufficient"); expect(result?.text).not.toContain("Monday")
  })
})
describe("local inference boundary", () => {
  it("is off by default and always disabled on Vercel", () => {
    expect(localModelEnabled({})).toBe(false)
    expect(localModelEnabled({ HADER_LOCAL_AI: "1", VERCEL: "1" })).toBe(false)
    expect(localModelEnabled({ HADER_LOCAL_AI: "1" })).toBe(true)
  })
  it("requires same-origin loopback, not a cloud page or cross-site request", () => {
    expect(isLocalRequest(new Request("http://127.0.0.1:3000/api/context", { headers: { origin: "http://127.0.0.1:3000" } }))).toBe(true)
    expect(isLocalRequest(new Request("http://127.0.0.1:3000/api/context", { headers: { origin: "https://example.com" } }))).toBe(false)
    expect(isLocalRequest(new Request("https://example.com/api/context", { headers: { origin: "https://example.com" } }))).toBe(false)
    expect(isLocalRequest(new Request("http://localhost:3000/api/context"))).toBe(false)
  })
  it("fails health honestly", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("offline"))
    expect(await localModelHealth(fail)).toBe(false)
  })
  it("uses loopback only and falls back on malformed model output", async () => {
    const fake = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not JSON" } }] })))
    const result = await askLocalModel("assignment due", doc.segments, fake)
    expect(fake.mock.calls[0][0]).toBe("http://127.0.0.1:8080/v1/chat/completions")
    expect(fake.mock.calls[0][1].redirect).toBe("error")
    expect(result.mode).toBe("extractive"); expect(result.warning).toContain("could not be verified")
  })
  it("accepts a model answer only with a verified source quote", async () => {
    const fake = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "Sunday", insufficient: false, citations: [{ segmentId: "s1", quote: "assignment is due Sunday" }] }) } }] })))
    expect((await askLocalModel("assignment due", doc.segments, fake)).mode).toBe("local-model")
  })
  it("reads the actual Qwen status shape without implying authenticated readiness", () => {
    expect(isQwenAsrConfigured({ configured: true, probe: null })).toBe(true)
    expect(isQwenAsrConfigured({ configured: false })).toBe(false)
    expect(isQwenAsrConfigured({ asr: { configured: true } })).toBe(false)
  })
})

describe("honest engine selection", () => {
  it("allows demo only by explicit choice", () => {
    expect(asrPlan("SIMULATION", false, false)).toEqual(["SIMULATION"])
    expect(asrPlan("SYSTEM_AUDIO", true, true)).toEqual(["QWEN_CHUNKED"])
    expect(asrPlan("MICROPHONE", true, true)).toEqual(["QWEN_CHUNKED"])
    expect(asrPlan("MICROPHONE", true, true, false)).toEqual(["BROWSER_NATIVE"])
    expect(asrPlan("SYSTEM_AUDIO", false, true)).toEqual([])
  })
})

import { QwenChunkedEngine } from "@/lib/asr/engines"
it("discards a late ASR result after stop and aborts its request", async () => {
  const segments = vi.fn()
  let finish!: (value: Response) => void
  const mock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
  vi.stubGlobal("fetch", mock)
  const engine = new QwenChunkedEngine({} as never, { onSegment: segments, onStatus: vi.fn(), onFatal: vi.fn() }, "ar")
  const internal = engine as unknown as { running: boolean; transcribe(blob: Blob, startedAt: number): Promise<void> }
  internal.running = true
  const pending = internal.transcribe(new Blob(["synthetic".repeat(200)]), 1000)
  await vi.waitFor(() => expect(mock).toHaveBeenCalled())
  engine.stop()
  expect((mock.mock.calls as unknown as [string, RequestInit][])[0][1].signal?.aborted).toBe(true)
  finish(new Response(JSON.stringify({ text: "late transcript" })))
  await pending
  expect(segments).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
