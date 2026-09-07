# LOUVOR_FORMAT_SPEC

Especificação do padrão de louvores usado pela aplicação ICM.  
Valores e regras marcados com evidência a partir de `data/data.json` (2462 songs, análise de 2026-09-07) e do código de projeção.

---

## 1. Estrutura do louvor

**CONFIRMADA**

```text
Library = Folder[]
Folder  = {
  name:  string,   // nome da coletânea / pasta
  type:  "s",      // sempre "s" (songs)
  lang:  string,   // "pt" | "en" | "it" (uso real)
  songs: Song[]
}
Song = {
  title:   string,
  content: string
}
```

Não existem campos `id`, `number`, `author`, `slides`, `source`, `chorus` no documento oficial.

Identidade em runtime: índices de array `folderId` + índice do song na pasta.

Limites do validador (`server/library-validate.js`):

| Limite | Valor |
|--------|------:|
| Pastas | ≤ 500 |
| Songs/pasta | ≤ 20000 |
| `title` | ≤ 2000 chars |
| `content` | ≤ 500000 chars |
| Biblioteca | ≤ 15 MiB |

---

## 2. Identificação

**CONFIRMADA**

- Louvor identificado por posição na pasta, não por UUID.
- Título exibido na árvore e na barra do projetor = `song.title`.
- Busca desktop: query não numérica → título **ou** content; query só dígitos → título.

---

## 3. Coletânea

**CONFIRMADA**

Coletânea = pasta (`Folder.name`). Não há campo `year` / `collectionId`.

Pastas observadas:

| name | lang | #songs |
|------|------|------:|
| Coletânea 2018 | pt | 795 |
| CIA 2018 | pt | 241 |
| Avulsos 2018 | pt | 531 |
| Coletânea Antiga | pt | 892 |
| Test | en | 1 |
| Prova | it | 1 |
| Avulsos | pt | 1 |

**INFERÊNCIA PROVÁVEL:** “Coletânea Antiga” corresponde à linha histórica referida como Coletânea 2008. Não há string `"2008"` na base.

**CONFIRMADA (proposta de importação):** nova coletânea = nova pasta, ex.: `"Coletânea 2022"`.

---

## 4. Versos / estrofes / slides

**CONFIRMADA**

- Conteúdo = uma única string.
- **Slide / página** = bloco separado por linha em branco (`\n\n`).
- Código: `content.split('\n\n')` em `js/core.js` / `js/mobile.js`.
- Dentro do slide, `\n` vira `<br>` na projeção.
- Não há array JSON de versos ou estrofes.

Estatística global (HTML stripado): média **3,91** slides/song (min 1, max 24; moda 4).

---

## 5. Coro

**CONFIRMADA**

Representado como marcador visual amarelo itálico, tipicamente abrindo o bloco:

```html
<font color="yellow"><i>CORO</i></font>
```

Variantes observadas (contagens aproximadas de labels amarelos):

| Label | ~ocorrências |
|-------|-------------:|
| CORO | 2021 |
| CORO (2X) | 320 |
| CORO: | 63 |
| CORO: (2X) | 13 |

Não é campo estrutural. A app não “repete o coro” automaticamente.

---

## 6. BIS

**CONFIRMADA** — duas formas coexistentes:

### 6.1 Inline (texto)

```html
<font color="yellow"><i>(BIS)</i></font>
<!-- ou -->
<font color="yellow"><i>BIS</i></font>
```

### 6.2 Chave gráfica (blockquote)

```html
<blockquote class="chave-bis">…linhas…</blockquote>
<blockquote class="chave-bis-small">…</blockquote>
```

CSS em `css/view.css` desenha a chave via `::after` + PNGs em `imagens/chaves-*.png`.

A letra **não** é duplicada no JSON; BIS é pista para o operador.

---

## 7. Repetições (2x, 3x, …)

**CONFIRMADA**

