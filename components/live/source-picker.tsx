"use client"

/**
 * Audio source selection.
 *
 * Each option states exactly what the browser will ask for, because a user who
 * picks "System audio" and forgets the "Share system audio" checkbox gets a
 * video-only stream and silent failure. We name that trap up front.
 */

import { Cpu, Mic, MonitorSpeaker } from "lucide-react"
import type { AudioSource } from "@/lib/types"
import { cn } from "@/lib/utils"

const SOURCES: {
  id: AudioSource
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    id: "SYSTEM_AUDIO",
    label: "System audio",
    hint: "Choose a tab or screen that offers audio sharing. Some browsers, apps and phones provide no audio track. Video is dropped; real transcription needs an enabled engine.",
    icon: MonitorSpeaker,
  },
  {
    id: "MICROPHONE",
    label: "Microphone",
    hint: "Captures room sound, not another app’s internal audio. Browser recognition may use an external service. Obtain participant consent first.",
    icon: Mic,
  },
  {
    id: "SIMULATION",
    label: "Simulation",
    hint: "Scripted phrases for testing the alarm without a lecture. Output is labelled DEMO.",
    icon: Cpu,
  },
]

export function SourcePicker({
  value,
  onChange,
  disabled,
}: {
  value: AudioSource
  onChange(next: AudioSource): void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-60">
      <legend className="sr-only">Audio source</legend>
      {SOURCES.map((source) => {
        const active = value === source.id
        return (
          <label
            key={source.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
              disabled && "cursor-not-allowed",
            )}
          >
            <input
              type="radio"
              name="audio-source"
              value={source.id}
              checked={active}
              onChange={() => onChange(source.id)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-xs font-bold">
                <source.icon className="size-3.5" aria-hidden />
                {source.label}
              </span>
              <span className="mt-1 block text-pretty text-[11px] leading-relaxed text-muted-foreground">
                {source.hint}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
