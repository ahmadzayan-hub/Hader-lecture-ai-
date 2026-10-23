"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Gauge,
  History,
  LayoutDashboard,
  Radio,
  Settings,
  Smartphone,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { HaderProvider, useHader } from "@/components/providers/hader-provider"
import { AlertOverlay } from "@/components/live/alert-overlay"
import { STATE_LABELS } from "@/lib/session/machine"

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/live", label: "Live Lecture", icon: Radio },
  { href: "/assistant", label: "Session Assistant", icon: BrainCircuit },
  { href: "/sessions", label: "Sessions", icon: History },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/devices", label: "Devices", icon: Smartphone },
  { href: "/notes", label: "AI Notes", icon: BrainCircuit },
  { href: "/diagnostics", label: "Diagnostics", icon: Gauge },
  { href: "/settings", label: "Settings", icon: Settings },
]

/** Bottom bar for Android/mobile — the five screens that matter on a phone. */
const MOBILE_NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/sessions", label: "History", icon: History },
  { href: "/assistant", label: "Assistant", icon: BrainCircuit },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <HaderProvider>
      <FrameInner>{children}</FrameInner>
    </HaderProvider>
  )
}

function FrameInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session } = useHader()
  const label = STATE_LABELS[session.state]

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border glass px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">
            ح
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-wide">
              HADER<span className="text-primary"> AI</span>
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground" lang="ar" dir="rtl">
              حاضر
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <StatusPill state={label.tone} text={label.en} />
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="size-3.5 text-good" aria-hidden />
            No audio stored
          </span>
        </div>
      </header>

      <div className="flex flex-1">
        <nav aria-label="Main" className="hidden w-56 shrink-0 border-r border-border p-3 lg:block">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 rounded-lg border border-border bg-card/50 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-good">
              <Activity className="size-3.5" aria-hidden />
              Privacy
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Lecture audio is processed for transcription only. No audio or video is saved.
            </p>
          </div>
        </nav>

        {/*
          The mobile tab bar is fixed, so content needs real clearance or the
          last control of a long form sits under it and cannot be tapped.
          Nav rows are min-h-14 (56px) plus the device safe-area inset.
        */}
        <main
          id="main"
          className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border glass pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[10px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <AlertOverlay />
    </div>
  )
}

function StatusPill({ state, text }: { state: "neutral" | "good" | "warn" | "critical"; text: string }) {
  const tone =
    state === "good"
      ? "border-good/40 bg-good/10 text-good"
      : state === "warn"
        ? "border-warn/40 bg-warn/10 text-warn"
        : state === "critical"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-secondary/60 text-muted-foreground"

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold", tone)}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "good"
            ? "bg-good"
            : state === "warn"
              ? "bg-warn"
              : state === "critical"
                ? "bg-destructive"
                : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {text}
    </span>
  )
}
