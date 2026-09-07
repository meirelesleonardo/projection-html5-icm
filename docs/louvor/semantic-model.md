# semantic-model.md

Modelo semântico implícito na base atual. O JSON oficial não tipa seções; a semântica vive dentro de `content`.

---

## Song oficial

**CONFIRMADA**

```json
{ "title": "2 - O SANGUE DE JESUS TEM PODER PARA SALVAR", "content": "…" }
```

| Conceito | Onde vive |
|----------|-----------|
| Título | `title` |
| Número | prefixo de `title` (`N - ` / `00N - `) |
| Coletânea | `Folder.name` |
| Idioma | `Folder.lang` |
| Corpo / slides | `content` |
| Autor | **ausente** |
| Referência bíblica | **ausente** (salvo se estiver na letra) |
| ID estável | **ausente** (índice de array) |

---

## Seções no content

Tipos efetivos usados na prática (via labels amarelos / estrutura):

| type (IR) | Evidência na base |
|-----------|-------------------|
| `verse` | blocos sem label especial |
| `chorus` | `CORO`, `CORO:`, `CORO (2X)` |
| `final` | `FINAL:`, `FINAL` |
| `instruments` | `INSTRUMENTOS` |
| `part_cue` | `VARÕES`, `SERVAS`, `(M)`, `(H)` |
| `other` | resto / incerto |

**DESCONHECIDO como seção tipada:** INTRO, SOLO, PONTE, BRIDGE.

---

## Repetições

| Forma | Semântica |
|-------|-----------|
| `(BIS)` / `BIS` amarelo | repetir trecho adjacente (operador) |
| `blockquote.chave-bis*` | mesmo, com chave gráfica |
| `(2X)` … `(5X)` / `chave-Nx` | repetir N vezes |
| `CORO (2X)` | coro + indicação de repetição |
| `REPETE ESTROFE` | instrução rara |

A aplicação **não** clona o texto ao projetar.

---

## HTML permitido (convenção editorial)

**CONFIRMADA** no uso real:

- `<font color="yellow"><i>…</i></font>` — labels
- `<blockquote class="chave-…">…</blockquote>` — chaves
- ocasionalmente outras tags (`<i>`, etc.) herdadas da edição

O projetor injeta o HTML quase cru nas sections Reveal; o formatter de importação deve gerar o mesmo dialeto, não Markdown novo.

---

## IR vs oficial

O IR (ver ARCHITECTURE_PROPOSAL) tipa `sections[]` e `presentation.slides[]` para importação.  
No merge, tudo colapsa de volta para `{title, content}` — único formato que a app e o validador entendem.
