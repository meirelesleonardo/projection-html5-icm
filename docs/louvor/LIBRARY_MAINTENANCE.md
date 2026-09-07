# Manutenção da biblioteca de louvores

## Regra absoluta

**Não edite `data/data.json` manualmente** no fluxo normal de manutenção.

Esse arquivo é um **artefato gerado/persistido pelo sistema** (gravação atômica via `PUT /api/library` ou aplicação de importação).

### Fluxo correto

```text
arquivo de origem (PPTX/TXT/DOCX/PDF)
      ↓
Importar coletânea (UI desktop) / API /api/imports
      ↓
staging em data/imports/<id>/
      ↓
revisão + aprovação
      ↓
backup automático
      ↓
data.json atualizado atomicamente
```

### Correções pontuais

- Editar louvor na UI desktop e **Salvar no servidor**
- Reimportar a coletânea (merge por número / iN)
- Restaurar backup: menu Importar/Exportar → **Backups da biblioteca…**

### Ferramentas

- UI: `index.html` → Importar coletânea…
- API: ver `docs/louvor/IMPORT_PIPELINE_SPEC.md` e rotas `/api/imports*`
- CLI experimental: `tools/louvor-import/` (não grava `data.json` sozinho)

Documentação de formato: [LOUVOR_FORMAT_SPEC.md](./LOUVOR_FORMAT_SPEC.md).
