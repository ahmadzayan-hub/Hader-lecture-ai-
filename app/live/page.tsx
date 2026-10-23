"use client"

/**
 * Live lecture screen — the P0 surface.
 *
 * Everything shown here is derived from live session state. There are no
 * hardcoded percentages or fake "connected" badges: if a value cannot be
 * measured yet it renders as pending, and simulation output is labelled DEMO.
 */

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AudioLines, BellRing, Cpu, Play, Radio, Smartphone, Square, Wifi } from "lucide-react"
import { useHader } from "@/components/providers/hader-provider"
import { usePreflight } from "@/lib/session/use-preflight"
import { PreflightPanel } from "@/components/live/preflight-panel"
import { SourcePicker } from "@/components/live/source-picker"
import { LevelReadout, Waveform } from "@/components/live/waveform"
import { Transcript, TranscriptHeader } from "@/components/live/transcript"
import { EventLog } from "@/components/live/event-log"
import { Button, Card, DemoBadge, Kicker, StatusCard } from "@/components/ui/status"
import { SIMULATION_PHRASES } from "@/lib/defaults"
import type { AudioSource } from "@/lib/types"
import { cn, formatElapsed } from "@/lib/utils"

const ACTIVE_STATES = new Set([
  "LISTENING",
  "MENTION_CANDIDATE",
  "ALERTING",
  "WAITING_CONFIRMATION",
  "CONFIRMED",
  "RECONNECTING",
  "DEGRADED",
])

