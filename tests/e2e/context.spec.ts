import { test, expect } from "@playwright/test"
import { readFile } from "node:fs/promises"

test("import, evidence, save, refresh and portable restore without paid calls", async ({ page }) => {
  const posted: string[] = []
  const errors: string[] = []
  page.on("request", r => { if (r.method() === "POST") posted.push(r.url()) })
  page.on("pageerror", e => errors.push(e.message))
  await page.goto("/assistant")
  await expect(page.getByRole("heading", { name: "Understand, catch up, participate" })).toBeVisible()
  await page.getByLabel("Import transcript file").setInputFiles("tests/fixtures/context-session.vtt")
  await expect(page.getByText("4 final segments")).toBeVisible()
  await page.getByLabel("Your question").fill("When is the assignment due?")
  await page.getByRole("button", { name: "Find evidence", exact: true }).click()
  await expect(page.getByText("EXACT EVIDENCE · NO GENERATIVE MODEL")).toBeVisible()
  await page.getByRole("button", { name: "[s2] · 00:00:10", exact: true }).first().click()
  await expect(page.locator("#source-evidence")).toContainText("assignment is due Sunday")
  await page.getByLabel("Your question").fill("What is the weather in Tokyo?")
  await page.getByRole("button", { name: "Find evidence", exact: true }).click()
  await expect(page.getByText(/Not enough matching evidence/)).toBeVisible()
  await page.getByRole("button", { name: "Catch me up", exact: true }).click()
  await page.getByRole("button", { name: "Save session", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Saved on this browser only" })).toBeVisible()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "JSON backup / Maktab" }).click()
  const download = await downloadPromise
  const path = await download.path()
  const parsed = JSON.parse(await readFile(path!, "utf8"))
  expect(parsed.format).toBe("hader-session"); expect(parsed.segments[2].text).toContain("قررنا")
  await page.reload()
  await page.getByRole("button", { name: "context-session", exact: true }).click()
  await expect(page.getByText("4 final segments")).toBeVisible()
  await page.getByLabel("Import transcript file").setInputFiles({ name: "restored.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(parsed)) })
  await expect(page.getByText("4 final segments")).toBeVisible()
  await page.screenshot({ path: `test-results/context-${test.info().project.name}.png`, fullPage: true })
  expect(posted).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test("malformed import does not replace current evidence and demo stays labelled", async ({ page }) => {
  await page.goto("/assistant")
  await page.getByLabel("Paste transcript").fill("This is a saved untimed lecture note about strategy.")
  await page.getByRole("button", { name: "Use pasted transcript" }).click()
  await expect(page.getByText("1 final segments")).toBeVisible()
  await page.getByLabel("Import transcript file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") })
  await expect(page.getByText("1 final segments")).toBeVisible()
  const sample = { format: "hader-session", version: 1, id: "demo", title: "Sample", createdAt: "2026-10-23T20:00:00.000Z", segments: [{ id: "s1", text: "Synthetic demonstration only.", offsetMs: 0, source: "demo" }] }
  await page.getByLabel("Import transcript file").setInputFiles({ name: "demo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) })
  await expect(page.getByText("Demo", { exact: true })).toBeVisible()
})
