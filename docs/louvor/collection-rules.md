# collection-rules.md

Regras de coletâneas / pastas.

---

## Representação

**CONFIRMADA**

- Uma coletânea = um objeto pasta no array de `data.json`.
- Identidade = string `name` (sem slug/year separado).
- `type` deve ser `"s"`.
- `lang` tipicamente `"pt"`.

Criação na UI desktop: nome livre + idioma.

---

## Pastas atuais e convenções de título

| Pasta | Numeração no `title` | Notas |
|-------|----------------------|-------|
| Coletânea 2018 | `N - TÍTULO` | 794/795 numerados; dup 687; falta 688; 1 sem número |
| Coletânea Antiga | `001 - …` / faixas 1000+/2000+ | linha histórica (**INFERÊNCIA:** “2008”) |
| CIA 2018 | `01 - …` padded | infantil/intermediário |
| Avulsos 2018 | sem número | títulos livres; 1 título vazio |
| Test / Prova | demos | en / it |

---

## Múltiplas coletâneas do mesmo louvor

**CONFIRMADA (requisito de produto) / INFERÊNCIA de modelagem:**

O mesmo louvor lógico pode existir em Antiga, 2018 e 2022 com:

- mesmo ou outro número
- letra ligeiramente diferente
- quebras/BIS/CORO diferentes

**Regra:** não tratar como duplicata a eliminar só por título.  
São **versões por coletânea** → songs distintos em pastas distintas.

Busca deve continuar mostrando o nome da pasta (já ocorre na árvore jsTree / UI mobile).

---

## Coletânea 2022

**Proposta CONFIRMADA neste desenho:**

- Nova pasta: `"Coletânea 2022"`, `type: "s"`, `lang: "pt"`.
- Não sobrescrever Coletânea 2018.
- Fonte principal: `docs/01.COLETÂNEA_IGREJAS-2022_PROJETOR-4.3.pptx` (índice: “EDIÇÃO 2018 / ATUALIZAÇÃO 21.08.2022” → overlap esperado com 2018).

Classificar matches contra 2018 como `SAME_SONG_DIFFERENT_VERSION` na maioria dos casos, não como bloqueio.

---

## CIA e Avulsos

- CIA: pode exigir caminho híbrido (texto + deck) se a fonte futura for gráfica — ver PRESENTATION_COMPATIBILITY.
- Avulsos: sem número; título é a chave principal de busca.
