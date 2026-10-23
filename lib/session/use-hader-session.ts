"use client"

/**
 * useHaderSession — the orchestrator.
 *
 * Owns the whole realtime path:
 *   capture -> ASR engine chain -> deterministic detector
 *           -> (ambiguous only) semantic verification
 *           -> alert engine + cross-device broadcast
 *           -> explicit user confirmation -> back to LISTENING
 *
 * Rules encoded here:
 *  - State comes from the explicit machine, never ad-hoc booleans.
 *  - We never report LISTENING unless an engine is actually delivering audio.
 *  - Detection runs locally on every segment; the LLM is consulted only for the
 *    ambiguous confidence band, and it can only *advise*, never act.
 *  - Alerts end only by explicit user action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type AsrStatus,
  type AudioSource,
  type DetectionEvent,
  type DevicePeer,
  type PairingTransport,
  type RealtimeMessage,
  type SessionState,
  type TranscriptSegment,
} from "@/lib/types"
import { type CaptureHandle, CaptureError, captureFor } from "@/lib/audio/capture"
import {
  type AsrEngine,
  BrowserSpeechEngine,
  QwenChunkedEngine,
  SimulationEngine,
  browserAsrAvailable,
  asrPlan,
  isQwenAsrConfigured,
} from "@/lib/asr/engines"
import { AlertEngine, type EscalationStage } from "@/lib/alerts/engine"
import { createAlertChannel, deviceIdentity, detectPlatform, type AlertChannel } from "@/lib/devices/channel"
import { buildAliasIndex, detect, type AliasIndex } from "@/lib/detection/engine"
import { transition as reduce, type SessionEvent } from "@/lib/session/machine"
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/defaults"
import type { NameProfile } from "@/lib/types"

const MAX_TRANSCRIPT_SEGMENTS = 10_000
/** Rolling context handed to the verifier and the brief builder. */
const CONTEXT_SEGMENTS = 6

export interface PendingAlert {
  event: DetectionEvent
  raisedAt: number
  stage: EscalationStage
}

export interface HaderSessionApi {
  state: SessionState
  asrStatus: AsrStatus
  asrEngineLabel: string
  asrDetail: string
  source: AudioSource
  audioLevel: number
  segments: TranscriptSegment[]
  events: DetectionEvent[]
  pendingAlert: PendingAlert | null
  peers: DevicePeer[]
  transport: PairingTransport
  transportState: "CONNECTED" | "CONNECTING" | "OFFLINE"
  room: string
  sessionId: string | null
  startedAt: number | null
  lastError: string | null
  isDemo: boolean

  start(source: AudioSource): Promise<void>
  stop(): void
  confirmPresence(): void
  dismissFalseAlarm(): void
  snooze(): void
  injectPhrase(text: string): void
  setRoom(room: string): void
  primeAudio(): Promise<boolean>
}

