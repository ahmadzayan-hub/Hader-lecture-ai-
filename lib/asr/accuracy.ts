/**
 * Transcription accuracy scoring for HADER AI.
 *
 * Pure, deterministic and dependency-free so the same reference/hypothesis
 * pair always yields the same numbers on any machine. Used by
 * `scripts/asr-benchmark.mts` and `tests/asr-accuracy.test.ts`.
 *
 * This module measures the distance between two texts. It does not record
 * audio, call a provider or prove that any engine is accurate on real
 * lectures: that evidence must come from consented recordings with approved
 * reference transcripts (see docs/LOCAL_FIRST_ARCHITECTURE.md).
 *
 * Syntax is limited to what Node's type stripping accepts (no enums, no
 * parameter properties, type-only imports) so the CLI can load this file
 * directly without a build step.
 */

export type BenchmarkLanguage = "ar" | "en" | "mixed"

export type AlignmentCounts = {
  substitutions: number
  deletions: number
  insertions: number
  hits: number
}

export type AccuracyReport = {
  referenceWords: number
  hypothesisWords: number
  referenceChars: number
  /** Word error rate: (S + D + I) / reference words. 1 when the reference is empty but the hypothesis is not. */
  wer: number
  /** Character error rate on the normalised strings, spaces included. */
  cer: number
  words: AlignmentCounts
  chars: AlignmentCounts
  /** Expected names that do not appear in the normalised hypothesis. */
  missedNames: string[]
  /** Expected numbers that do not appear in the normalised hypothesis. */
  missedNumbers: string[]
}

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g
const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
}
// Anything that is not a letter, a digit or whitespace is punctuation for scoring.
const PUNCTUATION = /[^\p{L}\p{N}\s]/gu

/**
 * Normalise text so that spelling variants an ASR engine cannot be blamed for
 * (diacritics, alef forms, taa marbuta, final yaa, Arabic-Indic digits, case,
 * punctuation) do not count as errors. Word boundaries are whitespace after
 * normalisation.
 */
export function normalizeTranscript(text: string): string {
  return text
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(/[آأإٱ]/g, "ا") // alef variants -> bare alef
    .replace(/ة/g, "ه") // taa marbuta -> haa
    .replace(/[ىی]/g, "ي") // alef maqsura / farsi yeh -> yaa
    .replace(/ک/g, "ك") // keheh -> kaf
    .replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d)
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function tokenizeWords(text: string): string[] {
  const normalised = normalizeTranscript(text)
  return normalised.length === 0 ? [] : normalised.split(" ")
}

/**
 * Standard Levenshtein alignment counting substitutions, deletions (reference
 * tokens missing from the hypothesis) and insertions (extra hypothesis tokens).
 * Ties are resolved deterministically: match/substitution, then deletion, then
 * insertion.
 */
export function alignTokens(reference: readonly string[], hypothesis: readonly string[]): AlignmentCounts {
  const n = reference.length
  const m = hypothesis.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i += 1) dp[i][0] = i
  for (let j = 1; j <= m; j += 1) dp[0][j] = j
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1)
    }
  }
  const counts: AlignmentCounts = { substitutions: 0, deletions: 0, insertions: 0, hits: 0 }
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        if (cost === 0) counts.hits += 1
        else counts.substitutions += 1
        i -= 1
        j -= 1
        continue
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      counts.deletions += 1
      i -= 1
      continue
    }
    counts.insertions += 1
    j -= 1
  }
  return counts
}

function errorCount(counts: AlignmentCounts): number {
  return counts.substitutions + counts.deletions + counts.insertions
}

function errorRate(counts: AlignmentCounts, referenceLength: number, hypothesisLength: number): number {
  if (referenceLength === 0) return hypothesisLength === 0 ? 0 : 1
  return errorCount(counts) / referenceLength
}

export type ScoreOptions = {
  /** Names (any script) the transcript must contain, e.g. the student's or lecturer's name. */
  expectedNames?: readonly string[]
  /** Numbers as written in the reference (any digit script) that must survive transcription. */
  expectedNumbers?: readonly string[]
}

function containsPhrase(normalisedHypothesis: string, phrase: string): boolean {
  const target = normalizeTranscript(phrase)
  if (target.length === 0) return true
  return (" " + normalisedHypothesis + " ").includes(" " + target + " ")
}

