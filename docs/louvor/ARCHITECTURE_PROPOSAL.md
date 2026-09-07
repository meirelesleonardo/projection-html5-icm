# ARCHITECTURE_PROPOSAL — Importação de louvores

Proposta de arquitetura para incorporar novas coletâneas (ex.: 2022) sem alterar o schema oficial da biblioteca nem tratar o PPTX como modelo da base.

---

## 1. Princípios

1. **`data/data.json` permanece a fonte de verdade da biblioteca** — schema `{title, content}` + pastas.
2. **PPTX / PDF / DOCX / TXT são fontes**, não o schema.
3. Separar **conteúdo semântico** de **layout de apresentação** no IR de importação.
4. Nunca gravar direto na base oficial: staging → revisão → merge.
5. Mesmo louvor em 2018 e 2022 = duas Songs em pastas distintas (versões por coletânea).
6. Reutilizar o pipeline de **decks PNG** só quando fidelidade visual gráfica for necessária (CIA / slides imagem).

---

## 2. Modelo intermediário (IR)

Nomes alinhados ao domínio da app; o IR **não** substitui o Song oficial.

```text
CanonicalSong
├── metadata
│    ├── titleRaw          // texto do título
│    ├── number            // parseado do título ou da fonte (opcional)
│    ├── collectionHint    // ex. "2022"
│    ├── lang              // default "pt"
│    └── source            // proveniência (obrigatória no IR)
│         ├── type         // pptx | txt | docx | pdf | …
│         ├── file
│         ├── collection
│         └── extractedAt
├── sections[]             // semântica
│    ├── type              // verse | chorus | final | instruments | other
│    ├── lines[]           // texto sem HTML ICM ainda
│    ├── repeat            // null | { kind: "bis"|"nx", n?: number }
│    ├── confidence        // 0–1 quando inferido
│    └── needsReview       // bool
└── presentation
     ├── mode              // structured | normalized
     ├── slides[]          // linhas por slide (pode vir do PPTX)
     │    ├── lines[]
     │    ├── sourceSlideIndex?  // se veio de PPTX
     │    └── warnings[]
     └── sourcePresentation?     // snapshot opcional da origem
```

### Writer → Song oficial

```text
CanonicalSong
  → PresentationFormatter (HTML ICM + \n\n)
  → { title: "N - TÍTULO", content: "…" }
  → pasta Folder { name: "Coletânea 2022", type: "s", lang: "pt", songs: […] }
```

Proveniência **não** entra em `data.json` nesta fase. Fica em:

- `imports/.../review/` e relatórios
- sidecar opcional futuro (`data/import-provenance.json`) fora do validador atual

---

## 3. Pipeline

```text
ImportService
     │
     ├── TxtImporter
     ├── DocxImporter
     ├── PdfImporter
     └── PptxImporter
           ↓
     RawDocument
           ↓
     ContentExtractor  →  CanonicalSong
           ↓
     Normalizer
           ↓
     Validator  +  DuplicateDetector
           ↓
     Review (staging)
           ↓
     PresentationFormatter
           ↓
     LibraryWriter  (merge aprovado → data.json)
```

Nenhum adapter gera o JSON final sozinho.

---

## 4. Modos de importação

| Modo | Quando | Comportamento |
|------|--------|----------------|
| **structured** | PPTX (ou fonte) com slides confiáveis | Preservar quebras de slide; mapear markers; comparar com limites ICM |
| **normalized** | TXT / DOCX / PDF textual | Extrair semântica → paginação determinística no padrão 2018/Antiga |

Se slides PPTX forem incompatíveis com o padrão visual ICM → normalizar e registrar `sourcePresentation` no IR para auditoria.

---

## 5. Staging (filesystem)

```text
imports/
  incoming/      # arquivos brutos
  extracted/     # RawDocument / texto bruto por arquivo
  normalized/    # CanonicalSong JSON
  review/        # fila humana + flags needsReview
  approved/      # prontos para merge
  rejected/      # descartados com motivo
  reports/       # Import Report por lote
```

Fluxo: arquivo → extração → normalização → validação → duplicidade → revisão → aprovação → biblioteca.

---

## 6. Relação com decks existentes

Já implementado em `server/decks.js`:

```text
PPTX/PPT/ODP/PDF → LibreOffice → PDF → pdftoppm → media/decks/<id>/slide-*.png
```

| Caminho | Uso |
|---------|-----|
| Biblioteca (`data.json`) | Busca, edição, CORO/BIS HTML, culto diário |
| Deck PNG | Fidelidade visual / CIA gráfica / fallback de slide não textual |

A coletânea 2022 **prioriza** o caminho biblioteca (texto). Deck completo de ~2965 slides é opção operacional, não o modelo de dados.

---

## 7. Localização do código (implementação futura)

Recomendado: `tools/louvor-import/` (CLI Node), separado do relay `server/`, para não misturar upload de culto com lote editorial.

Dependências previstas (não instalar nesta fase):

- PPTX: JSZip + XML
- DOCX: mammoth ou OOXML
- PDF texto: pdf-parse ou `pdftotext`
- Decks: LibreOffice + pdftoppm (já usados)

---

## 8. Skills

Ver `.cursor/skills/louvor-*`. Quatro skills cobrem o ciclo sem fragmentação cosmético.

---

## 9. O que não fazer

- Não promover PPTX a schema da base.
- Não colapsar 2018 e 2022 por título.
- Não adicionar campos em `Song` sem migrar `library-validate.js` e clientes.
- Não expandir BIS/Nx no texto (a app não faz isso).
- Não gravar `data.json` sem passar por `approved/`.