1. Texto amarelo: `(2X)`, `(3X)`, `(4X)`, `(5X)`, `CORO (2X)`, etc.
2. Classes CSS (uso raro na base): `chave-2x`, `chave-3x`, … até `chave-6x` (+ `-small`).

Contagem de `chave-*` na base: `chave-bis-small` 178, `chave-bis` 163; `chave-Nx*` ≤ 2 cada.

---

## 8. Slides / apresentação no JSON

**CONFIRMADA**

O JSON **é** a especificação de apresentação:

```text
slide1_line1
slide1_line2

slide2_line1
…
```

Mais HTML inline para marcadores e chaves.

---

## 9. Limite de linhas (por slide)

| Métrica | Valor | Evidência |
|---------|------:|-----------|
| Média linhas/página | ~5,9–6,1 | todas as pastas principais |
| Moda | 5 (Avulsos 2018 moda 4) | **CONFIRMADA** |
| p95 | 9 | **CONFIRMADA** |
| Máximo observado | 13 (coletâneas) / 19 (CIA) | **EXCEÇÃO** no CIA |

**INFERÊNCIA PROVÁVEL (alvo para paginação automática de texto puro):**

- Preferir 5–6 linhas/slide
- Soft max 9 (p95)
- Hard review se > 9

---

## 10. Limite de caracteres / palavras

| Métrica | Média | p95 | Máx | Escopo |
|---------|------:|----:|----:|--------|
| chars/linha | ~22–24 | ~36–38 | 52–59 | Coletânea 2018 / Antiga / Avulsos |
| words/linha | ~4,4–4,7 | — | 13–14 | idem |
| CIA chars/linha | ~16,8 | 25 | 45 | CIA (linhas mais curtas) |

**INFERÊNCIA PROVÁVEL:** alvo ≤ ~38 chars/linha (p95 das coletâneas adultas); alertar acima de 50.

---

## 11. Regras de quebra

**CONFIRMADA (mecanismo):** apenas `\n` e `\n\n` no `content`.

**INFERÊNCIA PROVÁVEL (observável no padrão editorial):**

1. Não partir uma frase no meio quando evitável.
2. CORO frequentemente inicia um slide próprio.
3. FINAL costuma ficar no último slide.
4. INSTRUMENTOS aparece como slide/cue curto.
5. Chaves `blockquote` envolvem o trecho a repetir, não o louvor inteiro.

Não há algoritmo de wrap no código — a quebra já vem pronta no JSON.

---

## 12. Elementos especiais

Labels amarelos com evidência relevante:

| Elemento | Status |
|----------|--------|
| CORO | **CONFIRMADA** |
| BIS / (BIS) | **CONFIRMADA** |
| FINAL: / FINAL | **CONFIRMADA** |
| INSTRUMENTOS | **CONFIRMADA** (muito comum) |
| Nx / (Nx) | **CONFIRMADA** |
| VARÕES / SERVAS | **CONFIRMADA** |
| (M) / (H) | **CONFIRMADA** (raro) |
| REPETE ESTROFE / REPETIR O LOUVOR | **CONFIRMADA** (raro) |
| INTRO | **DESCONHECIDO** — 0 ocorrências como marcador |
| SOLO | **DESCONHECIDO** — sem marcador estrutural |
| PONTE | **DESCONHECIDO** — só palavra na letra |

---

## 13. Casos excepcionais

Ver [known-exceptions.md](./known-exceptions.md).

---

## 14. Regras de validação (oficial + importação)

### Oficial (já no servidor)

- Tipos e limites de `library-validate.js`.
- `title` pode ser string vazia (1 caso em Avulsos 2018) — **EXCEÇÃO**.

### Importação (propostas — ver validation-rules.md)

- Todo song aprovado deve ter `title` e `content` não vazios (mais estrito que o validador atual).
- Slides separados por `\n\n`.
- Marcadores normalizados para o HTML ICM quando `confidence` alta.
- Não gravar campos extras em `data.json`.
