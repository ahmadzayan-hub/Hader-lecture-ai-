import { describe, expect, it } from "vitest"
import { answerSchema, briefSchema, nameProfileSchema } from "@/lib/schemas"
import { sessionDocumentSchema, MAX_SEGMENTS } from "@/lib/context/session"

function unreadableOversize(length: number) {
  const values = new Array(length)
  Object.defineProperty(values, "0", { get() { throw new Error("Oversized collection was traversed") } })
  return values
}
describe("bounded collection security", () => {
  it("rejects oversized aliases without reading elements", () => {
    const result = nameProfileSchema.safeParse({ aliases: unreadableOversize(41) })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toHaveLength(1)
  })
  it("retains answer key points at the new generous 100-item ceiling", () => {
    expect(answerSchema.parse({ short: "Answer", extended: "Detail", keyPoints: Array(100).fill("Point"), grounded: true }).keyPoints).toHaveLength(100)
    const result = answerSchema.safeParse({ short: "Answer", extended: "Detail", keyPoints: unreadableOversize(101), grounded: true })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toHaveLength(1)
  })
  it.each(["keyConcepts", "definitions", "assignments", "examPoints", "questionsToReview", "quiz", "flashcards"])("rejects oversized brief %s without traversing it", field => {
    const result = briefSchema.safeParse({ summary: "Summary", [field]: unreadableOversize(101) })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toHaveLength(1)
  })
  it("preserves brief defaults", () => {
    expect(briefSchema.parse({ summary: "Summary" })).toEqual({ summary: "Summary", keyConcepts: [], definitions: [], assignments: [], examPoints: [], questionsToReview: [], quiz: [], flashcards: [] })
  })
  it("rejects oversized session imports before traversing or running refinements", () => {
    const result = sessionDocumentSchema.safeParse({ format: "hader-session", version: 1, id: "synthetic", title: "Synthetic", createdAt: "2026-10-23T00:00:00Z", segments: unreadableOversize(MAX_SEGMENTS + 1) })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toHaveLength(1)
  })
})
