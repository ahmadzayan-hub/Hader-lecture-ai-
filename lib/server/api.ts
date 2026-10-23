import "server-only"
import { NextResponse } from "next/server"
import { z } from "zod"
import { QwenConfigError, QwenRequestError } from "./qwen"

/** Standard JSON error. Never includes secrets or raw upstream bodies. */
export function errorResponse(status: number, code: string, message: string, extra?: object) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status })
}

export function noStore<T>(body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

/** Parses and validates a JSON body, returning a typed result or a response. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: errorResponse(400, "INVALID_JSON", "Request body is not valid JSON.") }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(422, "VALIDATION_FAILED", "Request failed validation.", {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    }
  }
  return { ok: true, data: parsed.data }
}

/** Converts thrown errors into safe responses and logs without secrets. */
export function handleRouteError(error: unknown, scope: string) {
  if (error instanceof QwenConfigError) {
    return errorResponse(503, error.missing.some(v => v.startsWith("HADER_PAID")) ? "PROVIDER_DISABLED" : error.missing.includes("QWEN_API_KEY") ? "MISSING_KEY" : "MODEL_NOT_CONFIGURED", error.message, { missing: error.missing })
  }
  if (error instanceof QwenRequestError) {
    return errorResponse(error.status >= 500 ? 502 : error.status, error.code, error.hint, { retryable: error.retryable })
  }
  console.error(`[hader] ${scope} failed:`, error instanceof Error ? error.message : "unknown")
  return errorResponse(500, "INTERNAL_ERROR", "Unexpected server error.")
}
