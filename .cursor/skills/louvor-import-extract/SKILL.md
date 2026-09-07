---
name: louvor-import-extract
description: >-
  Extracts worship songs from PPTX, TXT, DOCX, or PDF into the import IR
  (CanonicalSong / RawDocument) under imports/ staging. Never writes data.json.
  Use when analyzing coletânea sources, PPTX 2022 slides, or batch incoming files.
---

# louvor-import-extract

## Responsibility

Read source files and produce **RawDocument** + initial **CanonicalSong** drafts in staging (`imports/extracted/`, `imports/normalized/` drafts). Preserve source structure (especially PPTX slides).

## When to use

- User provides PPTX/TXT/DOCX/PDF coletânea material
- Sampling Coletânea 2022 (`docs/01.COLETÂNEA_IGREJAS-2022_PROJETOR-4.3.pptx`)
- Batch listing under `imports/incoming/`

## When NOT to use

- Final HTML formatting only (`louvor-format`)
- Validation/duplicates/pagination policy (`louvor-normalize-validate`)
- Merge to official library (`louvor-import-review`)
- Projecting decks as PNG (existing `server/decks.js` — different path)

## Inputs

- File path(s) and type
- Optional collection hint (`2022`, etc.)

## Outputs

- RawDocument JSON (file → songs → slides → elements → text)
- CanonicalSong stubs with `metadata.source` filled
- Extraction warnings (empty slides, images, unsupported animations)

## Rules

1. **Never** modify `data/data.json`.
2. PPTX is a **source**, not the library schema.
3. Prefer structured mode when slides are reliable; keep `sourceSlideIndex`.
4. PPTX 2022: index slide and closing art are not songs; split on `NN – TITLE` footers/starts; ignore “Índice” nav links as titles.
5. Capture images/graphics as warnings; do not drop silently.
6. Animations/transitions → diagnose as unsupported for library path.
7. Record provenance on every song IR.
8. Follow [docs/louvor/import-rules.md](../../../docs/louvor/import-rules.md) and [ARCHITECTURE_PROPOSAL.md](../../../docs/louvor/ARCHITECTURE_PROPOSAL.md).

## Success criteria

- Reproducible extraction order
- Each song has source metadata
- Uncertain boundaries flagged, not guessed silently

## Limitations

- Full importer CLI may not exist yet — skill still governs how an agent must extract manually/with scripts
- OCR for scanned PDFs out of scope
- LibreOffice deck rasterization is separate from text extraction
