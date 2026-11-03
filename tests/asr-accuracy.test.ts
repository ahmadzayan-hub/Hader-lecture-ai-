import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  alignTokens,
  assertManifest,
  normalizeTranscript,
  runBenchmark,
  scoreTranscript,
  tokenizeWords,
} from "@/lib/asr/accuracy"

const manifestPath = new URL("./fixtures/asr-benchmark/manifest.json", import.meta.url)

describe("transcript normalisation", () => {
  it("strips tashkeel, unifies alef / taa marbuta / yaa and converts Arabic-Indic digits", () => {
    expect(normalizeTranscript("أَحْمَدُ، المحاضرةُ الثالثةُ: ٤ بعد الظهر!")).toBe("احمد المحاضره الثالثه 4 بعد الظهر")
    expect(normalizeTranscript("إلى آخر ٱلدرس ى")).toBe("الي اخر الدرس ي")
  })

  it("lowercases, removes punctuation and collapses whitespace in English", () => {
    expect(normalizeTranscript("  Before we MOVE on, Ahmed...  can you?  ")).toBe("before we move on ahmed can you")
  })

  it("tokenises an empty or punctuation-only string to no words", () => {
    expect(tokenizeWords("")).toEqual([])
    expect(tokenizeWords("... !!! ،،")).toEqual([])
  })
})

describe("word alignment", () => {
  it("counts an exact match as all hits", () => {
    expect(alignTokens(["a", "b", "c"], ["a", "b", "c"])).toEqual({ substitutions: 0, deletions: 0, insertions: 0, hits: 3 })
  })

  it("distinguishes substitutions, deletions and insertions", () => {
    // Unique optimal alignment: delete b, substitute d->q, insert f (cost 3; any all-substitution path costs 4).
    expect(alignTokens(["a", "b", "c", "d", "e"], ["a", "c", "q", "e", "f"])).toEqual({
      substitutions: 1,
      deletions: 1,
      insertions: 1,
      hits: 3,
    })
  })

  it("treats an empty hypothesis as all deletions and an empty reference as all insertions", () => {
    expect(alignTokens(["a", "b"], [])).toEqual({ substitutions: 0, deletions: 2, insertions: 0, hits: 0 })
    expect(alignTokens([], ["a", "b"])).toEqual({ substitutions: 0, deletions: 0, insertions: 2, hits: 0 })
  })
})

describe("scoreTranscript", () => {
  it("returns zero error for text that differs only in normalisable ways", () => {
    const report = scoreTranscript("التسليم يوم الخميس الساعة ٤.", "التَّسليم يوم الخميس الساعه 4")
    expect(report.wer).toBe(0)
    expect(report.cer).toBe(0)
    expect(report.referenceWords).toBe(5)
  })

  it("computes a known WER: 2 errors over 8 reference words", () => {
    const report = scoreTranscript(
      "the assignment is due on march twelve tomorrow",
      "the assignment is due on march twenty tomorrow please",
    )
    expect(report.referenceWords).toBe(8)
    expect(report.words).toEqual({ substitutions: 1, deletions: 0, insertions: 1, hits: 7 })
    expect(report.wer).toBe(0.25)
  })

  it("reports WER 1 for a non-empty hypothesis against an empty reference and 0 for both empty", () => {
    expect(scoreTranscript("", "hello").wer).toBe(1)
    expect(scoreTranscript("", "").wer).toBe(0)
  })

  it("lists missed names and numbers across scripts", () => {
    const report = scoreTranscript(
      "أحمد زيان موجود؟ الدرجة من ١٠٠ والتسليم الساعة ٤",
      "احمد زيدان موجود الدرجه من 100 والتسليم الساعه",
      { expectedNames: ["أحمد زيان", "Ahmed"], expectedNumbers: ["١٠٠", "٤"] },
    )
    expect(report.missedNames).toEqual(["أحمد زيان", "Ahmed"])
    expect(report.missedNumbers).toEqual(["٤"])
  })

  it("is deterministic", () => {
    const a = scoreTranscript("one two three four", "one too three")
    const b = scoreTranscript("one two three four", "one too three")
    expect(a).toEqual(b)
  })
})

describe("benchmark manifest", () => {
  const manifest = assertManifest(JSON.parse(readFileSync(manifestPath, "utf8")))

  it("covers Arabic, English and mixed cases and is labelled synthetic", () => {
    const languages = new Set(manifest.cases.map((c) => c.language))
    expect(languages).toEqual(new Set(["ar", "en", "mixed"]))
    expect(manifest.cases.every((c) => c.source === "synthetic")).toBe(true)
    expect(manifest.disclaimer).toMatch(/SYNTHETIC/)
  })

  it("scores the exact hypotheses at zero error and the degraded ones above zero with misses", () => {
    const result = runBenchmark(manifest)
    const exact = result.rows.filter((r) => r.engine === "synthetic-exact")
    const degraded = result.rows.filter((r) => r.engine === "synthetic-degraded")
    expect(exact).toHaveLength(manifest.cases.length)
    expect(degraded).toHaveLength(manifest.cases.length)
    for (const row of exact) {
      expect(row.report.wer, row.caseId).toBe(0)
      expect(row.report.missedNames, row.caseId).toEqual([])
      expect(row.report.missedNumbers, row.caseId).toEqual([])
    }
    for (const row of degraded) {
      expect(row.report.wer, row.caseId).toBeGreaterThan(0)
      expect(row.report.wer, row.caseId).toBeLessThan(0.5)
    }
    const degradedSummary = result.summaries.find((s) => s.engine === "synthetic-degraded")
    expect(degradedSummary?.missedNames).toBeGreaterThan(0)
    expect(degradedSummary?.missedNumbers).toBeGreaterThan(0)
    expect(result.summaries.every((s) => s.syntheticOnly)).toBe(true)
  })

  it("rejects malformed manifests", () => {
    expect(() => assertManifest({})).toThrow(/version/)
    expect(() => assertManifest({ version: 1, disclaimer: "x", cases: [] })).toThrow(/non-empty/)
    expect(() =>
      assertManifest({
        version: 1,
        disclaimer: "x",
        cases: [{ id: "a", language: "en", source: "real", reference: "r", hypotheses: [{ engine: "e", text: "t" }] }],
      }),
    ).toThrow(/source/)
    expect(() =>
      assertManifest({
        version: 1,
        disclaimer: "x",
        cases: [
          { id: "a", language: "en", source: "synthetic", reference: "r", hypotheses: [{ engine: "e", text: "t" }] },
          { id: "a", language: "en", source: "synthetic", reference: "r", hypotheses: [{ engine: "e", text: "t" }] },
        ],
      }),
    ).toThrow(/duplicate/)
  })
})