export default function LivePage() {
  const { session, profile, preferences, lecture, setLecture, needsSetup } = useHader()
  const [source, setSource] = useState<AudioSource>(lecture.preferredSource)
  const [elapsed, setElapsed] = useState(0)

  const running = ACTIVE_STATES.has(session.state)

  const preflight = usePreflight({
    profile,
    audioLevel: session.audioLevel,
    audioActive: running,
    peersOnline: session.peers.filter((p) => p.online).length,
    soundEnabled: preferences.soundEnabled,
    vibrationEnabled: preferences.vibrationEnabled,
  })

  useEffect(() => {
    if (!session.startedAt) {
      setElapsed(0)
      return
    }
    const tick = () => setElapsed(Date.now() - (session.startedAt ?? Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session.startedAt])

  const phrases = useMemo(() => {
    const first = profile.firstName || profile.aliases[0] || "Ahmed"
    const full = profile.fullName || `${first} ${profile.surname}`.trim()
    const firstAr = profile.arabicAliases[0] || "أحمد"
    return SIMULATION_PHRASES.slice(0, 6).map((p) =>
      p.text
        .replace("{first}", first)
        .replace("{full}", full)
        .replace("{fullAr}", firstAr)
        .replace("{firstAr}", firstAr),
    )
  }, [profile])

  const asrTone =
    session.asrStatus === "LISTENING" || session.asrStatus === "CONNECTED"
      ? "good"
      : session.asrStatus === "OFFLINE" || session.asrStatus === "ERROR"
        ? "critical"
        : "warn"

  const onlinePeers = session.peers.filter((p) => p.online)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>Live lecture</Kicker>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {running ? "Listening for your name" : "Ready to monitor"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {lecture.course || "No course set"}
            {lecture.lecturer ? ` · ${lecture.lecturer}` : ""}
            {session.startedAt ? ` · ${formatElapsed(elapsed)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="danger" onClick={session.stop} className="min-w-32">
              <Square className="size-3.5" aria-hidden />
              Stop session
            </Button>
          ) : (
            <Button
              variant="primary"
              className="min-w-32"
              disabled={needsSetup}
              onClick={async () => {
                setLecture({ ...lecture, preferredSource: source })
                await session.start(source)
              }}
            >
              <Play className="size-3.5" aria-hidden />
              Start monitoring
            </Button>
          )}
        </div>
      </header>

      {needsSetup && (
        <Card className="border-warn/40 bg-warn/5">
          <p className="text-xs font-bold text-warn">No name configured</p>
          <p className="mt-1 text-pretty text-[11px] leading-relaxed text-muted-foreground">
            Hader cannot detect anything until you add your name and its spellings.{" "}
            <Link href="/settings" className="font-semibold text-primary underline">
              Open Settings
            </Link>
            .
          </p>
        </Card>
      )}

      {session.lastError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <p className="text-xs font-bold text-destructive">Audio or engine problem</p>
          <p className="mt-1 text-pretty text-[11px] leading-relaxed text-muted-foreground">
            {session.lastError}
          </p>
        </Card>
      )}

      <Card className="border-primary/30"><Link href="/assistant" className="font-bold text-primary underline">Open Session Assistant · مساعد الجلسة</Link><p className="mt-2 text-xs text-muted-foreground">Catch up, find cited evidence, and prepare questions from the transcript. No automatic speaking or sending. Browser speech recognition may use an external service; it is not guaranteed offline. Confirm participants agree before capture.</p></Card>

      {/* Truthful status row. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard
          label="Audio"
          icon={AudioLines}
          tone={running ? (session.audioLevel > 0.02 ? "good" : "warn") : "neutral"}
          pulse={running}
          value={
            running
              ? session.audioLevel > 0.02
                ? "Receiving"
                : "Silent track"
              : "Not capturing"
          }
          detail={
            source === "SYSTEM_AUDIO"
              ? "Teams / system audio"
              : source === "MICROPHONE"
                ? "Room microphone"
                : "Simulated input"
          }
        />
        <StatusCard
          label="Speech engine"
          icon={Cpu}
          tone={asrTone}
          pulse={session.asrStatus === "LISTENING"}
          value={session.asrEngineLabel}
          detail={session.asrDetail}
        />
        <StatusCard
          label="Companion"
          icon={Smartphone}
          tone={onlinePeers.length ? "good" : "neutral"}
          value={onlinePeers.length ? `${onlinePeers.length} online` : "None paired"}
          detail={
            session.transport === "SUPABASE"
              ? "Supabase Realtime"
              : "Local channel — same browser only"
          }
        />
        <StatusCard
          label="Alerts"
          icon={BellRing}
          tone={preferences.soundEnabled ? "good" : "warn"}
          value={preferences.soundEnabled ? "Armed" : "Sound off"}
          detail={`${preferences.sensitivity} sensitivity · escalates to 5 stages`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {/* Monitor */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <Kicker>Monitor</Kicker>
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Wifi className="size-3.5" aria-hidden />
                Level <LevelReadout level={session.audioLevel} active={running} />
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span
                className={cn(
                  "grid size-12 shrink-0 place-items-center rounded-full border",
                  running ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                <Radio className={cn("size-5", running && "animate-breathe")} aria-hidden />
              </span>
              <div className="min-w-0">
                <p
                  className={cn("text-sm font-bold", running ? "text-foreground" : "text-muted-foreground")}
                  aria-live="polite"
                >
                  {running ? "LISTENING FOR YOUR NAME" : "MONITORING STOPPED"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  State {session.state} · {session.isDemo ? "simulated audio" : "live audio"}
                </p>
              </div>
              {session.isDemo && <DemoBadge className="ml-auto" />}
            </div>

            <div className="mt-3">
              <Waveform level={session.audioLevel} active={running} />
            </div>

            {!running && (
              <div className="mt-4">
                <Kicker>Audio source</Kicker>
                <div className="mt-2">
                  <SourcePicker value={source} onChange={setSource} />
                </div>
              </div>
            )}
          </Card>

          {/* Transcript */}
          <Card className="flex min-h-[320px] flex-col">
            <TranscriptHeader
              engineLabel={session.asrEngineLabel}
              count={session.segments.length}
              windowSeconds={preferences.transcriptWindowSeconds}
            />
            <Transcript
              segments={session.segments}
              emptyHint={
                running
                  ? "Waiting for speech. Lines appear as the lecturer talks."
                  : "Start monitoring to see the live transcript. Nothing is recorded to disk."
              }
            />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <PreflightPanel
            checks={preflight.checks}
            overall={preflight.overall}
            running={preflight.running}
            onRerun={preflight.run}
          />

          {/* Simulation harness — always available, always labelled. */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <Kicker>Test the alarm</Kicker>
              <DemoBadge />
            </div>
            <p className="mt-2 text-pretty text-[11px] leading-relaxed text-muted-foreground">
              Injects a phrase straight into the detector, so you can verify the alarm, escalation and
              your phone without waiting for a lecture.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {phrases.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  dir="auto"
                  onClick={() => session.injectPhrase(phrase)}
                  className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-[11px] font-medium hover:bg-secondary"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </Card>

          <EventLog events={session.events} />
        </div>
      </div>
    </div>
  )
}
