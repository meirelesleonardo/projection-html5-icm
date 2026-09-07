# Louvor import pipeline (CLI)

Ferramenta offline para extrair/normalizar/validar louvores. **Não grava** `data/data.json`.

Ver especificação: [`docs/louvor/`](../../docs/louvor/).

## Comandos

```bash
# Round-trip das fixtures
node tools/louvor-import/cli.js roundtrip-check
node --test tools/louvor-import/test/*.test.js

# Extrair amostra do PPTX 2022 (staging em imports/)
node tools/louvor-import/cli.js sample-2022

# Importar arquivo ou pasta → imports/{extracted,normalized,review,approved,reports}
node tools/louvor-import/cli.js import caminho/arquivo.pptx --collection 2022
node tools/louvor-import/cli.js import imports/incoming/ --collection 2022

# Só extrair (stdout resumo)
node tools/louvor-import/cli.js extract arquivo.txt --collection 2022
```

## Dependências de sistema

- `unzip` (PPTX/DOCX)
- `pdftotext` (PDF) — pacote `poppler-utils`

Sem pacotes npm extras.
