import { briefRequestSchema, briefSchema } from "@/lib/schemas"
import { errorResponse, noStore, parseBody } from "@/lib/server/api"
import { clientKey, rateLimit } from "@/lib/server/rate-limit"
import { completeText, extractJson, QwenConfigError, QwenRequestError } from "@/lib/server/qwen"
import { buildLocalBrief } from "@/lib/ai/local-brief"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SYSTEM_PROMPT = `You produce study material from a university lecture transcript.
Use ONLY information present in the transcript. Never invent facts, dates or assignments.
If a section has no support in the transcript, return an empty array for it.
Match the transcript's language (Arabic transcript -> Arabic output).
Reply with ONLY a JSON object with these keys:
{"summary":"","keyConcepts":[],"definitions":[{"term":"","meaning":""}],"assignments":[],"examPoints":[],"questionsToReview":[],"quiz":[{"question":"","answer":""}],"flashcards":[{"front":"","back":""}]}
Provide exactly 5 quiz questions when the transcript supports them.`

/** End-of-session study brief. Runs after the lecture, never during detection. */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "brief"), 10, 60_000)
  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Too many summary requests.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    })
  }

  const parsed = await parseBody(request, briefRequestSchema)
  if (!parsed.ok) return parsed.response

  const { transcript, course, language } = parsed.data

  try {
    const { text } = await completeText({
      jsonMode: true,
      maxTokens: 1800,
      temperature: 0.2,
      timeoutMs: 45_000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Course: ${course || "Unspecified"}\nPreferred language: ${language}\n\nTranscript:\n${transcript}`,
        },
      ],
    })

    const parsedBrief = briefSchema.safeParse(extractJson(text))
    if (!parsedBrief.success) {
      // Truthful degradation: return the local extractive brief and say so.
      return noStore({ ...buildLocalBrief(transcript), source: "local" as const, providerNotice: "The model output failed validation. Showing local sentence extraction instead." })
    }
    return noStore({ ...parsedBrief.data, source: "qwen" as const })
  } catch (error) {
    // A missing key is the normal free setup, not a failed summary.
    return noStore({ ...buildLocalBrief(transcript), source: "local" as const, providerNotice: error instanceof QwenRequestError ? error.hint : error instanceof QwenConfigError ? "Paid AI is disabled or its key/model configuration is incomplete. Showing local sentence extraction." : "Provider unavailable. Showing local sentence extraction." })
  }
}
