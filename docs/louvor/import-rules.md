# import-rules.md

Regras por tipo de fonte.

---

## Regra geral

1. Extrair → IR → validar → staging → aprovar → `{title, content}`.
2. Não escrever `data.json` na extração.
3. Registrar `source` no IR.
4. Preferir preservar layout estruturado quando a fonte for confiável.
5. Texto puro → paginação no padrão ICM (presentation-rules.md).

---

## TXT

| Fornece | Em geral não fornece |
|---------|----------------------|
| Texto / possíveis labels | Slides, fontes, imagens |

Modo: **normalized**.  
Detectar CORO/BIS/Nx com classificação contextual.  
Gerar slides deterministicamente.

---

## DOCX

| Fornece | Em geral não fornece |
|---------|----------------------|
| Parágrafos, negrito/itálico às vezes | Paginação de projeção |

Modo: **normalized** (salvo evidência clara de page breaks intencionais).  
Mapear ênfase para labels só com confiança alta.

---

## PDF

| Fornece | Risco |
|---------|-------|
| Texto (se textual) | Layout perdido; OCR fora de escopo inicial |
| Ou páginas-imagem | Tratar como deck / `needsReview` |

Se `pdftotext` produzir texto útil → normalized.  
Se for scan → TEXT_ONLY impossível sem OCR; oferecer caminho deck.

---

## PPT / PPTX

| Fornece | Uso |
|---------|-----|
| Slides ordenados + texto + posições | Modo **structured** se densidade OK |
| Imagens / masters | Avisos; fallback raster se necessário |
| Animações / transições | Ignorar + diagnosticar |
| Notas | Capturar se existirem (2022 quase sem notas úteis) |

### PPTX 2022 — regras específicas

**CONFIRMADA (estrutura do arquivo):**

1. Slide 1 = índice com hyperlinks.
2. Louvores separados por rodapé / início `NN – TÍTULO` (hífen unicode ou ASCII).
3. “Índice” em slides é link de navegação, não título do louvor.
4. Último slide = arte de encerramento (não é letra).
5. Markers CORO/BIS/2X/3X/FINAL/INSTRUMENTOS são **texto**, não animações.

Preservar relação:

```text
arquivo → louvor → slide → elementos → texto
```

no RawDocument; no Song oficial só sobra título+content.

Comparar padrão de quebra 2022 × 2018: o que for só estilo da coletânea 2022 não precisa ser forçado ao estatístico 2018 se já projetar bem.

---

## Outras apresentações (ODP)

Mesmo caminho que PPTX para **deck visual**.  
Para biblioteca: só se houver extractor; senão, texto via conversão PDF/`pdftotext` com `needsReview`.

---

## Importação híbrida

| Situação | Caminho |
|----------|---------|
| Letra clara, pouca arte | Biblioteca JSON |
| Arte dominante / CIA gráfica | Deck PNG (+ texto se extraível) |
| Misto | JSON para busca + deck opcional para culto especial |

---

## Proibições

- Não usar o deck PNG como único destino da Coletânea 2022 (perde busca/edição).
- Não apagar pastas existentes no merge.
- Não inferir autor/ano em campos oficiais.
- Não assumir que toda palavra “BIS” é marcador.
