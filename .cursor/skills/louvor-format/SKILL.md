---
name: louvor-format
description: >-
  Applies the ICM worship-song content format (title/content, blank-line slides,
  yellow CORO/BIS/FINAL markers, chave-* blockquotes). Use when creating or
  editing louvor lyrics for data.json, fixing slide breaks, or converting IR
  presentation into official Song HTML. Read docs/louvor/LOUVOR_FORMAT_SPEC.md.
---

# louvor-format

## Responsibility

Produce or correct official Song objects `{ title, content }` in the ICM projection dialect. Does **not** import files, write staging, or merge the library.

## When to use

- Manual creation/editing of a louvor
- Formatting IR slides into final `content`
- Fixing CORO/BIS/chave markup

## When NOT to use

- Parsing PPTX/TXT/DOCX/PDF (use `louvor-import-extract`)
- Duplicate detection or confidence thresholds (use `louvor-normalize-validate`)
- Approving merge into `data.json` (use `louvor-import-review`)

## Inputs

- Title text and optional number
- Lines/sections or draft `content`
- Optional: collection name for numbering style

## Outputs

```json
{ "title": "12 - TÍTULO EM MAIÚSCULAS", "content": "…" }
```

## Rules (evidence-based)

1. **Only** `title` + `content` on the Song.
2. Slides separated by blank line `\n\n`.
3. Labels: `<font color="yellow"><i>CORO</i></font>` (also FINAL:, INSTRUMENTOS, (BIS), (2X), …).
4. Graphical repeat: `<blockquote class="chave-bis">…</blockquote>` or `chave-bis-small` / `chave-Nx`.
5. Do **not** expand BIS/Nx by duplicating lyrics.
6. Prefer ~5–6 lines/slide, soft max 9; ~≤38 chars/line for adult collections.
7. Number in title when collection expects it: `N - TÍTULO`.
8. Follow [docs/louvor/LOUVOR_FORMAT_SPEC.md](../../../docs/louvor/LOUVOR_FORMAT_SPEC.md) and [presentation-rules.md](../../../docs/louvor/presentation-rules.md).

## Success criteria

- Renders correctly when split on `\n\n` in Reveal
- Markers match existing library style
- Passes conceptual check against `library-validate` field rules

## Limitations

- Does not change Reveal themes or backgrounds
- Does not invent author/reference fields
- Alla-fine chave asset has no CSS — do not invent a class for it
