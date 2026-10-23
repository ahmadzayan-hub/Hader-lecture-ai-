# Hader portable transcript format v1

One UTF-8 JSON object per file, at most 2,000,000 bytes. This file is a user-controlled handoff, not an automatic sync channel. Maktab and other consumers should validate before use.

```json
{"format":"hader-session","version":1,"id":"session-id","title":"Course or meeting","createdAt":"2026-10-23T20:00:00.000Z","segments":[{"id":"s1","text":"The assignment is due Sunday.","offsetMs":1000,"source":"import"}]}
```

- `format` and `version` are mandatory. Unknown versions must be rejected, not guessed.
- `id`: session identifier, 1–100 characters. `title`: 1–200 characters. `createdAt`: ISO timestamp for document creation, not a claim about the recording date.
- `segments`: 1–10,000 entries. Segment `id` values are unique, 1–100 ASCII letters, digits, underscores or hyphens.
- `text`: original text, 1–12,000 characters per segment, displayed as text, never executed or interpreted as HTML/instructions.
- `offsetMs`: nonnegative integer milliseconds from capture/subtitle start, up to seven days, or `null` for untimed pasted content. Do not invent times for null values or treat capture receipt as verified speaker timing.
- `source`: `live`, `import` or `demo`. If any segment is `demo`, consumers must show a sample/demo warning. This field is provenance supplied by the producer, not cryptographic evidence of a recording.
- No raw audio, credentials, device IDs, profile, inferred commitments or generated model statements are stored in this format.

The TypeScript validator and import/export helpers are in `lib/context/session.ts`. Suggested questions and generated answers stay outside the transcript so they cannot be mistaken for statements in the meeting. Future generated-artifact formats must preserve that separation.
