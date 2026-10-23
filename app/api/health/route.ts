import type { HealthReport, HealthState } from "@/lib/types"
import { noStore } from "@/lib/server/api"
import { readQwenConfig } from "@/lib/server/qwen"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function worst(states: HealthState[]): HealthState {
  if (states.includes("down")) return "down"
  if (states.includes("degraded")) return "degraded"
  return "healthy"
}

/**
 * Reports real service state. Never exposes secrets — only presence booleans.
 */
export async function GET() {
  const qwen = readQwenConfig()

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  const pushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  )


  const services: HealthReport["services"] = {
    app: { status: "healthy", detail: "Application running" },
    database: supabaseConfigured
      ? { status: "healthy", detail: "Supabase configured" }
      : { status: "degraded", detail: "Supabase not configured — local session storage only" },
    realtime: supabaseConfigured
      ? { status: "healthy", detail: "Supabase Realtime available" }
      : { status: "degraded", detail: "Cross-device sync unavailable without Supabase" },
    asr: qwen.ok
      ? { status: "degraded", detail: `Configured model ${qwen.config.asrModel}; availability and transcription not verified` }
      : { status: "degraded", detail: "Paid transcription disabled or configuration incomplete. Use import or explicitly selected browser recognition." },
    llm: { status: "degraded", detail: qwen.ok
      ? `Configured model ${qwen.config.textModel}; use explicit provider test to verify access (may cost usage)`
      : "Paid provider disabled or configuration incomplete; local evidence tools available" },
    push: pushConfigured
      ? { status: "healthy", detail: "Web Push keys configured" }
      : { status: "degraded", detail: "VAPID keys missing — in-app alerts only" },
    auth: supabaseConfigured
      ? { status: "healthy", detail: "Supabase Auth available" }
      : { status: "degraded", detail: "Demo mode only" },
  }

  const report: HealthReport = {
    status: worst(Object.values(services).map((s) => s.status)),
    checkedAt: new Date().toISOString(),
    services,
  }

  return noStore(report, report.status === "down" ? 503 : 200)
}
