/**
 * HADER AI — shared domain types.
 * Single source of truth for the realtime presence pipeline.
 */

export const DETECTION_TYPES = [
  "ATTENDANCE_CALL",
  "DIRECT_QUESTION",
  "DIRECT_MENTION",
  "POSSIBLE_MENTION",
  "GENERAL_SPEECH",
  "FALSE_POSITIVE",
] as const

export type DetectionType = (typeof DETECTION_TYPES)[number]

/** Types that are allowed to raise a full-screen alarm. */
export const ALERTABLE_TYPES: DetectionType[] = ["ATTENDANCE_CALL", "DIRECT_QUESTION"]

export type DetectionEvent = {
  id: string
  sessionId: string
  timestamp: string
  type: DetectionType
  phrase: string
  aliasMatched: string
  confidence: number
  deterministicScore: number
  semanticScore?: number
  alertRequired: boolean
  confirmed?: boolean
  confirmationLatencyMs?: number
  falseAlarm?: boolean
  language: "ar" | "en" | "mixed"
}

/** Explicit lifecycle. Never represent this with loose booleans. */
export const SESSION_STATES = [
  "IDLE",
  "PREPARING",
  "REQUESTING_AUDIO",
  "CONNECTING_ASR",
  "READY",
  "LISTENING",
  "MENTION_CANDIDATE",
  "ALERTING",
  "WAITING_CONFIRMATION",
  "CONFIRMED",
  "RECONNECTING",
  "DEGRADED",
  "STOPPING",
  "ENDED",
  "ERROR",
] as const

export type SessionState = (typeof SESSION_STATES)[number]

export type AsrEngineId = "QWEN_CHUNKED" | "BROWSER_NATIVE" | "SIMULATION" | "NONE"

export type AsrStatus =
  | "OFFLINE"
  | "CONNECTING"
  | "CONNECTED"
  | "LISTENING"
  | "RECONNECTING"
  | "DEGRADED"
  | "ERROR"

/** Kept as an alias so older call sites stay valid. */
export type AsrConnectionState = AsrStatus

export type AudioSource = "SYSTEM_AUDIO" | "MICROPHONE" | "SIMULATION"

export type TranscriptSegment = {
  id: string
  text: string
  /** Partial results are hypotheses and must render differently. */
  isFinal: boolean
  startedAt: number
  receivedAt: number
  engine: AsrEngineId
  /** Round trip for this chunk, when the engine can measure it. */
  latencyMs?: number
  /** True only for scripted simulation output. Drives the DEMO badge. */
  isDemo?: boolean
  sessionId?: string
  language?: "ar" | "en" | "mixed"
  /** Present when the detector matched this segment. */
  detection?: {
    type: DetectionType
    confidence: number
    alias: string
    alertRequired: boolean
  }
}

export type Sensitivity = "low" | "balanced" | "high"

export type NameProfile = {
  fullName: string
  firstName: string
  surname: string
  /** Free-form alias list: spellings, transliterations, nicknames, ASR errors. */
  aliases: string[]
  arabicAliases: string[]
}

export type LectureProfile = {
  id: string
  course: string
  lecturer: string
  language: "ar" | "en" | "both"
  sensitivity: Sensitivity
  preferredSource: AudioSource
  responsePhrase: string
  alertSound: "siren" | "chime" | "voice"
  keywords: string[]
}

export type PreflightId =
  | "aliases"
  | "audioPermission"
  | "audioSignal"
  | "asr"
  | "llm"
  | "notifications"
  | "sound"
  | "vibration"
  | "phone"
  | "network"
  | "wakeLock"

export type PreflightStatus = "pending" | "pass" | "warn" | "fail"

export type PreflightCheck = {
  id: PreflightId
  label: string
  /** P0 checks block a truthful "READY" state. */
  critical: boolean
  status: PreflightStatus
  detail: string
  fix?: string
}

export type HealthState = "healthy" | "degraded" | "down"

export type HealthReport = {
  status: HealthState
  checkedAt: string
  services: Record<
    "app" | "database" | "realtime" | "asr" | "llm" | "push" | "auth",
    { status: HealthState; detail: string }
  >
}

export type DeviceRole = "SOURCE" | "ALERT" | "BOTH"

export type PairedDevice = {
  id: string
  label: string
  role: DeviceRole
  platform: string
  online: boolean
  lastSeen: string
  battery?: number
}

/**
 * SUPABASE reaches other machines. LOCAL only reaches other tabs of the same
 * browser — the UI must say so rather than implying a paired phone.
 */
export type PairingTransport = "SUPABASE" | "LOCAL"

export type DevicePeer = {
  deviceId: string
  deviceName: string
  role: DeviceRole
  platform: string
  online: boolean
  /** Epoch ms of the last heartbeat. */
  lastSeen: number
  batteryLevel?: number
}

export type RealtimeMessageType =
  | "HEARTBEAT"
  | "ALERT"
  | "ESCALATE"
  | "RESOLVED"
  | "SESSION_STATE"
  | "TRANSCRIPT"

export type RealtimeMessage = {
  type: RealtimeMessageType
  deviceId: string
  sentAt: number
  deviceName?: string
  role?: DeviceRole
  platform?: string
  batteryLevel?: number
  /** Payload for ALERT / ESCALATE. */
  event?: DetectionEvent
  /** Payload for SESSION_STATE. */
  state?: SessionState
  /** Payload for TRANSCRIPT. */
  text?: string
  /** How the alert was resolved. */
  resolution?: "CONFIRMED" | "FALSE_ALARM" | "STOPPED"
}

export type SessionSummary = {
  sessionId: string
  course: string
  startedAt: string
  endedAt: string
  durationMs: number
  totalDetections: number
  confirmedCalls: number
  falseAlarms: number
  avgConfirmationMs: number | null
}

export type LectureBrief = {
  summary: string
  keyConcepts: string[]
  definitions: { term: string; meaning: string }[]
  assignments: string[]
  examPoints: string[]
  questionsToReview: string[]
  quiz: { question: string; answer: string }[]
  flashcards: { front: string; back: string }[]
  source: "qwen" | "local"
  providerNotice?: string
}
