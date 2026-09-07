# presentation-rules.md

Regras visuais derivadas da estatística da base e do comportamento do projetor.

---

## Separadores

**CONFIRMADA**

| Elemento | Sintaxe |
|----------|---------|
| Novo slide | `\n\n` |
| Nova linha no slide | `\n` |
| Render linha | `\n` → `<br>` |

Documentação histórica (`docs/index.md`): *“Uma linha vazia faz a separação dos slides”*.

---

## Densidade alvo (texto puro / modo normalized)

Valores medidos (HTML stripado, 2026-09-07):

### Linhas por página

| Coleção | média | moda | p95 | máx |
|---------|------:|-----:|----:|----:|
| Coletânea 2018 | 6.04 | 5 | 9 | 13 |
| Coletânea Antiga | 6.13 | 5 | 9 | 13 |
| CIA 2018 | 5.97 | 5 | 9 | 19 |
| Avulsos 2018 | 6.08 | 4 | 9 | 15 |

### Caracteres / palavras por linha

| Coleção | chars méd | chars p95 | chars máx | words méd | words máx |
|---------|----------:|----------:|----------:|----------:|----------:|
| Coletânea 2018 | 23.7 | 37 | 52 | 4.59 | 13 |
| Coletânea Antiga | 22.5 | 36 | 59 | 4.37 | 14 |
| CIA 2018 | 16.8 | 25 | 45 | 3.29 | 10 |
| Avulsos 2018 | 24.1 | 38 | 54 | 4.74 | 12 |

### Páginas por louvor

Média global ~3.9; moda 4; máx 24.

---

## Regras propostas para o formatter

Marcadas como **INFERÊNCIA PROVÁVEL** (não hardcoded no app):

1. Preferir **5–6 linhas** por slide.
2. Soft max **9 linhas** (p95); acima → `needsReview`.
3. Preferir linhas ≤ **38 caracteres** (p95 adultas); CIA pode mirar ≤ **25**.
4. Evitar linhas com 1 palavra isolada no meio do verso quando possível.
5. Label `CORO` / `FINAL` / `INSTRUMENTOS` em linha própria, amarelo itálico.
6. Não misturar início de CORO no meio de um slide de verso se a fonte estruturada separava.
7. Preservar slides do PPTX quando densidade já estiver dentro da faixa ICM.

---

## Chaves gráficas

Classes suportadas em CSS (`css/view.css`):

- `chave-bis`, `chave-bis-small`, `chave-bis-no-final`
- `chave-2x` … `chave-6x` e variantes `-small`

**EXCEÇÃO / DESCONHECIDO:** `imagens/chaves-bis-alla-fine.png` existe sem classe CSS correspondente — não usar até haver suporte.

Preferência observada na base: `chave-bis-small` e `chave-bis` para BIS; Nx quase sempre em texto `(Nx)` em vez de chave.

---

## Tema visual do projetor

**CONFIRMADA** — independente do song:

- Reveal fade, 1920×1080
- Fundos de configuração (`fundo.jpg`, etc.)
- Cabeçalho com título do louvor
- Labels amarelos contrastam no fundo escuro/imagem

O importador não precisa embutir fundo no `content`.
