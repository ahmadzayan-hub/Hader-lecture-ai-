# ASR accuracy benchmark fixtures

`manifest.json` drives `pnpm asr:benchmark` and `tests/asr-accuracy.test.ts`.

## What is committed

Only **synthetic** cases: invented lecture text with hand-edited hypotheses.
They exist so that the scorer (`lib/asr/accuracy.ts`) is exercised on Arabic,
English and mixed text and produces the same numbers on every machine. A low
error rate on these cases says nothing about any real engine, microphone,
room, dialect or model revision.

## What is not committed, and why

Real accuracy evidence needs:

1. A consented 10–30 minute recording of a real lecture (participant permission
   obtained first; see `docs/GETTING_STARTED.md`).
2. An approved reference transcript for that recording, reviewed by a person
   who heard it.
3. The hypothesis transcript produced by the engine under test, with the
   device, model id, revision and date recorded in the hypothesis `note`.

Those recordings and transcripts may contain personal data and are owner
inputs. Do not commit them. To run the benchmark against them, point the CLI
at a private manifest kept outside the repository:

```bash
pnpm asr:benchmark -- --manifest /path/to/private/manifest.json --json report.json
```

Mark such cases `"source": "consented"`. The report flags whether every case
for an engine was synthetic, so a synthetic-only run cannot be mistaken for
real acceptance.

## Case shape

```json
{
  "id": "unique-id",
  "language": "ar" | "en" | "mixed",
  "source": "synthetic" | "consented",
  "reference": "approved transcript text",
  "expectedNames": ["names that must survive transcription"],
  "expectedNumbers": ["numbers that must survive transcription"],
  "hypotheses": [{ "engine": "label@revision", "text": "engine output", "note": "device/model/date" }]
}
```

Scoring normalises diacritics, alef/taa-marbuta/yaa variants, Arabic-Indic
digits, case and punctuation before alignment, so those differences are not
counted as errors. Everything else is.
