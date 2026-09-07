# IMPORT_PIPELINE_SPEC

Especificação do pipeline de importação de louvores. Implementação futura; esta fase só documenta o contrato.

---

## 1. Objetivo

Importar fontes heterogêneas (TXT, DOCX, PDF, PPT, PPTX, …) para Songs compatíveis com a aplicação, com staging, validação, detecção de duplicidade e revisão humana — **sem** escrever direto em `data/data.json`.

---

## 2. Fluxo ponta a ponta

```text
             ┌─────────────┐
             │ TXT/DOCX/…  │
             │ PDF/PPTX    │
             └──────┬──────┘
                    ▼
            ┌───────────────┐
            │   EXTRACTOR   │  → RawDocument / slides / texto
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │  NORMALIZER   │  → seções + markers + confiança
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │ CANONICAL IR  │
            └───────┬───────┘
          ┌─────────┴─────────┐
          ▼                   ▼
    ┌────────────┐      ┌─────────────┐
    │ VALIDATOR  │      │ DUPLICATE   │
    └─────┬──────┘      │ DETECTOR    │
          └─────────┬───┘
                    ▼
             ┌────────────┐
             │   REVIEW   │  staging/needsReview
             └─────┬──────┘
                   ▼ aprovação
          ┌─────────────────┐
          │ PRESENTATION    │  HTML ICM + \n\n
          │ FORMATTER       │
          └────────┬────────┘
                   ▼
             ┌──────────┐
             │ JSON DB  │  pasta Coletânea 2022 (merge)
             └──────────┘
```

---

## 3. Staging

```text
imports/
  incoming/
  extracted/
  normalized/
  review/
  approved/
  rejected/
  reports/
```

| Etapa | Artefato típico |
|-------|-----------------|
| incoming | arquivo original |
| extracted | JSON RawDocument + textos por slide |
| normalized | CanonicalSong[] |
| review | subset com `needsReview` + notas |
| approved | CanonicalSong prontos + Song `{title,content}` gerados |
| rejected | motivo + referência ao arquivo |
| reports | Import Report do lote |

---

## 4. Sistema de confiança

Sempre que houver inferência (seção, coro sem marcador, quebra, etc.):

```json
{
  "detectedSection": "chorus",
  "confidence": 0.94,
  "needsReview": false
}
```

Limites padrão (configuráveis):

| Faixa | Ação |
|-------|------|
| 0.90 – 1.00 | aceitar automaticamente |
| 0.70 – 0.89 | marcar `needsReview: true` |
| &lt; 0.70 | não assumir; deixar como `other` + aviso |

Nunca decidir silenciosamente abaixo do limiar de revisão.

---

## 5. Detecção de CORO / BIS / Nx

Camada de classificação com contexto — não só regex.

Normalizar variantes para o IR:

| Fonte | IR |
|-------|-----|
| CORO, Coro:, REFRÃO | `type: chorus` |
| BIS, (bis), Bis | `repeat.kind: bis` |
| 2x, 2 X, (2X) | `repeat.kind: nx, n: 2` |
| FINAL:, Final | `type: final` |
| INSTRUMENTOS | `type: instruments` |

**CONFIRMADA (regra de ouro):** ocorrência da palavra dentro da letra ≠ marcador. Ex.: “és a ponte…” não é seção PONTE.

Se inferir coro sem marcador explícito e `confidence < 0.90` → `needsReview` + mensagem: `"Possível coro detectado automaticamente."`

---

## 6. Paginação determinística (modo normalized)

Entrada: seções estruturadas.  
Saída: `presentation.slides[]` reproduzível (`mesma entrada → mesma saída`).

Prioridades:

1. Preservar frases / unidades semânticas
2. Respeitar limites visuais (ver presentation-rules.md)
3. Evitar linhas excessivamente curtas e páginas excessivamente cheias
4. Manter CORO/BIS visualmente identificáveis
5. Não fazer `split(" ")` cego a cada N palavras

Alvos (INFERÊNCIA a partir da base):

- ~5–6 linhas/slide; soft max 9
- ~≤38 chars/linha (p95 coletâneas adultas)

---

## 7. Quando a fonte já tem slides (PPTX)

1. Extrair slides e textos na ordem.
2. Segmentar louvores (rodapé `NN – TÍTULO`, índice, etc.).
3. Comparar densidade (linhas/chars) com padrão ICM.
4. Se compatível → **preservar** slides (`mode: structured`).
5. Se incompatível → **normalizar** e guardar `sourcePresentation`.
6. Registrar imagens/gráficos não textuais como warnings / fallback.

---

## 8. Duplicidades

Comparar contra pastas existentes (2018, Antiga, CIA, Avulsos, …):

- título normalizado
- número
- similaridade de conteúdo (texto stripado)
- coletânea de origem/destino

Classificação:

| Código | Significado |
|--------|-------------|
| `NEW_SONG` | não encontrado |
| `EXACT_DUPLICATE` | título+conteúdo equivalentes na **mesma** pasta destino |
| `SAME_SONG_DIFFERENT_VERSION` | mesmo louvor lógico em outra coletânea |
| `POSSIBLE_DUPLICATE` | similaridade alta, incerto |

**Nunca excluir automaticamente.** Versões por coletânea são desejáveis (`SAME_SONG_DIFFERENT_VERSION` → importar como novo song na pasta 2022).

---

## 9. Importação em lote

Entrada exemplo: `imports/incoming/2022/` com `*.pptx|ppt|pdf|docx|txt`.

Relatório agregado:

```text
Import Report
Arquivos: 120
Processados: 118
Com sucesso: 105
Revisão necessária: 10
Falhas: 3
Novos louvores: 82
Possíveis duplicatas: 21
SAME_SONG_DIFFERENT_VERSION: N
```

Por arquivo:

```text
arquivo, tipo, #louvores, sucesso, avisos, erros,
duplicidades, campos inferidos, confidence média
```

---

## 10. Amostra obrigatória antes do lote completo (PPTX 2022)

Selecionar e validar visualmente:

- louvor simples
- com CORO
- com BIS
- com 2x / 3x
- muitos versos / curto
- layout diferente
- com imagem / gráfico (se houver)
- possível duplicata vs 2018

Comparar: PPTX original × JSON gerado × projeção Reveal.

---

## 11. Critérios de não-regressão

Após merge da Coletânea 2022, verificar em 2018 / Antiga / CIA:

- busca, pasta, projeção, slides, CORO, BIS, Nx
- navegação, favoritos/edição, exportação JSON

Não alterar songs existentes no merge — apenas **adicionar** pasta (ou songs aprovados).
