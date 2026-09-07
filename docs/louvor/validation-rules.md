# validation-rules.md

Validação na importação e critérios de aceite.

---

## 1. Validação oficial (já existente)

`server/library-validate.js` — obrigatória em qualquer merge:

- library é array de pastas
- cada pasta: `name`, `type === "s"`, `lang`, `songs[]`
- cada song: `title` string, `content` string
- limites de tamanho

O writer **só** pode emitir objetos que passem nesse validador.

---

## 2. Validação de importação (mais estrita — proposta)

Aplicada no IR / staging antes de `approved/`:

| Checagem | Severidade |
|----------|------------|
| `title` não vazio após trim | erro |
| `content` não vazio | erro |
| Pelo menos 1 slide (`\n\n` ou bloco único) | erro |
| Linhas/slide > 9 | aviso → review |
| chars/linha > 50 | aviso → review |
| Marker inferido com confidence &lt; 0.90 | review |
| Slide sem texto (só imagem) | review |
| Número duplicado **dentro da pasta destino** | aviso |
| HTML desconhecido / tags perigosas | erro ou strip |
| Campos extras no Song oficial | erro (remover) |

---

## 3. Confiança

Ver IMPORT_PIPELINE_SPEC §4.  
Qualquer inferência deve carregar `confidence` e, se necessário, `needsReview`.

---

## 4. Duplicatas

Ver IMPORT_PIPELINE_SPEC §8.

- `EXACT_DUPLICATE` na pasta destino → não aprovar automaticamente.
- `SAME_SONG_DIFFERENT_VERSION` → permitido (esperado 2018↔2022).
- `POSSIBLE_DUPLICATE` → review obrigatório.

---

## 5. Critérios de aceite do projeto (checklist)

Da demanda original — rastreáveis nesta fase 0 / fases seguintes:

- [x] Padrão 2018/Antiga documentado (docs/louvor)
- [x] Regras visuais documentadas
- [x] Modelo semântico identificado
- [x] Modelo de apresentação identificado
- [x] Capacidade real PPTX documentada
- [x] Estratégia CIA / animações / fallback documentada
- [x] Skills documentadas (esboço)
- [ ] Origem rastreável no pipeline (staging — a implementar)
- [ ] PPTX/TXT/DOCX/PDF analisáveis pelo código
- [ ] Modelo canônico IR implementado
- [ ] Duplicidades detectadas em código
- [ ] Staging/revisão/relatório/confiança em código
- [ ] Coletânea 2022 importada
- [ ] Regressão 2018/Antiga OK

Itens marcados nesta fase = documentação. Código = fases seguintes.

---

## 6. Testes de regressão (quando houver implementação)

Executar contra pastas existentes após qualquer merge:

- carga `/api/library`
- busca por número e por texto
- projeção de song com CORO, BIS, `chave-bis`
- export JSON
- não alterar `library-meta` indevidamente além do bump de versão do save
