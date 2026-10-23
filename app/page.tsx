"use client"

import Link from "next/link"
import { ArrowRight, BellRing, Cpu, Mic, Radio, ShieldCheck, Smartphone, TimerReset } from "lucide-react"
import { useHader } from "@/components/providers/hader-provider"
import { usePreflight } from "@/lib/session/use-preflight"
import { useHistory } from "@/lib/history"
import { Button, Card, DemoBadge, Kicker, StatusCard } from "@/components/ui/status"
import { cn, formatClock } from "@/lib/utils"

export default function HomePage() {
  const { session, profile, preferences, lecture, needsSetup, hydrated } = useHader()
  const history = useHistory()

  const preflight = usePreflight({
    profile,
    audioLevel: session.audioLevel,
    audioActive: false,
    peersOnline: session.peers.filter((p) => p.online).length,
    soundEnabled: preferences.soundEnabled,
    vibrationEnabled: preferences.vibrationEnabled,
  })

  const last = history.sessions[0]
  const displayName = profile.fullName || profile.firstName || "your name"
  const asrHealthy = preflight.health?.services.asr.status === "healthy"
  const llmHealthy = preflight.health?.services.llm.status === "healthy"
  const onlinePeers = session.peers.filter((p) => p.online).length

  return (
    <div className="flex flex-col gap-4">
      <header>
        <Kicker>Home</Kicker>
        <h1 className="mt-1 text-balance text-2xl font-bold tracking-tight">
          Follow the session. Understand what matters.
        </h1>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
          Hader listens to the lecture, detects <span className="font-semibold text-foreground">{displayName}</span>,
          and escalates the alarm across your devices until you respond. It never answers for you.
        </p>
      </header>

      <Card className="border-primary/30"><Link href="/assistant" className="text-sm font-bold text-primary underline">Open the local-first Session Assistant</Link><p className="mt-2 text-xs text-muted-foreground">Import a transcript, catch up, inspect evidence, prepare questions and export a portable session. No API key or name setup required.</p></Card>

      {/* Primary CTA */}
      <Card className="border-primary/30 bg-primary/5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <Radio className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {needsSetup ? "Add your name to begin" : "Start lecture mode"}
            </p>
            <p className="text-pretty text-[11px] leading-relaxed text-muted-foreground">
              {needsSetup
                ? "Detection is impossible until at least one name form is configured."
                : `Preflight is ${preflight.overall.toLowerCase()} · ${lecture.course || "no course set"}`}
            </p>
          </div>
          <Link href={needsSetup ? "/settings" : "/live"} className="w-full sm:w-auto">
            <Button variant="primary" className="w-full sm:w-auto">
              {needsSetup ? "Configure name" : "Start lecture mode"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </Link>
        </div>
      </Card>

      {/* Readiness — all probed, none hardcoded. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard
          label="Audio"
          icon={Mic}
          tone={preflight.checks.find((c) => c.id === "audioPermission")?.status === "pass" ? "good" : "warn"}
          value={
            preflight.checks.find((c) => c.id === "audioPermission")?.status === "pass"
              ? "Permission ready"
              : "Needs permission"
          }
          detail="Granted when the session starts"
        />
        <StatusCard
          label="AI engine"
          icon={Cpu}
          tone={asrHealthy ? "good" : "warn"}
          value={asrHealthy ? "Qwen ready" : "Fallback only"}
          detail={preflight.health?.services.asr.detail ?? "Checking…"}
        />
        <StatusCard
          label="Companion"
          icon={Smartphone}
          tone={onlinePeers ? "good" : "neutral"}
          value={onlinePeers ? `${onlinePeers} online` : "Not paired"}
          detail={session.transport === "SUPABASE" ? "Cross-device ready" : "Local channel only"}
        />
        <StatusCard
          label="Alarm"
          icon={BellRing}
          tone={preferences.soundEnabled ? "good" : "warn"}
          value={preferences.soundEnabled ? "Armed" : "Muted"}
          detail={`${preferences.sensitivity} sensitivity`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lifetime stats — real, from stored sessions. */}
        <Card>
          <Kicker>Your record</Kicker>
          {!hydrated ? (
            <p className="mt-3 text-[11px] text-muted-foreground">Loading…</p>
          ) : history.sessions.length === 0 ? (
            <p className="mt-3 text-pretty text-[11px] leading-relaxed text-muted-foreground">
              No sessions yet. Run one lecture — or a simulation from the Live screen — and your
              confirmed calls, false alarms and average response time appear here.
            </p>
          ) : (
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Confirmed</dt>
                <dd className="nums mt-1 text-xl font-bold text-good">{history.stats.confirmed}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">False alarms</dt>
                <dd className="nums mt-1 text-xl font-bold text-warn">{history.stats.falseAlarms}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg response</dt>
                <dd className="nums mt-1 text-xl font-bold">
                  {history.stats.avgConfirmationMs !== null
                    ? `${(history.stats.avgConfirmationMs / 1000).toFixed(1)}s`
                    : "—"}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        {/* Last session */}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Kicker>Last session</Kicker>
            {last?.isDemo && <DemoBadge />}
          </div>
          {!last ? (
            <p className="mt-3 text-[11px] text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <>
              <p className="mt-2 truncate text-sm font-bold">{last.course}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatClock(last.startedAt)} · {Math.round(last.durationMs / 60000)} min ·{" "}
                {last.totalDetections} detection{last.totalDetections === 1 ? "" : "s"}
              </p>
              <Link
                href="/sessions"
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
              >
                View history
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </>
          )}
        </Card>
      </div>

      {/* Honest capability + privacy note */}
      <Card className="border-border">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
          <div>
            <p className="text-xs font-bold">What Hader will and will not do</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-pretty text-[11px] leading-relaxed text-muted-foreground">
              <li>Alerts you and escalates to your phone until you acknowledge.</li>
              <li>Prepares a reply for you to copy — you send it yourself in Teams.</li>
              <li>Never unmutes, never speaks, never marks you present automatically.</li>
              <li>No lecture audio or video is stored. Transcripts stay in memory by default.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Quick setup path */}
      <Card>
        <Kicker>First run</Kicker>
        <ol className="mt-3 flex flex-col gap-2 text-[11px] leading-relaxed">
          {[
            { label: "Add your name and its Arabic and English spellings", href: "/settings" },
            { label: "Check the speech engine and alarm", href: "/live" },
            { label: "Pair your phone as an alert companion", href: "/devices" },
            { label: "Share Teams audio and start monitoring", href: "/live" },
          ].map((step, index) => (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "nums grid size-6 shrink-0 place-items-center rounded-full border border-border text-[10px] font-bold",
                  index === 0 && needsSetup && "border-warn text-warn",
                )}
              >
                {index + 1}
              </span>
              <Link href={step.href} className="flex-1 hover:text-primary">
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      {llmHealthy ? null : (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <TimerReset className="size-3.5" aria-hidden />
          Semantic verification is offline, so borderline matches are judged by the local detector only.
        </p>
      )}
    </div>
  )
}