export function useHaderSession(options: {
  profile: NameProfile
  preferences?: Preferences
  language?: "ar" | "en" | "both"
}): HaderSessionApi {
  const preferences = options.preferences ?? DEFAULT_PREFERENCES
  const { profile } = options

  const [state, setState] = useState<SessionState>("IDLE")
  const [asrStatus, setAsrStatus] = useState<AsrStatus>("OFFLINE")
  const [asrEngineLabel, setAsrEngineLabel] = useState("Not started")
  const [asrDetail, setAsrDetail] = useState("")
  const [source, setSource] = useState<AudioSource>("SYSTEM_AUDIO")
  const [audioLevel, setAudioLevel] = useState(0)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [events, setEvents] = useState<DetectionEvent[]>([])
  const [pendingAlert, setPendingAlert] = useState<PendingAlert | null>(null)
  const [peers, setPeers] = useState<DevicePeer[]>([])
  const [transportState, setTransportState] = useState<"CONNECTED" | "CONNECTING" | "OFFLINE">("OFFLINE")
  const [room, setRoomState] = useState("hader-default")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const runGeneration = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const captureRef = useRef<CaptureHandle | null>(null)
  const engineRef = useRef<AsrEngine | null>(null)
  const channelRef = useRef<AlertChannel | null>(null)
  const alertRef = useRef<AlertEngine | null>(null)
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const snoozeUntil = useRef(0)
  /** Guards against re-alerting for the same utterance. */
  const lastAlertPhrase = useRef<string>("")
  const segmentsRef = useRef<TranscriptSegment[]>([])
  const identity = useRef(typeof window === "undefined" ? null : deviceIdentity())

  segmentsRef.current = segments

  const transport: PairingTransport = channelRef.current?.transport ?? "LOCAL"
  const isDemo = source === "SIMULATION"

  /**
   * All state changes go through the explicit transition table, so an
   * impossible combination (e.g. LISTENING while audio is denied) cannot be
   * represented. Events the current state does not accept are ignored.
   */
  const dispatch = useCallback((event: SessionEvent) => {
    setState((current) => reduce(current, event))
  }, [])

  /** Alias index is rebuilt only when the profile or learned weights change. */
  const aliasIndex: AliasIndex = useMemo(
    () => buildAliasIndex(profile, preferences.aliasWeights),
    [profile, preferences.aliasWeights],
  )

  /* -------------------------------------------------------------- *
   * Cross-device channel
   * -------------------------------------------------------------- */

  const broadcast = useCallback((message: Omit<RealtimeMessage, "deviceId" | "sentAt">) => {
    const id = identity.current
    if (!id || !channelRef.current) return
    channelRef.current.publish({
      ...message,
      deviceId: id.deviceId,
      sentAt: Date.now(),
    } as RealtimeMessage)
  }, [])

  const raiseAlert = useCallback(
    (event: DetectionEvent, fromRemote: boolean) => {
      if (Date.now() < snoozeUntil.current) return
      if (alertRef.current?.isActive) return

      setPendingAlert({ event, raisedAt: Date.now(), stage: 0 })
      dispatch({ type: "ALERT" })

      alertRef.current?.configure({
        sound: preferences.soundEnabled,
        vibration: preferences.vibrationEnabled,
      })
      alertRef.current?.start({
        title: event.type === "DIRECT_QUESTION" ? "A question was directed at you" : "Your name was called",
        body: event.phrase,
      })

      // Only the detecting device fans out, otherwise devices echo forever.
      if (!fromRemote) broadcast({ type: "ALERT", event })
      dispatch({ type: "AWAIT_CONFIRMATION" })
    },
    [broadcast, preferences.soundEnabled, preferences.vibrationEnabled, dispatch],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const id = identity.current
    if (!id) return

    const channel = createAlertChannel(
      room,
      { deviceId: id.deviceId, deviceName: id.deviceName, role: "BOTH" },
      {
        onMessage(message) {
          if (message.type === "ALERT" && message.event) {
            raiseAlert(message.event, true)
            return
          }
          if (message.type === "ESCALATE" && message.event) {
            raiseAlert(message.event, true)
            return
          }
          if (message.type === "RESOLVED") {
            alertRef.current?.stop()
            setPendingAlert(null)
            return
          }
          if (message.type === "TRANSCRIPT" && message.text) {
            setSegments((prev) =>
              cap([
                ...prev,
                {
                  id: `remote_${message.sentAt}`,
                  text: message.text as string,
                  isFinal: true,
                  startedAt: message.sentAt,
                  receivedAt: Date.now(),
                  engine: "NONE",
                },
              ]),
            )
          }
        },
        onPeersChanged: setPeers,
        onTransportState: setTransportState,
      },
    )

    channelRef.current = channel
    void channel.connect()

    return () => {
      channel.disconnect()
      channelRef.current = null
    }
  }, [room, raiseAlert])

  /* -------------------------------------------------------------- *
   * Alert engine
   * -------------------------------------------------------------- */

  useEffect(() => {
    alertRef.current = new AlertEngine({
      onStage(stage) {
        setPendingAlert((prev) => (prev ? { ...prev, stage } : prev))
      },
      onCrossDevice() {
        setPendingAlert((prev) => {
          if (prev) broadcast({ type: "ESCALATE", event: prev.event })
          return prev
        })
      },
    })
    return () => {
      alertRef.current?.dispose()
      alertRef.current = null
    }
  }, [broadcast])

  const primeAudio = useCallback(async () => {
    return (await alertRef.current?.prime()) ?? false
  }, [])

  /* -------------------------------------------------------------- *
   * Detection pipeline
   * -------------------------------------------------------------- */

  const handleSegment = useCallback(
    (segment: TranscriptSegment) => {
      setSegments((prev) => cap([...prev, segment]))

      // Partial hypotheses are displayed but never alerted on — they change.
      if (!segment.isFinal) return

      const history = segmentsRef.current.slice(-CONTEXT_SEGMENTS).map((s) => s.text)
      const context = history.join(" ")

      const result = detect(segment.text, aliasIndex, {
        sensitivity: preferences.sensitivity,
        history,
      })

      if (result.type === "GENERAL_SPEECH" || result.type === "FALSE_POSITIVE") return

      const event: DetectionEvent = {
        id: `evt_${Date.now().toString(36)}`,
        sessionId: sessionIdRef.current ?? "unsaved",
        timestamp: new Date().toISOString(),
        type: result.type,
        phrase: segment.text,
        aliasMatched: result.aliasMatched,
        confidence: result.confidence,
        deterministicScore: result.deterministicScore,
        alertRequired: result.alertRequired,
        language: result.language,
      }

      setEvents((prev) => [event, ...prev].slice(0, 200))
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segment.id
            ? {
                ...s,
                detection: {
                  type: result.type,
                  confidence: result.confidence,
                  alias: result.aliasMatched,
                  alertRequired: result.alertRequired,
                },
              }
            : s,
        ),
      )

      if (result.alertRequired) {
        if (lastAlertPhrase.current === segment.text) return
        lastAlertPhrase.current = segment.text
        raiseAlert(event, false)
        return
      }

      // Ambiguous band -> ask the text model, which can only advise.
      if (result.needsSemanticCheck) {
        dispatch({ type: "CANDIDATE" })
        const generation = runGeneration.current
        void verifyRemotely(event, context, profile).then((verdict) => {
          if (generation !== runGeneration.current) return
          if (!verdict) {
            dispatch({ type: "START_LISTENING" })
            return
          }
          const merged: DetectionEvent = {
            ...event,
            type: verdict.eventType,
            confidence: verdict.confidence,
            semanticScore: verdict.confidence,
            alertRequired: verdict.requiresAlert && verdict.calledUser,
          }
          setEvents((prev) => [merged, ...prev.filter((e) => e.id !== event.id)].slice(0, 200))
          if (merged.alertRequired) {
            lastAlertPhrase.current = segment.text
            raiseAlert(merged, false)
          } else {
            dispatch({ type: "START_LISTENING" })
          }
        })
      }
    },
    [aliasIndex, preferences.sensitivity, profile, raiseAlert, sessionId, dispatch],
  )

  /* -------------------------------------------------------------- *
   * Engine chain
   * -------------------------------------------------------------- */

  const startEngineChain = useCallback(
    async (capture: CaptureHandle | null, chosen: AudioSource, generation: number) => {
      const language = options.language === "en" ? "en" : options.language === "ar" ? "ar" : "ar"

      const callbacks = {
        onSegment: (segment: TranscriptSegment) => { if (generation === runGeneration.current) handleSegment(segment) },
        onStatus: (status: AsrStatus, detail?: string) => {
          if (generation !== runGeneration.current) return
          setAsrStatus(status)
          setAsrDetail(detail ?? "")
          if (status === "LISTENING") dispatch({ type: "START_LISTENING" })
          else if (status === "RECONNECTING") dispatch({ type: "ASR_LOST" })
          else if (status === "DEGRADED") dispatch({ type: "ASR_DEGRADED", reason: "engine degraded" })
        },
        onFatal: (reason: string) => {
          if (generation !== runGeneration.current) return
          setAsrDetail(reason)
          void fallback(reason)
        },
      }

      // Select once before sending audio. Provider errors never trigger an unrequested provider switch.
      const configuration = chosen === "SIMULATION" ? null : await fetch("/api/qwen/status", { cache: "no-store" })
        .then(r => r.json()).catch(() => null)
      if (generation !== runGeneration.current) return
      const chain = asrPlan(chosen, Boolean(capture), browserAsrAvailable(), isQwenAsrConfigured(configuration)).map(id => () => {
        if (id === "SIMULATION") return new SimulationEngine(callbacks)
        if (id === "BROWSER_NATIVE") return new BrowserSpeechEngine(callbacks, language)
        return capture ? new QwenChunkedEngine(capture, callbacks, language) : null
      })

      let level = 0

      async function launch(): Promise<void> {
        while (level < chain.length) {
          const factory = chain[level]
          level += 1
          const engine = factory()
          if (!engine) continue
          engineRef.current = engine
          setAsrEngineLabel(engine.label)
          await engine.start()
          return
        }
        setAsrStatus("ERROR")
        setLastError("No real transcription engine is available. Import a transcript in Session Assistant or explicitly choose Simulation.")
        captureRef.current?.stop()
        dispatch({ type: "FAIL", reason: "session error" })
      }

      async function fallback(reason: string) {
        engineRef.current?.stop()
        engineRef.current = null
        if (level >= chain.length) {
          setAsrStatus("ERROR")
          setLastError(`${reason} Import a transcript in Session Assistant. Simulation runs only when explicitly selected.`)
          captureRef.current?.stop()
          dispatch({ type: "FAIL", reason: "session error" })
          return
        }
        setAsrStatus("DEGRADED")
        dispatch({ type: "ASR_DEGRADED", reason: "engine degraded" })
        await launch()
      }

      await launch()
    },
    [handleSegment, options.language, dispatch],
  )

  /* -------------------------------------------------------------- *
   * Public controls
   * -------------------------------------------------------------- */

  const start = useCallback(
    async (chosen: AudioSource) => {
      const generation = ++runGeneration.current
      setLastError(null)
      setSource(chosen)
      dispatch({ type: "PREPARE" })

      // Unlock audio here — this call originates from a user gesture.
      await alertRef.current?.prime()

      let capture: CaptureHandle | null = null
      if (chosen !== "SIMULATION") {
        dispatch({ type: "REQUEST_AUDIO" })
        try {
          capture = await captureFor(chosen)
        } catch (error) {
          const message =
            error instanceof CaptureError ? `${error.message} ${error.remedy}` : "Audio capture failed."
          setLastError(message)
          setAsrStatus("OFFLINE")
          dispatch({ type: "FAIL", reason: "session error" })
          return
        }

        if (generation !== runGeneration.current) { capture.stop(); return }
        captureRef.current = capture
        capture.onEnded(() => {
          setLastError("Audio sharing was stopped, so monitoring ended.")
          stop()
        })

        levelTimer.current = setInterval(() => {
          setAudioLevel(captureRef.current?.getLevel() ?? 0)
        }, 120)
      }

      const id = `ses_${Date.now().toString(36)}`
      sessionIdRef.current = id
      setSessionId(id)
      setStartedAt(Date.now())
      setSegments([])
      setEvents([])
      lastAlertPhrase.current = ""

      dispatch({ type: "AUDIO_GRANTED" })
      await startEngineChain(capture, chosen, generation)
      // Engine callbacks, not an attempted start, determine actual listening state.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [broadcast, startEngineChain, dispatch],
  )

  const stop = useCallback(() => {
    runGeneration.current += 1
    dispatch({ type: "STOP" })
    engineRef.current?.stop()
    engineRef.current = null
    captureRef.current?.stop()
    captureRef.current = null
    if (levelTimer.current) clearInterval(levelTimer.current)
    levelTimer.current = null
    alertRef.current?.stop()
    setPendingAlert(null)
    setAudioLevel(0)
    setAsrStatus("OFFLINE")
    setAsrEngineLabel("Not started")
    broadcast({ type: "RESOLVED", resolution: "STOPPED" })
    dispatch({ type: "ENDED" })
  }, [broadcast, dispatch])

  const confirmPresence = useCallback(() => {
    alertRef.current?.stop()
    setPendingAlert((prev) => {
      if (!prev) return null
      const latency = Date.now() - prev.raisedAt
      setEvents((list) =>
        list.map((e) =>
          e.id === prev.event.id ? { ...e, confirmed: true, confirmationLatencyMs: latency } : e,
        ),
      )
      broadcast({ type: "RESOLVED", resolution: "CONFIRMED", event: prev.event })
      return null
    })
    dispatch({ type: "CONFIRM" })
    // Return to listening if an engine is still alive.
    setTimeout(() => {
      if (engineRef.current) dispatch({ type: "START_LISTENING" })
    }, 400)
  }, [broadcast, dispatch])

  const dismissFalseAlarm = useCallback(() => {
    alertRef.current?.stop()
    setPendingAlert((prev) => {
      if (!prev) return null
      setEvents((list) => list.map((e) => (e.id === prev.event.id ? { ...e, falseAlarm: true } : e)))
      broadcast({ type: "RESOLVED", resolution: "FALSE_ALARM", event: prev.event })
      return null
    })
    if (engineRef.current) dispatch({ type: "START_LISTENING" })
  }, [broadcast, dispatch])

  const snooze = useCallback(() => {
    alertRef.current?.stop()
    snoozeUntil.current = Date.now() + 10_000
    setPendingAlert(null)
    if (engineRef.current) dispatch({ type: "START_LISTENING" })
  }, [dispatch])

  const injectPhrase = useCallback(
    (text: string) => {
      const engine = engineRef.current
      if (engine instanceof SimulationEngine) {
        engine.inject(text)
        return
      }
      // Works even with no engine running, so "test alert" is always truthful
      // about what it does: it feeds one phrase through the real detector.
      handleSegment({
        id: `inj_${Date.now().toString(36)}`,
        text,
        isFinal: true,
        startedAt: Date.now(),
        receivedAt: Date.now(),
        engine: "SIMULATION",
        isDemo: true,
      })
    },
    [handleSegment],
  )

  const setRoom = useCallback((next: string) => {
    setRoomState(next.trim() || "hader-default")
  }, [])

  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      captureRef.current?.stop()
      if (levelTimer.current) clearInterval(levelTimer.current)
    }
  }, [])

  return useMemo(
    () => ({
      state,
      asrStatus,
      asrEngineLabel,
      asrDetail,
      source,
      audioLevel,
      segments,
      events,
      pendingAlert,
      peers,
      transport,
      transportState,
      room,
      sessionId,
      startedAt,
      lastError,
      isDemo,
      start,
      stop,
      confirmPresence,
      dismissFalseAlarm,
      snooze,
      injectPhrase,
      setRoom,
      primeAudio,
    }),
    [
      state, asrStatus, asrEngineLabel, asrDetail, source, audioLevel, segments, events,
      pendingAlert, peers, transport, transportState, room, sessionId, startedAt, lastError,
      isDemo, start, stop, confirmPresence, dismissFalseAlarm, snooze, injectPhrase, setRoom, primeAudio,
    ],
  )
}

function cap(list: TranscriptSegment[]): TranscriptSegment[] {
  return list.length > MAX_TRANSCRIPT_SEGMENTS ? list.slice(-MAX_TRANSCRIPT_SEGMENTS) : list
}

async function verifyRemotely(
  event: DetectionEvent,
  context: string,
  profile: NameProfile,
): Promise<{ eventType: DetectionEvent["type"]; calledUser: boolean; confidence: number; requiresAlert: boolean } | null> {
  try {
    const response = await fetch("/api/detect/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phrase: event.phrase,
        aliasMatched: event.aliasMatched,
        priorContext: context,
        userName: profile.fullName || profile.firstName,
      }),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}
