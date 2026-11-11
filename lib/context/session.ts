import { z } from "zod"
import type { TranscriptSegment } from "@/lib/types"
import { dirFor } from "@/lib/utils"

export const MAX_IMPORT_BYTES = 2_000_000
export const MAX_SEGMENTS = 10_000
export const contextSegmentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  text: z.string().trim().min(1).max(12_000),
  offsetMs: z.number().int().min(0).max(604_800_000).nullable(),
  source: z.enum(["live", "import", "demo"]),
})
export type ContextSegment = z.infer<typeof contextSegmentSchema>
export const sessionDocumentSchema = z.object({
  format: z.literal("hader-session"),
  version: z.literal(1),
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
  segments: z.array(contextSegmentSchema).min(1).max(MAX_SEGMENTS),
}).superRefine((doc, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_IMPORT_BYTES)
    ctx.addIssue({ code: "custom", message: "Session exceeds the 2 MB portable export limit." })
  if (new Set(doc.segments.map(s => s.id)).size !== doc.segments.length)
    ctx.addIssue({ code: "custom", message: "Duplicate segment IDs are not allowed." })
})
export type SessionDocument = z.infer<typeof sessionDocumentSchema>

export function makeDocument(title: string, segments: ContextSegment[], id = crypto.randomUUID()): SessionDocument {
  return sessionDocumentSchema.parse({ format: "hader-session", version: 1, id,
    title: title.trim() || "Untitled session", createdAt: new Date().toISOString(), segments })
}

export function fromLive(segments: TranscriptSegment[], startedAt: number): ContextSegment[] {
  return segments.filter(s => s.isFinal && s.text.trim()).map(s => ({
    id: s.id, text: s.text.trim(), offsetMs: Math.max(0, s.startedAt - startedAt),
    source: s.isDemo || s.engine === "SIMULATION" ? "demo" : "live",
  }))
}

const TIMESTAMP = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/
function parseTime(value: string): number {
  const m = value.match(TIMESTAMP)
  if (!m || +m[2] > 59 || +m[3] > 59) throw new Error("Invalid subtitle timestamp.")
  return (+m[1] || 0) * 3_600_000 + +m[2] * 60_000 + +m[3] * 1000 + +m[4]
}

/** Local file parsing only. Text without timestamps stays explicitly untimed. */
export function importTranscript(raw: string, filename = "transcript.txt"): SessionDocument {
  if (new TextEncoder().encode(raw).length > MAX_IMPORT_BYTES) throw new Error("File exceeds the 2 MB limit.")
  if (filename.toLowerCase().endsWith(".json")) return sessionDocumentSchema.parse(JSON.parse(raw))
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim()
  if (!normalized) throw new Error("No transcript text found.")
  const timed = /\.(srt|vtt)$/i.test(filename) || normalized.startsWith("WEBVTT")
  let segments: ContextSegment[]
  if (timed) {
    segments = normalized.split(/\n\s*\n/).flatMap(block => {
      const lines = block.split("\n")
      if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) return []
      const index = lines.findIndex(l => l.includes("-->"))
      if (index < 0) throw new Error("Subtitle cue is missing its timestamp.")
      const [start, end] = lines[index].split("-->").map(s => s.trim().split(/\s+/)[0])
      const offsetMs = parseTime(start)
      if (parseTime(end) < offsetMs) throw new Error("Subtitle end precedes its start.")
      const text = lines.slice(index + 1).join(" ").replace(/<[^>]*>/g, "").trim()
      return text ? [{ id: "", text, offsetMs, source: "import" as const }] : []
    }).map((s, i) => ({ ...s, id: `s${i + 1}` }))
  } else {
    segments = normalized.split(/\n+/).filter(Boolean).map((text, i) => ({
      id: `s${i + 1}`, text: text.trim(), offsetMs: null, source: "import",
    }))
  }
  if (!segments.length) throw new Error("No transcript cues found.")
  return makeDocument(filename.replace(/\.[^.]+$/, ""), segments)
}

export function formatOffset(ms: number | null): string {
  if (ms === null) return "Untimed"
  const total = Math.floor(ms / 1000)
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(n => String(n).padStart(2, "0")).join(":")
}

