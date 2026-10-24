import { z } from "zod"
import { DETECTION_TYPES } from "./types"

/** Stage 2 semantic verification contract. The LLM may only return this shape. */
export const semanticVerdictSchema = z.object({
  eventType: z.enum(DETECTION_TYPES),
  calledUser: z.boolean(),
  confidence: z.number().min(0).max(1),
  requiresAlert: z.boolean(),
  reason: z.string().min(1).max(400),
})

export type SemanticVerdict = z.infer<typeof semanticVerdictSchema>

export const verifyRequestSchema = z.object({
  phrase: z.string().min(1).max(600),
  aliasMatched: z.string().min(1).max(120),
  deterministicScore: z.number().min(0).max(1),
  previousContext: z.string().max(1200).optional().default(""),
  nextContext: z.string().max(1200).optional().default(""),
  language: z.enum(["ar", "en", "mixed"]).default("en"),
})

export type VerifyRequest = z.infer<typeof verifyRequestSchema>

export const transcribeRequestSchema = z.object({
  /** base64 audio payload, bounded to keep requests small and fast. */
  audio: z.string().min(16).max(3_500_000),
  mimeType: z.string().min(3).max(80).default("audio/webm"),
  language: z.enum(["ar", "en", "auto"]).default("auto"),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
})

export const briefRequestSchema = z.object({
  transcript: z.string().min(20).max(24_000),
  course: z.string().max(160).default(""),
  language: z.enum(["ar", "en", "both"]).default("both"),
})

export const answerRequestSchema = z.object({
  question: z.string().min(2).max(600),
  context: z.string().max(6000).default(""),
  language: z.enum(["ar", "en", "mixed"]).default("en"),
})

export const answerSchema = z.object({
  short: z.string(),
  extended: z.string(),
  keyPoints: z.array(z.string()).max(100),
  grounded: z.boolean(),
})

export type AnswerDraft = z.infer<typeof answerSchema>

export const briefSchema = z.object({
  summary: z.string(),
  keyConcepts: z.array(z.string()).max(100).default([]),
  definitions: z.array(z.object({ term: z.string(), meaning: z.string() })).max(100).default([]),
  assignments: z.array(z.string()).max(100).default([]),
  examPoints: z.array(z.string()).max(100).default([]),
  questionsToReview: z.array(z.string()).max(100).default([]),
  quiz: z.array(z.object({ question: z.string(), answer: z.string() })).max(100).default([]),
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })).max(100).default([]),
})

export const nameProfileSchema = z.object({
  fullName: z.string().max(120).default(""),
  firstName: z.string().max(60).default(""),
  surname: z.string().max(60).default(""),
  aliases: z.array(z.string().max(60)).max(40).default([]),
  arabicAliases: z.array(z.string().max(60)).max(40).default([]),
})

export const pairingCodeSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Pairing code must be 6 digits"),
  role: z.enum(["SOURCE", "ALERT", "BOTH"]).default("ALERT"),
  label: z.string().max(60).default("Companion device"),
})

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

/** Cross-device realtime payload. */
export const deviceAlertSchema = z.object({
  kind: z.enum(["ALERT", "CONFIRMED", "DISMISSED", "HEARTBEAT", "STOP"]),
  sessionId: z.string(),
  eventId: z.string().optional(),
  detectionType: z.enum(DETECTION_TYPES).optional(),
  phrase: z.string().max(600).optional(),
  confidence: z.number().min(0).max(1).optional(),
  at: z.number(),
  fromDevice: z.string().max(80),
})

export type DeviceAlert = z.infer<typeof deviceAlertSchema>
