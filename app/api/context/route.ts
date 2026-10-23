import "server-only"
import { contextRequestSchema } from "@/lib/context/assistant"
import { askLocalModel, isLocalRequest, localModelEnabled, localModelHealth } from "@/lib/context/local-model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 40
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}
export async function GET(request: Request) {
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  const enabled = loopback && localModelEnabled(process.env)
  const available = enabled && await localModelHealth()
  return json({ available, provider: available ? "llama.cpp (local)" : "Browser evidence lookup",
    detail: available ? "Local model responded. Generation still requires review."
      : "No model connected. Browser evidence lookup works without API calls. Local inference requires Hader and llama.cpp on the same computer, not Vercel." })
}
export async function POST(request: Request) {
  if (!localModelEnabled(process.env) || !isLocalRequest(request))
    return json({ error: "Local AI is disabled or this is not a same-origin local installation." }, 403)
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON required." }, 415)
  let raw: string
  try { raw = await request.text() } catch { return json({ error: "Invalid body." }, 400) }
  if (new TextEncoder().encode(raw).length > 100_000) return json({ error: "Context exceeds 100 KB." }, 413)
  try {
    const parsed = contextRequestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return json({ error: "Invalid or oversized context." }, 422)
    return json(await askLocalModel(parsed.data.question, parsed.data.segments))
  } catch { return json({ error: "Invalid JSON." }, 400) }
}
