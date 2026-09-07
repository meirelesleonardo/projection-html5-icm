# known-exceptions.md

Exceções e outliers observados na base e no PPTX 2022.

---

## Base JSON

| Exceção | Detalhe | Nível |
|---------|---------|-------|
| Sem pasta “2008” | Equivalente = **Coletânea Antiga** | **CONFIRMADA** |
| Título vazio | 1 song em Avulsos 2018 | **EXCEÇÃO** |
| Sem número no título | Avulsos 2018 (regra da pasta); 1 em Coletânea 2018 (`AQUILO QUE FUI…`) | **EXCEÇÃO** / convenção |
| Número 687 duplicado / 688 ausente | Coletânea 2018 | **EXCEÇÃO** |
| Numeração Antiga em faixas altas | muitos `2000+`, um `9999` | **EXCEÇÃO** |
| Páginas com 19 linhas | CIA 2018 | **EXCEÇÃO** |
| Máx 59 chars/linha | Coletânea Antiga | **EXCEÇÃO** |
| Labels `CORO:` / `FINAL` sem `:` | variantes | **EXCEÇÃO** |
| Italiano `Finale:` | pasta Prova | **EXCEÇÃO** |
| `(M)` / `(H)` | cues de voz | **EXCEÇÃO** rara |
| HTML em 549 songs ausente | texto puro válido | **CONFIRMADA** (não é erro) |
| `chave-Nx` quase não usado | Nx via texto amarelo | **CONFIRMADA** |
| Asset alla-fine sem CSS | `chaves-bis-alla-fine.png` | **DESCONHECIDO** / morto |
| Autores / refs | inexistentes como campos | **CONFIRMADA** |
| INTRO / SOLO / PONTE tipados | 0 marcadores | **DESCONHECIDO** |

---

## Falsos positivos a evitar

| Texto | Não é |
|-------|-------|
| “ponte” na letra | seção PONTE |
| “solo” (solo = chão, Hino Nacional) | SOLO musical |
| “BIS” no meio de frase sem markup | marcador (avaliar contexto) |

---

## PPTX 2022

| Exceção | Detalhe |
|---------|---------|
| Números faltando | 175, 255, 645, 690, 693 (na amostragem de markers) |
| Slide índice / encerramento | não são louvores |
| Hiperlink “Índice” | navegação, não título |
| Pouquíssimas notas | notes slides quase vazios |
| Só 4 imagens | não é coletânea gráfica pesada |
| Transição fade em todos | não há builds |

---

## Implicações para o importador

1. Aceitar variantes de label; normalizar no formatter.
2. Não falhar o lote por um título sem número se a pasta destino permitir (Avulsos); para Coletânea 2022, preferir `N - TÍTULO`.
3. Outliers de densidade → `needsReview`, não rejeição cega.
4. Manter lista desta página atualizada quando novos outliers aparecerem no staging.
