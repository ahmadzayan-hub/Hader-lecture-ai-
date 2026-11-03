#!/usr/bin/env node
/**
 * Reproducible transcription accuracy benchmark.
 *
 *   pnpm asr:benchmark
 *   pnpm asr:benchmark -- --manifest path/to/manifest.json --json report.json
 *
 * Reads a manifest of reference/hypothesis pairs, scores each hypothesis with
 * lib/asr/accuracy.ts and prints per-case and per-engine tables. It performs
 * no audio capture and no provider call: hypotheses must already be in the
 * manifest. Synthetic-only runs are labelled as such in the output.
 *
 * Runs on Node 22.18+/24 through built-in type stripping; no build step.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { assertManifest, runBenchmark } from "../lib/asr/accuracy.ts"
import type { BenchmarkResult } from "../lib/asr/accuracy.ts"

type Options = { manifest: string; json?: string; maxWer?: number }

function parseArgs(argv: string[]): Options {
  const options: Options = { manifest: "tests/fixtures/asr-benchmark/manifest.json" }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue // pnpm forwards the separator literally
    if (arg === "--manifest") options.manifest = argv[++i] ?? options.manifest
    else if (arg === "--json") options.json = argv[++i]
    else if (arg === "--max-wer") options.maxWer = Number(argv[++i])
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: asr-benchmark [--manifest file] [--json out.json] [--max-wer 0.25]")
      process.exit(0)
    } else {
      console.error(`unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return options
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width)
}

function printTables(result: BenchmarkResult): void {
  console.log("\nPer hypothesis")
  console.log(`${pad("case", 26)}${pad("lang", 7)}${pad("source", 11)}${pad("engine", 22)}${pad("WER", 9)}${pad("CER", 9)}${pad("S/D/I", 10)}names  numbers`)
  for (const row of result.rows) {
    const r = row.report
    console.log(
      `${pad(row.caseId, 26)}${pad(row.language, 7)}${pad(row.source, 11)}${pad(row.engine, 22)}${pad(pct(r.wer), 9)}${pad(pct(r.cer), 9)}` +
        `${pad(`${r.words.substitutions}/${r.words.deletions}/${r.words.insertions}`, 10)}${pad(r.missedNames.length, 7)}${r.missedNumbers.length}`,
    )
    for (const name of r.missedNames) console.log(`    missed name:   ${name}`)
    for (const num of r.missedNumbers) console.log(`    missed number: ${num}`)
  }
  console.log("\nPer engine (micro-averaged)")
  console.log(`${pad("engine", 22)}${pad("cases", 7)}${pad("WER", 9)}${pad("CER", 9)}${pad("names", 7)}${pad("numbers", 9)}evidence`)
  for (const s of result.summaries) {
    console.log(
      `${pad(s.engine, 22)}${pad(s.cases, 7)}${pad(pct(s.wer), 9)}${pad(pct(s.cer), 9)}${pad(s.missedNames, 7)}${pad(s.missedNumbers, 9)}` +
        (s.syntheticOnly ? "SYNTHETIC ONLY - not real accuracy" : "includes consented cases"),
    )
  }
}

const options = parseArgs(process.argv.slice(2))
const manifestPath = resolve(options.manifest)
const manifest = assertManifest(JSON.parse(readFileSync(manifestPath, "utf8")))
const result = runBenchmark(manifest)

console.log(`Manifest: ${manifestPath}`)
console.log(`Cases: ${manifest.cases.length}, hypotheses: ${result.rows.length}`)
console.log(`Disclaimer: ${manifest.disclaimer}`)
printTables(result)

if (options.json) {
  const out = {
    generatedAt: new Date().toISOString(),
    manifest: manifestPath,
    disclaimer: manifest.disclaimer,
    syntheticOnly: result.summaries.every((s) => s.syntheticOnly),
    ...result,
  }
  const outPath = resolve(options.json)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
  console.log(`\nReport written to ${outPath}`)
}

if (options.maxWer !== undefined && Number.isFinite(options.maxWer)) {
  const failing = result.rows.filter((row) => row.report.wer > options.maxWer!)
  if (failing.length > 0) {
    console.error(`\n${failing.length} hypothesis row(s) exceed --max-wer ${options.maxWer}:`)
    for (const row of failing) console.error(`  ${row.caseId} / ${row.engine}: ${pct(row.report.wer)}`)
    process.exit(1)
  }
}
