# SPEC-13 — Aceite no PC Windows

## Objetivo

Confirmar no PC Windows o que este Linux não executa: navegador padrão, firewall, QR e a base gravada na pasta do exe.

## Atores

Operador do projetor, celular no hotspot.

## Fluxos

1. Descompactar `dist/ProjecaoICM-win64.zip`.
2. Executar `ProjecaoICM.exe`.
3. Seguir o checklist de [windows-exe.md](../windows-exe.md).

## Critérios de aceite

- [ ] Duplo clique abre o console e o navegador em `/view.html` com o QR.
- [ ] Segundo clique não derruba o servidor: só traz a view de volta.
- [ ] O celular no hotspot abre o painel pelo QR.
- [ ] Gravar um louvor e reabrir o exe mantém a alteração em `data/data.json`.
- [ ] Permitir o firewall em rede privada deixa o celular alcançar a porta 3080.

Estes itens são manuais. Neste Linux a prova automática é a de SPEC-10, SPEC-11 e SPEC-14.

## Fora de escopo

Teste automático do binário Windows via Wine.

## Dependências

SPEC-10, SPEC-11, SPEC-12.
