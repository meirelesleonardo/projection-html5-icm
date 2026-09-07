# Base de conhecimento — Louvores ICM

Documentação versionada do padrão de louvores da aplicação de projeção, derivada da análise da base JSON existente (`data/data.json`) e da capacidade real do projetor. **Não inventa regras** antes de medi-las nos dados.

## Como ler os níveis de evidência

| Marcador | Significado |
|----------|-------------|
| **CONFIRMADA** | Observável no código e/ou em contagens da base |
| **INFERÊNCIA PROVÁVEL** | Consistente com os dados, mas não formalizada no código |
| **EXCEÇÃO** | Caso real que foge ao padrão dominante |
| **DESCONHECIDO** | Não há evidência suficiente; não assumir |

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [LIBRARY_MAINTENANCE.md](./LIBRARY_MAINTENANCE.md) | **Não editar data.json manualmente** — fluxo UI/API |
| [LOUVOR_FORMAT_SPEC.md](./LOUVOR_FORMAT_SPEC.md) | Especificação do formato oficial `{title, content}` |
| [ARCHITECTURE_PROPOSAL.md](./ARCHITECTURE_PROPOSAL.md) | IR intermediário, adapters, staging, relação com decks |
| [IMPORT_PIPELINE_SPEC.md](./IMPORT_PIPELINE_SPEC.md) | Pipeline de importação, confiança, duplicatas, relatórios |
| [PRESENTATION_COMPATIBILITY.md](./PRESENTATION_COMPATIBILITY.md) | PPTX/imagens/animações — o que a app realmente suporta |
| [semantic-model.md](./semantic-model.md) | Modelo semântico embutido no `content` |
| [presentation-rules.md](./presentation-rules.md) | Limites visuais e paginação |
| [collection-rules.md](./collection-rules.md) | Pastas/coletâneas e numeração |
| [import-rules.md](./import-rules.md) | Regras para fontes TXT/DOCX/PDF/PPTX |
| [validation-rules.md](./validation-rules.md) | Validação e critérios de aceite de importação |
| [known-exceptions.md](./known-exceptions.md) | Exceções e outliers documentados |

## Skills do projeto

Skills especializadas em [`.cursor/skills/`](../../.cursor/skills/):

1. `louvor-format` — criar/editar `content` no padrão ICM
2. `louvor-import-extract` — extrair fontes → IR (nunca grava `data.json`)
3. `louvor-normalize-validate` — normalizar, paginar, validar, duplicatas
4. `louvor-import-review` — revisar staging e aprovar merge

## Fonte de verdade da biblioteca

- Documento oficial: [`data/data.json`](../../data/data.json)
- Meta/versão: [`data/library-meta.json`](../../data/library-meta.json)
- Validador: [`server/library-validate.js`](../../server/library-validate.js)

**CONFIRMADA:** o schema oficial do louvor é apenas `{ title, content }`. Campos extras não devem ser gravados no documento oficial sem alterar o validador.

## Princípio arquitetural

```text
FONTES (TXT | DOCX | PDF | PPTX)
         ↓
   MODELO CANÔNICO (IR de importação)
         ↓
   ┌─────┴─────┐
   ↓           ↓
 DADOS      APRESENTAÇÃO
 (biblioteca)  (projetor / content)
```

O PPTX é uma **fonte** (às vezes com excelente layout), não o modelo da base.

## Status

| Item | Estado |
|------|--------|
| Specs / skills Fase 0 | Feito |
| CLI `tools/louvor-import/` | Feito |
| API `/api/imports*` + merge + apply | Feito |
| UI desktop Importar coletânea | Feito |
| Backups / restore | Feito |
| Editar `data.json` manualmente | **Proibido** no fluxo normal — ver [LIBRARY_MAINTENANCE.md](./LIBRARY_MAINTENANCE.md) |

**Uso:** abra `index.html` via `http://…:3080`, menu **Importar/Exportar → Importar coletânea…**
