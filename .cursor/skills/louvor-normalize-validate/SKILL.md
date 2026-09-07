---
name: louvor-normalize-validate
description: >-
  Normalizes import IR markers (CORO/BIS/Nx), applies deterministic pagination,
  confidence thresholds, validation, and duplicate classification against existing
  folders. Use after extraction, before human review/merge. Does not write data.json.
---

# louvor-normalize-validate

## Responsibility

Turn extracted CanonicalSong drafts into normalized, validated IR ready for review: section types, repeat markers, presentation slides, confidence flags, duplicate reports.

## When to use

- After `louvor-import-extract`
- Re-running pagination on text-only sources
- Comparing a batch to Coletânea 2018 / Antiga / CIA / Avulsos

## When NOT to use

- Writing official library (`louvor-import-review`)
- Pure markup styling of an already final Song (`louvor-format`)
- Raw OOXML unzipping without normalization goals

## Inputs

- CanonicalSong[] (IR)
- Existing library snapshot (read-only) for duplicate checks
- Configurable thresholds (default confidence bands)

## Outputs

- Normalized CanonicalSong[] in `imports/normalized/` or `imports/review/`
- Per-song: `needsReview`, warnings, confidence
- Duplicate classification: `NEW_SONG` | `EXACT_DUPLICATE` | `POSSIBLE_DUPLICATE` | `SAME_SONG_DIFFERENT_VERSION`
- Batch summary stats

## Rules

1. Context-aware marker classification — not naive regex alone.
2. Confidence: ≥0.90 auto; 0.70–0.89 review; &lt;0.70 do not assume.
3. Inferring chorus without explicit marker → review message if uncertain.
4. Deterministic pagination for normalized mode (same in → same out).
5. Prefer phrase/semantic breaks; targets ~5–6 lines/slide, soft max 9, ~≤38 chars/line.
6. Structured PPTX slides: preserve if compatible; else normalize and keep `sourcePresentation`.
7. Same title in another collection → `SAME_SONG_DIFFERENT_VERSION` (allow), not auto-delete.
8. Never expand BIS/Nx into duplicated lyric text.
9. Follow [docs/louvor/IMPORT_PIPELINE_SPEC.md](../../../docs/louvor/IMPORT_PIPELINE_SPEC.md), [validation-rules.md](../../../docs/louvor/validation-rules.md), [known-exceptions.md](../../../docs/louvor/known-exceptions.md).

## Success criteria

- Every inference has confidence or explicit unknown
- Duplicate report produced before approval
- No silent schema invention on official Song shape

## Limitations

- Does not approve merges
- Similarity metrics are heuristic
- Does not implement deck PNG conversion
