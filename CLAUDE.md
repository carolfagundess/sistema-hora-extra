# Controle de Horas Extras

Sistema web interno para lançamento e aprovação de horas extras da equipe,
substituindo a planilha atual.

## Stack
- Node.js + Express
- SQLite (better-sqlite3), migrações versionadas em /migrations
- Páginas renderizadas no servidor (EJS), CSS simples
- Deploy: Linux, systemd, proxy reverso (Caddy/Nginx) com HTTPS

## Perfis
- colaborador: lança horas e vê só o próprio histórico e saldo
- sublider: colaborador com permissões de líder (aprova/reprova e vê
  relatórios da própria equipe); substitui o líder, sempre ativo, sem
  necessidade de "ausência" para valer
- lider: sempre tem uma única equipe (nunca vê outras equipes); mesmo
  escopo de aprovação e relatórios do sublider da sua equipe, mais gestão
  de usuários (exclusiva do líder)

## Modelo de dados
- usuarios: id, nome, email (único, identificador), senha_hash (opcional),
  perfil, equipe, gestor_id, ativo, trocar_senha
- lancamentos: id, usuario_id, data, hora_inicio, hora_fim, total_minutos
  (calculado pelo servidor), motivo, status (pendente|aprovado|reprovado),
  aprovador_id, decidido_em, comentario, criado_em

## Regras de negócio
- O total é sempre calculado pelo servidor; nunca digitado.
- Colaborador só edita/exclui lançamento pendente; aprovado é imutável.
- Sublider e líder só aprovam/decidem lançamentos de usuários da própria
  equipe (nenhum perfil vê ou decide sobre outras equipes).
- Ninguém aprova o próprio lançamento.
- Toda decisão registra quem e quando.
- Permissões SEMPRE validadas no backend (middleware), nunca só na tela.

## Autenticação (MVP)
- Login local por e-mail + senha (bcrypt/argon2), sessão por cookie
  httpOnly/secure com expiração, limite de tentativas de login.
- Líder cadastra usuários e define senha inicial; troca obrigatória no
  primeiro acesso; redefinição feita pelo líder.
- Isolar tudo em um módulo `auth` (funções como getUsuarioLogado). Fase 2
  troca por login Microsoft (Entra ID, single-tenant) sem mexer no resto;
  o e-mail corporativo é o identificador.

## Telas
1. Login
2. Meus lançamentos (formulário + lista com status + total do mês)
3. Painel de aprovação (fila de pendentes, aprovar/reprovar, comentário, lote)
4. Visão da equipe (total por pessoa/mês, filtros, exportar Excel)
5. Gestão de usuários (só líder)

## Etapas
1. Projeto base, banco, migrações, seed com usuários de teste dos 3 perfis
2. Autenticação local + middleware de perfis
3. Tela de lançamento do colaborador
4. Painel de aprovação
5. Visão da equipe + exportação
6. Testes de permissão entre perfis
7. Deploy (systemd, HTTPS, backup diário do .sqlite)

## Convenções
- Datas/horas em horário local do Brasil; total em minutos no banco.
- Código simples e comentado; sem dependências desnecessárias.
- Testar cada regra de permissão com usuários de perfis diferentes.