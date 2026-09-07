---
name: louvor-import-review
description: >-
  Reviews louvor import staging (needsReview, reports, duplicates), formats
  approved IR into official Songs via louvor-format rules, and merges only into
  a new folder such as Coletânea 2022 after explicit approval. Guards data.json.
---

# louvor-import-review

## Responsibility

Human-in-the-loop gate: read import reports and `imports/review/`, resolve flags, move items to `approved/` or `rejected/`, format with ICM dialect, and **only then** merge into the official library as a **new folder** (default `Coletânea 2022`).

## When to use

- User asks to approve/reject import batch
- Producing final Import Report
- Merging approved songs into `data.json` (explicit user request)

## When NOT to use

- Blind full-file import without sample review
- Overwriting Coletânea 2018 / Antiga
- Extraction or normalization work (other skills)
- Changing song schema / adding extra JSON fields without validator migration

## Inputs

- `imports/review/`, `imports/normalized/`, `imports/reports/`
- User decisions on flagged items
- Explicit go-ahead before touching `data.json`

## Outputs

- Updated staging (`approved/`, `rejected/`)
- Import Report (per file + aggregate)
- On approval: folder `{ name: "Coletânea 2022", type: "s", lang: "pt", songs: [...] }` appended (or merged per plan)
- Optional provenance sidecar later — **not** fields inside Song

## Rules

1. **Never** `arquivo → data.json` without validation + review.
2. Do not modify existing folders’ songs in a 2022 import merge.
3. Call formatter rules from `louvor-format` / LOUVOR_FORMAT_SPEC for `content`.
4. `SAME_SONG_DIFFERENT_VERSION` is expected and allowed.
5. `EXACT_DUPLICATE` in destination → reject or skip unless user overrides.
6. Keep backup discipline: use library-store / export backup before save when implementing.
7. Sample PPTX 2022 quality matrix before full batch (simple, CORO, BIS, Nx, long, short, graphic, duplicate).
8. Follow [docs/louvor/IMPORT_PIPELINE_SPEC.md](../../../docs/louvor/IMPORT_PIPELINE_SPEC.md) and [validation-rules.md](../../../docs/louvor/validation-rules.md).

## Success criteria

- Report lists success / review / fail / duplicates
- Official JSON still validates with `library-validate.js`
- Regression: 2018/Antiga projection unchanged

## Limitations

- Phase 0 may have docs only — still refuse unsafe merges
- Does not claim PPTX visual fidelity equal to JSON projection
- Deck PNG path remains a separate operational choice for graphic CIA