export function exportText(doc: SessionDocument): string {
  return `${doc.title}\nHader transcript. Imported speech may contain errors.\n\n` + doc.segments.map(s =>
    `[${formatOffset(s.offsetMs)}] [${s.id}]${s.source === "demo" ? " [DEMO]" : ""} ${s.text}`).join("\n")
}

function pad(n: number, w = 2): string { return String(n).padStart(w, "0") }
/** ms -> SRT timestamp 00:00:00,000. Untimed segments get a synthetic 3s cue starting where the prior cue ended. */
function srtTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const msr = Math.floor(ms % 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msr, 3)}`
}
function vttTime(ms: number): string { return srtTime(ms).replace(",", ".") }
/** Real offsets are kept; a null offset (untimed/pasted text) falls back to a synthetic 3s cue in sequence. */
function cueTimes(doc: SessionDocument): Array<{ start: number; end: number }> {
  let synthetic = 0
  return doc.segments.map((s, i) => {
    const start = s.offsetMs ?? synthetic
    const next = doc.segments[i + 1]?.offsetMs
    const end = next !== undefined && next !== null && next > start ? next : start + 3000
    synthetic = start + 3000
    return { start, end }
  })
}

export function exportSRT(doc: SessionDocument): string {
  const times = cueTimes(doc)
  return doc.segments.map((s, i) =>
    `${i + 1}\n${srtTime(times[i].start)} --> ${srtTime(times[i].end)}\n${s.text}\n`).join("\n")
}

export function exportVTT(doc: SessionDocument): string {
  const times = cueTimes(doc)
  return "WEBVTT\n\n" + doc.segments.map((s, i) =>
    `${vttTime(times[i].start)} --> ${vttTime(times[i].end)}\n${s.text}\n`).join("\n")
}

export function exportMarkdown(doc: SessionDocument): string {
  let md = `# ${doc.title}\n\nHader transcript. Imported speech may contain errors.\n\n`
  md += doc.segments.map(s =>
    `- **[${formatOffset(s.offsetMs)}]**${s.source === "demo" ? " *(demo)*" : ""} ${s.text}`).join("\n")
  return md + "\n"
}

function escapeHTML(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/** A styled, print-ready HTML document for the browser's own print-to-PDF. No PDF library; the browser renders it. */
export function exportPrintableHTML(doc: SessionDocument): string {
  const title = escapeHTML(doc.title)
  const lines = doc.segments.map(s =>
    `<p dir="${dirFor(s.text)}"><span class="ts">[${formatOffset(s.offsetMs)}]</span>${s.source === "demo" ? ' <span class="demo">DEMO</span>' : ""} ${escapeHTML(s.text)}</p>`).join("\n")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:32px;line-height:1.7;color:#111;max-width:860px;margin:0 auto}
  h1{font-size:22px}
  p{margin:6px 0} .ts{color:#666;font-size:0.85em;margin-inline-end:6px} .demo{color:#8b5cf6;font-size:0.8em;font-weight:bold}
  .notice{color:#666;font-size:0.85em;margin-bottom:16px}
  button{margin-top:24px;padding:8px 16px}
  @media print{ button{display:none} }
</style></head><body>
<h1>${title}</h1>
<p class="notice">Hader transcript. Imported speech may contain errors.</p>
${lines}
<button onclick="window.print()">Print / Save as PDF</button>
</body></html>`
}

export const LIBRARY_KEY = "hader.context-library.v1"
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readLibrary(storage: StorageLike): SessionDocument[] {
  const raw = storage.getItem(LIBRARY_KEY)
  if (!raw) return []
  return z.array(sessionDocumentSchema).max(30).parse(JSON.parse(raw))
}
export function storeDocument(storage: StorageLike, doc: SessionDocument): SessionDocument[] {
  const valid = sessionDocumentSchema.parse(doc)
  const all = readLibrary(storage)
  const next = [valid, ...all.filter(s => s.id !== valid.id)]
  if (next.length > 30) throw new Error("Library is full (30 sessions). Export and remove a session first.")
  // Never erase old data or report success if quota/private-mode prevents writing.
  storage.setItem(LIBRARY_KEY, JSON.stringify(next))
  return next
}
