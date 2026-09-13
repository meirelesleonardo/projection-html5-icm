# Manutenção da biblioteca de louvores

## Regra absoluta

**Não edite `data/data.json` manualmente** no fluxo normal de manutenção.

Esse arquivo é um **artefato gerado/persistido pelo sistema** (gravação atômica via `PUT /api/library`, arquivamento dedicado ou aplicação de importação).

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

### Remover / arquivar louvores

No uso diário **não se apaga** o louvor do `data.json`. O botão de lixeira **arquiva**:

1. Selecionar pasta ou louvor na árvore → lixeira
2. Digitar o **título/nome exato**
3. Motivo opcional
4. Confirmar (usa o PIN da sala)

Itens arquivados somem da árvore e da projeção (`archived: true`).

**Exclusão definitiva** ou **restauração**:

- Menu Importar/Exportar → **Manutenção da biblioteca…**
- Lista pastas/louvores arquivados
- **Restaurar** ou **Excluir** (pede o título de novo + PIN)

APIs dedicadas (não usam PUT da biblioteca inteira):

- `POST /api/library/songs/archive` / `restore`
- `DELETE /api/library/songs` (só se já arquivado)
- `POST /api/library/folders/archive` / `restore`
- `DELETE /api/library/folders` (só se já arquivada)
- `GET /api/library/archived`

### Ferramentas

- UI: `index.html` → Importar coletânea… / Manutenção da biblioteca…
- API: ver `docs/louvor/IMPORT_PIPELINE_SPEC.md` e rotas `/api/imports*`
- CLI experimental: `tools/louvor-import/` (não grava `data.json` sozinho)

Documentação de formato: [LOUVOR_FORMAT_SPEC.md](./LOUVOR_FORMAT_SPEC.md).
