"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { BrainCircuit, Download, Save, Upload } from "lucide-react"
import { useHader } from "@/components/providers/hader-provider"
import { Button, Card, DemoBadge, Kicker } from "@/components/ui/status"
import { answerExtractively, catchUp, findEvidence, proposedQuestions, reviewCandidates, type Citation, type ContextAnswer } from "@/lib/context/assistant"
import { exportText, formatOffset, fromLive, importTranscript, makeDocument, MAX_IMPORT_BYTES, readLibrary, storeDocument, LIBRARY_KEY, type SessionDocument } from "@/lib/context/session"

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AssistantPage() {
  const { session, lecture } = useHader()
  const [imported, setImported] = useState<SessionDocument | null>(null)
  const [library, setLibrary] = useState<SessionDocument[]>([])
  const [pasted, setPasted] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<ContextAnswer | null>(null)
  const requestSeq = useRef(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [provider, setProvider] = useState({ available: false, detail: "Browser evidence lookup. No paid AI requests." })
  const [useModel, setUseModel] = useState(false)
  const [since, setSince] = useState("5")
  const [catchup, setCatchup] = useState<Citation[] | null>(null)
  const [filter, setFilter] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const live = useMemo(() => fromLive(session.segments, session.startedAt ?? Date.now()), [session.segments, session.startedAt])
  const segments = imported?.segments ?? live
  const title = imported?.title ?? (lecture.course || "Live session")
  const candidates = useMemo(() => reviewCandidates(segments), [segments])
  const suggestions = useMemo(() => proposedQuestions(segments), [segments])
  const selected = segments.find(s => s.id === selectedId)
  const shown = segments.filter(s => !filter || s.text.toLowerCase().includes(filter.toLowerCase())).slice(-100)
  const hasDemo = segments.some(s => s.source === "demo")

  useEffect(() => {
    try { setLibrary(readLibrary(localStorage)) }
    catch { setMessage("Saved library could not be read. Existing data was not overwritten. Export or recover your browser data before saving.") }
    void fetch("/api/context", { cache: "no-store" }).then(r => r.json()).then(setProvider).catch(() => {})
  }, [])
  useEffect(() => { requestSeq.current += 1; setBusy(false); setAnswer(null); setCatchup(null); setSelectedId("") }, [imported?.id, session.sessionId])

  function currentDocument() {
    return imported ?? makeDocument(title, segments, session.sessionId ?? undefined)
  }
  function save() {
    try {
      setLibrary(storeDocument(localStorage, currentDocument()))
      setMessage("Saved on this browser only. Export a backup before clearing browser data or changing devices.")
    } catch { setMessage("Not saved: storage is unavailable, full, or contains invalid data. Export JSON to keep a copy. No existing session was deleted.") }
  }
  function loadText(raw: string, name: string) {
    try {
      const doc = importTranscript(raw, name)
      setImported(doc); setMessage("Loaded locally, not uploaded. Save to this browser or export to retain it.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this file.") }
  }
  async function ask() {
    const seq = ++requestSeq.current
    const evidence = findEvidence(segments, question, 12)
    const local = answerExtractively(segments, question)
    setAnswer(local)
    if (!useModel || !provider.available) return
    // Local model receives only a bounded selection. It cannot inspect the full session or tools.
    const context = (evidence.length ? evidence : segments.slice(-12)).filter(s => s.text.length <= 4000)
    const bounded = context.reduce<typeof context>((out, s) => out.reduce((n, v) => n + v.text.length, 0) + s.text.length <= 24_000 ? [...out, s] : out, [])
    if (!bounded.length) return
    setBusy(true)
    try {
      const response = await fetch("/api/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, segments: bounded }), signal: AbortSignal.timeout(35_000) })
      if (!response.ok) throw new Error("Local model unavailable")
      const result = await response.json() as ContextAnswer
      if (seq === requestSeq.current) setAnswer(result)
    } catch { if (seq === requestSeq.current) setAnswer({ ...local, warning: "Local AI did not respond. Showing exact transcript evidence instead." }) }
    finally { if (seq === requestSeq.current) setBusy(false) }
  }
  function jump(id: string) {
    setSelectedId(id)
    setTimeout(() => document.getElementById("source-evidence")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0)
  }
  function exportFile(json: boolean) {
    try {
      const doc = currentDocument()
      download(`hader-session-${Date.now()}.${json ? "json" : "txt"}`, json ? JSON.stringify(doc) : exportText(doc), json ? "application/json" : "text/plain;charset=utf-8")
      setMessage("Export prepared. The file contains transcript text; share only with the intended recipient.")
    } catch { setMessage("No valid session to export yet.") }
  }

  return <div className="flex flex-col gap-4">
    <header className="flex items-center gap-4">
      <Image src="/hader-context-accent.webp" width={120} height={80} alt="" className="hidden rounded-xl sm:block" />
      <div>
      <Kicker>Session assistant · مساعد الجلسة</Kicker>
      <h1 className="mt-1 text-2xl font-bold">Understand, catch up, participate</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ask about what was said, review evidence, and prepare your own reply. Nothing is spoken, posted, or sent to a meeting automatically.</p>
      </div>
    </header>
    <Card className="border-primary/30 bg-primary/5">
      <p className="flex items-center gap-2 text-sm font-bold"><BrainCircuit className="size-4" /> Browser evidence workspace {hasDemo && <DemoBadge />}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{provider.detail}</p>
      <p className="mt-2 text-xs text-muted-foreground">Use a transcript you have permission to process. Imports and evidence lookup stay in this browser. Saving is explicit, unencrypted and device-local. This is context retrieval, not model training.</p>
      {provider.available && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={useModel} onChange={e => setUseModel(e.target.checked)} /> Use the local model for draft answers. Selected text goes only to the local Hader server.</label>}
    </Card>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="flex flex-wrap justify-between gap-3"><div><Kicker>Current context</Kicker><h2 className="mt-1 font-bold">{title}</h2><p className="text-xs text-muted-foreground">{segments.length} final segments · {imported ? "Imported / saved session" : "Live session context"}</p></div><Link href="/live" className="text-sm text-primary underline">Open live capture</Link></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!segments.length} onClick={save}><Save className="size-4" /> Save session</Button>
            <Button disabled={!segments.length} onClick={() => exportFile(true)}><Download className="size-4" /> JSON backup / Maktab</Button>
            <Button disabled={!segments.length} onClick={() => exportFile(false)}>Text export</Button>
            {imported && <Button onClick={() => setImported(null)}>Use live context</Button>}
          </div>
          {session.segments.length >= 10_000 && !imported && <p className="mt-2 text-xs text-warn">Live context reached its 10,000-segment limit. Earlier lines may be missing. Export now and start a new session.</p>}
          {message && <p role="status" className="mt-3 text-sm text-warn">{message}</p>}
        </Card>
        <Card>
          <h2 className="font-bold">Ask the session · اسأل عن الجلسة</h2>
          <p className="mt-1 text-xs text-muted-foreground">Without a model, this finds matching excerpts, not semantic answers. No evidence means no invented answer.</p>
          <label htmlFor="session-question" className="mt-3 block text-xs">Your question</label>
          <textarea id="session-question" dir="auto" className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm" maxLength={1000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="When is the assignment due? / ما موعد تسليم الواجب؟" />
          <Button className="mt-2" variant="primary" onClick={ask} disabled={!segments.length || question.trim().length < 2 || busy}>{busy ? "Preparing local draft…" : useModel && provider.available ? "Draft answer with local AI" : "Find evidence"}</Button>
          {answer && <div className="mt-4 rounded-lg border border-border p-3" aria-live="polite"><p className="text-xs font-bold text-primary">{answer.mode === "local-model" ? "LOCAL AI DRAFT · REVIEW REQUIRED" : "EXACT EVIDENCE · NO GENERATIVE MODEL"}</p><p dir="auto" className="mt-2 whitespace-pre-wrap text-sm">{answer.text}</p>{answer.warning && <p className="mt-2 text-xs text-warn">{answer.warning}</p>}<Evidence items={answer.citations} onSelect={jump} /></div>}
        </Card>
        <Card>
          <h2 className="font-bold">What did I miss? · ماذا فاتني؟</h2>
          <div className="mt-3 flex flex-wrap gap-2"><label className="text-sm">Window <select aria-label="Catch-up window" className="ml-2 rounded border border-border bg-background p-2" value={since} onChange={e => setSince(e.target.value)}><option value="2">Last 2 minutes</option><option value="5">Last 5 minutes</option><option value="all">Last 12 excerpts</option></select></label><Button disabled={!segments.length} onClick={() => {
            const latest = Math.max(0, ...segments.map(s => s.offsetMs ?? 0))
            setCatchup(catchUp(segments, since === "all" ? null : Math.max(0, latest - Number(since) * 60_000)))
          }}>Catch me up</Button></div>
          <p className="mt-2 text-xs text-muted-foreground">Up to 12 exact excerpts ending at the latest captured timestamp, not a complete summary. Untimed imports require “Last 12 excerpts”.</p>
          {catchup && <><Evidence items={catchup} onSelect={jump} />{!catchup.length && <p className="mt-2 text-sm">No timestamped evidence in this window.</p>}</>}
        </Card>
        <Card>
          <h2 className="font-bold">Transcript evidence</h2>
          {selected && <div id="source-evidence" tabIndex={-1} className="mt-3 rounded-lg border border-primary bg-primary/5 p-3"><p className="text-xs text-primary">Source [{selected.id}] · {formatOffset(selected.offsetMs)} · {selected.source}</p><p className="mt-2 whitespace-pre-wrap text-sm" dir="auto">{selected.text}</p></div>}
          <input aria-label="Search transcript" placeholder="Search transcript / ابحث في النص" className="mt-3 w-full rounded border border-border bg-background p-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)} />
          <p className="mt-2 text-xs text-muted-foreground">Showing the latest {shown.length} matching lines. Export includes all {segments.length} retained lines. Timestamps are capture/subtitle times, not verified speaker timing.</p>
          <div className="mt-2 max-h-96 overflow-auto"><Evidence items={shown.map(s => ({ segmentId: s.id, quote: s.text, offsetMs: s.offsetMs }))} onSelect={jump} /></div>
        </Card>
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <Card><h2 className="font-bold">Import or paste</h2><p className="mt-1 text-xs text-muted-foreground">TXT, SRT, VTT or Hader JSON, up to 2 MB. No audio upload. No network transcription.</p><label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-primary"><Upload className="size-4" /> Choose transcript<input aria-label="Import transcript file" type="file" accept=".txt,.srt,.vtt,.json" className="mt-2 w-full text-xs" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > MAX_IMPORT_BYTES) { setMessage("File exceeds the 2 MB limit."); return }; try { loadText(await file.text(), file.name) } catch { setMessage("Could not read this file.") }; e.target.value = "" }} /></label><textarea aria-label="Paste transcript" dir="auto" className="mt-3 min-h-32 w-full rounded border border-border bg-background p-2 text-sm" maxLength={500_000} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste transcript here. One paragraph per segment." /><Button className="mt-2" disabled={!pasted.trim()} onClick={() => loadText(pasted, "Pasted session.txt")}>Use pasted transcript</Button></Card>
        <Card><h2 className="font-bold">Saved on this browser</h2>{!library.length && <p className="mt-2 text-xs text-muted-foreground">No saved transcript sessions yet. Existing alert history remains under Sessions.</p>}<ul className="mt-2 flex flex-col gap-2">{library.map(doc => <li key={doc.id} className="rounded border border-border p-2"><button className="w-full text-left text-sm text-primary" onClick={() => { setImported(doc); setMessage("Opened saved session.") }}>{doc.title}</button><p className="text-xs text-muted-foreground">{doc.segments.length} lines · {new Date(doc.createdAt).toLocaleDateString()}</p><button className="mt-2 text-xs text-destructive" onClick={() => {
          if (!window.confirm("Remove this saved transcript from this browser? Export a backup first. This cannot be undone.")) return
          try { const next = library.filter(s => s.id !== doc.id); localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); setLibrary(next); setMessage("Removed the saved copy. An open session remains available until you leave.") } catch { setMessage("Could not remove the saved session.") }
        }}>Remove saved copy</button></li>)}</ul></Card>
        <Card><h2 className="font-bold">Possible actions / decisions</h2><p className="mt-1 text-xs text-muted-foreground">Keyword candidates, not confirmed commitments. Check owner, deadline, negation and later corrections in the transcript.</p><h3 className="mt-3 text-xs font-bold">Action candidates</h3><Evidence items={candidates.actions} onSelect={jump} /><h3 className="mt-3 text-xs font-bold">Decision candidates</h3><Evidence items={candidates.decisions} onSelect={jump} /></Card>
        <Card><h2 className="font-bold">Questions you could ask</h2><p className="mt-1 text-xs text-muted-foreground">Suggested templates, not statements from the meeting. Review and ask yourself. No automatic speaking or sending.</p><ul className="mt-3 space-y-3">{suggestions.map((s, i) => <li key={i} className="rounded border border-border p-2"><p dir="auto" className="text-sm">{s.text}</p><button className="mt-2 text-xs text-primary underline" onClick={() => jump(s.citation.segmentId)}>Context [{s.citation.segmentId}]</button></li>)}</ul></Card>
      </aside>
    </div>
  </div>
}
function Evidence({ items, onSelect }: { items: Citation[]; onSelect(id: string): void }) {
  return <ul className="mt-2 space-y-2">{items.map((c, i) => <li key={`${c.segmentId}-${i}`} className="rounded border border-border/60 p-2"><button className="text-xs text-primary underline" onClick={() => onSelect(c.segmentId)}>[{c.segmentId}] · {formatOffset(c.offsetMs)}</button><p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm">{c.quote}</p></li>)}</ul>
}
