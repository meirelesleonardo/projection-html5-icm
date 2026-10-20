---
name: commits-organizados
description: >-
  Agrupa alterações locais em commits convencionais (feat, fix, docs, style,
  refactor, test, chore) neste repositório. Use when the user says "Faça o
  commit", "faça os commits" or "commits organizados". Never push unless the
  user says "faça os commits com push" or "faça depois o push". Always leave
  server/sync-config.json, server/certs/*.pem, dist/ and
  tools/windows-pack/.cache/ unstaged.
argument-hint: 'Faça o commit (sem push, salvo pedido explícito)'
user-invocable: true
disable-model-invocation: false
---

# Commits organizados

## Outcome

Um commit por assunto, mensagem convencional em português, config local e artefato de build de fora. Sem push, salvo pedido explícito.

## Quando usar

- «Faça o commit», «faça os commits», «commits organizados»
- Push só com «faça os commits com push» ou «faça depois o push» (ou pedido explícito equivalente de enviar ao remoto)

Sem uma dessas frases de push, não enviar nada ao remoto.

## Procedimento

1. Em paralelo: `git status`, `git diff`, `git diff --cached`, `git log -8 --oneline`.
2. Agrupar por assunto (código de uma fatia, correção isolada, documentação, ajuste de aparência, refactor, teste, manutenção). Um commit por grupo. Não misturar assuntos no mesmo commit.
3. Se não houver alteração commitável, não criar commit vazio. Dizer o que ficou de fora.
4. Mensagem: `tipo: assunto` em português, foco no porquê. Corpo opcional. Só estes tipos:

| Tipo | Quando |
| --- | --- |
| feat | Adiciona uma nova funcionalidade ao projeto. |
| fix | Corrige um bug ou problema no projeto. |
| docs | Altera a documentação do projeto. Ex.: README, comentários no código. |
| style | Realiza mudanças na aparência, sem alterar a funcionalidade. |
| refactor | Realiza mudanças no código que não alteram a funcionalidade. |
| test | Adiciona ou modifica testes no projeto. |
| chore | Tarefas de manutenção e outras mudanças que não afetam diretamente o código de produção ou testes, mas são importantes para o desenvolvimento do projeto. |

5. Nunca incluir, mesmo modificados: `server/sync-config.json`, `server/certs/*.pem`, `dist/` e `tools/windows-pack/.cache/`. O primeiro guarda o token da VPS; os `.pem` são a chave TLS; `dist/` é o zip/`ProjecaoICM.exe` gerado; `.cache/` é o Node baixado só para empacotar. Se o usuário pedir para commitar algum deles, avisar o risco e não incluir sem confirmação explícita de que aceita o risco.
6. Não commitar segredo (`.env`, senha, token, credencial). Se `server/config.json` tiver `syncToken` preenchido, deixar esse arquivo de fora e avisar: o token não entra no git (o exemplo versionado é `server/sync-config.example.json`, com token de mentira). Não alterar `git config`. Não usar `--no-verify`, `--amend`, rebase interativo nem force push.
7. Neste ambiente (bash no Linux): passar a mensagem por HEREDOC, `git commit -m "$(cat <<'EOF' … EOF)"`. Não usar a forma de PowerShell.
8. Um grupo por vez: `git add` só dos arquivos daquele grupo, depois o commit. Se `.git/index.lock` existir e não houver outro `git` em execução, remover o lock e repetir o commit que falhou. Não fazer amend.
9. Conferir com `git status` e `git log`. Reportar hash, mensagem e o que ficou de fora.
10. Push somente depois dos commits, e só se o pedido trouxer «faça os commits com push» ou «faça depois o push». `git push` da branch atual; `-u` só se ainda não houver upstream. Nunca `--force`.
