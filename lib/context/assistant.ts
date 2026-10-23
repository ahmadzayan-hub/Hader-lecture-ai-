import { z } from "zod"
import { normalizeForMatch } from "@/lib/detection/normalize"
import { contextSegmentSchema, type ContextSegment } from "./session"

export type Citation = { segmentId: string; quote: string; offsetMs: number | null }
export type ContextAnswer = {
  mode: "extractive" | "local-model"
  status: "evidence" | "insufficient"
  text: string
  citations: Citation[]
  warning?: string
}
const STOP = new Set("what when where who how why is are was were the a an of to in on for did do does please tell me about can you we our it this that and from have has will be ما ماذا متى كيف اين من في عن على الى هو هي هل انا لنا هذا هذه الذي التي او و لي ممكن ايه امتى ازاي ده دي".split(" "))
function tokens(text: string): string[] {
  return [...new Set(normalizeForMatch(text).split(" ").filter(t => t.length > 1 && !STOP.has(t)))]
}
export function citation(segment: ContextSegment): Citation {
  return { segmentId: segment.id, quote: segment.text, offsetMs: segment.offsetMs }
}

/** Lexical evidence lookup, not semantic reasoning or model training. */
export function findEvidence(segments: ContextSegment[], question: string, limit = 5): ContextSegment[] {
  const terms = tokens(question)
  if (!terms.length) return []
  return segments.map((s, index) => {
    const words = new Set(tokens(s.text))
    const matched = terms.filter(t => words.has(t)).length
    return { s, index, score: matched / terms.length }
  }).filter(x => x.score >= 0.5).sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit).map(x => x.s)
}
export function answerExtractively(segments: ContextSegment[], question: string): ContextAnswer {
  const matches = findEvidence(segments, question)
  return {
    mode: "extractive", status: matches.length ? "evidence" : "insufficient",
    text: matches.length
      ? "Matching transcript excerpts, not an inferred answer. Check the quoted context before using it."
      : "Not enough matching evidence in this transcript. Try the exact term used, import more context, or ask the speaker to clarify.",
    citations: matches.map(citation),
  }
}
export function catchUp(segments: ContextSegment[], sinceMs: number | null): Citation[] {
  // Untimed imports cannot be presented as a precise last-N-minutes window.
  return segments.filter(s => sinceMs === null || (s.offsetMs !== null && s.offsetMs >= sinceMs))
    .slice(-12).map(citation)
}
export function reviewCandidates(segments: ContextSegment[]) {
  const actions = /\b(assignment|homework|due|deadline|submit|action item|follow up)\b|واجب|تسليم|الموعد|متابعه|متابعة/i
  const decisions = /\b(decided|decision|agreed|approved)\b|اتفقنا|قررنا|القرار|اعتمدنا/i
  return {
    actions: segments.filter(s => actions.test(s.text)).slice(-8).map(citation),
    decisions: segments.filter(s => decisions.test(s.text)).slice(-8).map(citation),
  }
}
export function proposedQuestions(segments: ContextSegment[]): { text: string; citation: Citation }[] {
  const candidates = reviewCandidates(segments)
  const ar = /[\u0600-\u06ff]/.test(segments.at(-1)?.text ?? "")
  const last = segments.at(-1)
  return [
    ...candidates.actions.slice(-1).map(c => ({ text: ar ? "هل توجد متابعة مطلوبة هنا؟ ومن المسؤول وما موعدها إن وجدت؟" : "Is follow-up needed here? If so, who owns it and when is it due?", citation: c })),
    ...candidates.decisions.slice(-1).map(c => ({ text: ar ? "هل تم اتخاذ قرار هنا؟ وما الافتراضات التي تدعمه إن وجد؟" : "Was a decision made here, and what assumptions would support it?", citation: c })),
    ...(last ? [{ text: ar ? "هل يمكن توضيح هذه النقطة بمثال عملي؟" : "Could you illustrate this point with a practical example?", citation: citation(last) }] : []),
  ]
}

export const contextRequestSchema = z.object({
  question: z.string().trim().min(2).max(1000),
  segments: z.array(contextSegmentSchema).min(1).max(24),
}).refine(x => x.segments.reduce((n, s) => n + s.text.length, 0) <= 24_000, "Context is too large.")
const modelAnswerSchema = z.object({
  answer: z.string().trim().max(4000),
  insufficient: z.boolean(),
  citations: z.array(z.object({ segmentId: z.string(), quote: z.string().trim().min(8).max(12_000) })).max(8),
})
/** A citation must resolve to text actually supplied. This is not an entailment proof. */
export function validateModelAnswer(raw: unknown, segments: ContextSegment[]): ContextAnswer | null {
  const parsed = modelAnswerSchema.safeParse(raw)
  if (!parsed.success) return null
  const result = parsed.data
  if (result.insufficient) return { mode: "local-model", status: "insufficient", text: "The local model found insufficient evidence. Ask for clarification or supply more context.", citations: [] }
  if (!result.answer || !result.citations.length) return null
  const citations: Citation[] = []
  for (const c of result.citations) {
    const s = segments.find(s => s.id === c.segmentId)
    if (!s || !s.text.includes(c.quote)) return null
    citations.push({ ...c, offsetMs: s.offsetMs })
  }
  return { mode: "local-model", status: "evidence", text: result.answer, citations,
    warning: "AI draft. Citation text was checked, but the interpretation can still be wrong. Review before speaking or sharing." }
}
