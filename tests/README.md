# Testes automatizados

Suite de testes do sistema de horas extras. Nao usa nenhuma dependencia nova: so o
que ja vem no Node 22 (`node:test`, `node:assert`, `fetch`, `node:sqlite`).

## Como rodar

Requisitos: Node >= 22.5 e `npm ci` ja executado (os testes sobem o servidor de verdade).

```bash
node --disable-warning=ExperimentalWarning --test          # tudo (~40 s)
node --test tests/03-aprovacao.test.js                      # um arquivo
node --test --test-name-pattern="desativado" tests/         # por nome
```

Sugestao de atalho no `package.json`, em `scripts`:

```json
"test": "node --disable-warning=ExperimentalWarning --test"
```

Depois e so `npm test`.

## Isolamento (nao mexe em nada seu)

- Cada arquivo `*.test.js` sobe o **proprio servidor** numa porta livre, com um banco
  SQLite **temporario** (apagado no fim). Seu `dados.sqlite` e o volume do Docker nao sao tocados.
- Nao precisa de Docker nem de `.env`.
- Os arquivos rodam em paralelo; cada um tem seus usuarios e seu banco.

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `01-permissoes` | Matriz lider/sublider/colaborador por rota, POSTs negados, visitante anonimo, 404, logout, troca de senha obrigatoria, **usuario desativado** |
| `02-lancamentos` | Calculo do total no servidor, validacao de hora/data/motivo, editar/excluir (so o proprio e so pendente), "Aprovado no mes" |
| `03-aprovacao` | Ninguem aprova o proprio, quem/quando registrados, decisao em lote, re-decisao, decisao invalida, ids maliciosos |
| `04-usuarios` | Cadastro, e-mail normalizado e duplicado, editar, nao rebaixar a si mesmo, redefinir e trocar senha |
| `05-relatorio` | Totais por status e por mes, inativos fora, `mes` invalido, exportacao `.xlsx` (abre e confere as abas) |
| `06-seguranca` | Login malformado **nao derruba o servidor**, bloqueio por tentativas, cookie (HttpOnly/SameSite), XSS, SESSION_SECRET obrigatorio |
| `07-fuso-horario` | Virada de mes no fuso de Brasilia (relogio do servidor congelado por `fake-date.js`) |
| `08-auth-unidade` | Modulo `auth` direto, em memoria: bloqueio que expira em 15 min, usuario inativo, sessao |
| `09-servicos-unidade` | Regras de negocio direto: datas/horas, totais, aprovacao, usuarios |

`helpers.js` tem o cliente HTTP com cookies, a subida do servidor e o cenario padrao
(1 lider, 1 sublider, 2 colaboradores). `fake-date.js` congela a data do servidor.

## O que NAO esta coberto

- **CSRF por token**: hoje a defesa e so `SameSite=Lax`. Esta como `test.todo` em `06-seguranca`.
- Aparencia/JavaScript das telas no navegador (os testes olham status HTTP, HTML e banco).
- Build da imagem Docker e `docker compose` (os testes rodam o Node direto).
- HTTPS/Caddy, backup, persistencia do volume entre reinicios, carga.

## Ao ver uma falha

1. Rode so o arquivo que falhou e leia a mensagem (`esperado !== recebido`).
2. O nome do teste diz a regra de negocio violada. Se o teste esta certo e o codigo errado,
   corrija o **codigo**; nao relaxe o teste.
3. Se o servidor caiu no meio, o log dele sai na mensagem de erro de `iniciarAmbiente`.

## Prompt sugerido para o Claude Code

> Rode `node --disable-warning=ExperimentalWarning --test` neste projeto. Para cada
> falha, diga se o erro esta no codigo ou no teste, mostre o trecho e o motivo, e so
> entao proponha a correcao minima no codigo (nunca afrouxe um teste para ele passar).
> Ao final, rode a suite inteira de novo e me de o resumo de passou/falhou.