/** Score one hypothesis transcript against its reference. */
export function scoreTranscript(reference: string, hypothesis: string, options: ScoreOptions = {}): AccuracyReport {
  const refWords = tokenizeWords(reference)
  const hypWords = tokenizeWords(hypothesis)
  const words = alignTokens(refWords, hypWords)
  const refChars = Array.from(normalizeTranscript(reference))
  const hypChars = Array.from(normalizeTranscript(hypothesis))
  const chars = alignTokens(refChars, hypChars)
  const normalisedHypothesis = hypWords.join(" ")
  return {
    referenceWords: refWords.length,
    hypothesisWords: hypWords.length,
    referenceChars: refChars.length,
    wer: round(errorRate(words, refWords.length, hypWords.length)),
    cer: round(errorRate(chars, refChars.length, hypChars.length)),
    words,
    chars,
    missedNames: (options.expectedNames ?? []).filter((name) => !containsPhrase(normalisedHypothesis, name)),
    missedNumbers: (options.expectedNumbers ?? []).filter((num) => !containsPhrase(normalisedHypothesis, num)),
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/* ------------------------------------------------------------------ *
 * Benchmark manifest
 * ------------------------------------------------------------------ */

export type BenchmarkHypothesis = {
  /** Engine or model label, e.g. "synthetic-good", "qwen3-asr-flash@2026-10", "whisper-large-v3". */
  engine: string
  text: string
  /** Optional provenance: device, model revision, date. Never a secret. */
  note?: string
}

export type BenchmarkCase = {
  id: string
  language: BenchmarkLanguage
  /** "synthetic" cases are invented text; "consented" cases come from approved real recordings. */
  source: "synthetic" | "consented"
  description?: string
  reference: string
  hypotheses: BenchmarkHypothesis[]
  expectedNames?: string[]
  expectedNumbers?: string[]
}

export type BenchmarkManifest = {
  version: 1
  /** Human-readable statement of what the cases are and are not. */
  disclaimer: string
  cases: BenchmarkCase[]
}

export type BenchmarkRow = {
  caseId: string
  language: BenchmarkLanguage
  source: BenchmarkCase["source"]
  engine: string
  note?: string
  report: AccuracyReport
}

export type BenchmarkSummary = {
  engine: string
  cases: number
  /** Micro-averaged over all reference words, so longer cases weigh more. */
  wer: number
  /** Micro-averaged over all reference characters. */
  cer: number
  missedNames: number
  missedNumbers: number
  /** True when every scored case for this engine is synthetic. */
  syntheticOnly: boolean
}

export type BenchmarkResult = {
  rows: BenchmarkRow[]
  summaries: BenchmarkSummary[]
}

export function runBenchmark(manifest: BenchmarkManifest): BenchmarkResult {
  const rows: BenchmarkRow[] = []
  for (const benchmarkCase of manifest.cases) {
    for (const hypothesis of benchmarkCase.hypotheses) {
      rows.push({
        caseId: benchmarkCase.id,
        language: benchmarkCase.language,
        source: benchmarkCase.source,
        engine: hypothesis.engine,
        note: hypothesis.note,
        report: scoreTranscript(benchmarkCase.reference, hypothesis.text, {
          expectedNames: benchmarkCase.expectedNames,
          expectedNumbers: benchmarkCase.expectedNumbers,
        }),
      })
    }
  }
  const byEngine = new Map<string, BenchmarkRow[]>()
  for (const row of rows) {
    const list = byEngine.get(row.engine) ?? []
    list.push(row)
    byEngine.set(row.engine, list)
  }
  const summaries: BenchmarkSummary[] = []
  for (const [engine, list] of byEngine) {
    const refWords = list.reduce((sum, r) => sum + r.report.referenceWords, 0)
    const refChars = list.reduce((sum, r) => sum + r.report.referenceChars, 0)
    const wordErrors = list.reduce((sum, r) => sum + errorCount(r.report.words), 0)
    const charErrors = list.reduce((sum, r) => sum + errorCount(r.report.chars), 0)
    summaries.push({
      engine,
      cases: list.length,
      wer: round(refWords === 0 ? 0 : wordErrors / refWords),
      cer: round(refChars === 0 ? 0 : charErrors / refChars),
      missedNames: list.reduce((sum, r) => sum + r.report.missedNames.length, 0),
      missedNumbers: list.reduce((sum, r) => sum + r.report.missedNumbers.length, 0),
      syntheticOnly: list.every((r) => r.source === "synthetic"),
    })
  }
  summaries.sort((a, b) => a.engine.localeCompare(b.engine))
  return { rows, summaries }
}

/** Minimal structural validation so a malformed manifest fails loudly. */
export function assertManifest(value: unknown): BenchmarkManifest {
  if (!value || typeof value !== "object") throw new Error("manifest must be an object")
  const m = value as Partial<BenchmarkManifest>
  if (m.version !== 1) throw new Error("manifest.version must be 1")
  if (typeof m.disclaimer !== "string" || m.disclaimer.length === 0) throw new Error("manifest.disclaimer is required")
  if (!Array.isArray(m.cases) || m.cases.length === 0) throw new Error("manifest.cases must be a non-empty array")
  const ids = new Set<string>()
  for (const c of m.cases) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) throw new Error("every case needs a string id")
    if (ids.has(c.id)) throw new Error(`duplicate case id: ${c.id}`)
    ids.add(c.id)
    if (c.language !== "ar" && c.language !== "en" && c.language !== "mixed") throw new Error(`${c.id}: bad language`)
    if (c.source !== "synthetic" && c.source !== "consented") {
      throw new Error(`${c.id}: source must be "synthetic" or "consented"`)
    }
    if (typeof c.reference !== "string" || c.reference.trim().length === 0) throw new Error(`${c.id}: reference is required`)
    if (!Array.isArray(c.hypotheses) || c.hypotheses.length === 0) throw new Error(`${c.id}: hypotheses required`)
    for (const h of c.hypotheses) {
      if (!h || typeof h.engine !== "string" || h.engine.length === 0 || typeof h.text !== "string") {
        throw new Error(`${c.id}: every hypothesis needs an engine label and text`)
      }
    }
  }
  return m as BenchmarkManifest
}
