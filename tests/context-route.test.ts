import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { GET, POST } from "@/app/api/context/route"
import { POST as brief } from "@/app/api/ai/brief/route"
import { readQwenConfig } from "@/lib/server/qwen"
beforeEach(() => { vi.stubEnv("HADER_LOCAL_AI", "0"); vi.stubEnv("HADER_PAID_PROVIDERS", "0"); vi.stubEnv("QWEN_API_KEY", ""); vi.stubEnv("VERCEL", ""); vi.stubGlobal("fetch", vi.fn()) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe("provider-safe routes", () => {
  it("status never probes a model when disabled", async () => {
    const response = await GET(new Request("http://localhost:3000/api/context"))
    expect((await response.json()).available).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
  it("rejects remote and cross-origin model generation", async () => {
    vi.stubEnv("HADER_LOCAL_AI", "1")
    const res = await POST(new Request("https://hader.example/api/context", { method: "POST", headers: { origin: "https://hader.example", "content-type": "application/json" }, body: "{}" }))
    expect(res.status).toBe(403); expect(fetch).not.toHaveBeenCalled()
  })
  it("rejects oversized request bodies before model processing", async () => {
    vi.stubEnv("HADER_LOCAL_AI", "1")
    const res = await POST(new Request("http://localhost:3000/api/context", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "x".repeat(100001) }))
    expect(res.status).toBe(413); expect(fetch).not.toHaveBeenCalled()
  })
  it("rejects invalid model requests", async () => {
    vi.stubEnv("HADER_LOCAL_AI", "1")
    const res = await POST(new Request("http://localhost:3000/api/context", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}" }))
    expect(res.status).toBe(422); expect(fetch).not.toHaveBeenCalled()
  })
  it("disables paid calls even when a credential happens to exist", () => {
    vi.stubEnv("QWEN_API_KEY", "test-only-not-a-real-key")
    expect(readQwenConfig().ok).toBe(false)
  })
  it("returns a real free brief when no paid provider is enabled", async () => {
    const response = await brief(new Request("http://localhost/api/ai/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: "The assignment is due next Sunday. Please submit the group project through the portal. This lecture discusses the economics of customer acquisition and the relation between retention and lifetime value.", course: "Strategy", language: "en" }) }))
    expect(response.status).toBe(200)
    expect((await response.json()).source).toBe("local")
    expect(fetch).not.toHaveBeenCalled()
  })
})

import { providerFailure } from "@/lib/ai/provider-failure"
import { completeText } from "@/lib/server/qwen"
describe("model lifecycle and quota contract", () => {
  it.each([
    [401, "", "PROVIDER_AUTH"], [404, "", "MODEL_UNAVAILABLE"], [410, "", "MODEL_UNAVAILABLE"],
    [400, "ModelNotFound", "MODEL_UNAVAILABLE"], [429, "insufficient_quota", "QUOTA_EXHAUSTED"],
    [429, "Throttling.RateQuota", "RATE_LIMITED"], [503, "provider secret body", "PROVIDER_UNAVAILABLE"],
  ])("maps %s safely to %s", (status, body, code) => {
    const result = providerFailure(status as number, body as string)
    expect(result.code).toBe(code); expect(result.hint).not.toContain("provider secret body")
  })
  it("does not default to an old model ID", () => {
    vi.stubEnv("HADER_PAID_PROVIDERS", "1"); vi.stubEnv("QWEN_API_KEY", "test-only")
    vi.stubEnv("QWEN_ASR_MODEL", ""); vi.stubEnv("QWEN_TEXT_MODEL", "")
    const config = readQwenConfig()
    expect(config.ok).toBe(false)
    if (!config.ok) expect(config.missing.some(v => v.startsWith("QWEN_TEXT_MODEL"))).toBe(true)
  })
  it("stops after one failed text request, without paid model fallback or retry loops", async () => {
    vi.stubEnv("HADER_PAID_PROVIDERS", "1"); vi.stubEnv("QWEN_API_KEY", "test-only")
    vi.stubEnv("QWEN_ASR_MODEL", "configured-asr"); vi.stubEnv("QWEN_TEXT_MODEL", "configured-text")
    vi.mocked(fetch).mockResolvedValue(new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 }))
    await expect(completeText({ messages: [{ role: "user", content: "Synthetic fixture" }] })).rejects.toMatchObject({ code: "QUOTA_EXHAUSTED" })
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body.model).toBe("configured-text")
  })
})
