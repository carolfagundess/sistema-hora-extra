# Controle de Horas Extras

Sistema web interno para lançamento e aprovação de horas extras, do setor
de Configuração e Relacionamento Corporativo (CRC), substituindo a
planilha atual. Uso restrito a esse setor — não há conceito de múltiplas
equipes ou setores dentro do sistema.

## Stack
- Node.js + Express
- SQLite (better-sqlite3), migrações versionadas em /migrations
- Páginas renderizadas no servidor (EJS), CSS simples
- Deploy: Linux, systemd, proxy reverso (Caddy/Nginx) com HTTPS

## Perfis
- colaborador: lança horas e vê só o próprio histórico e saldo
- sublider: colaborador com permissões de líder (aprova/reprova e vê
  relatórios de todo o setor, além de lançar as próprias horas); substitui
  o líder, sempre ativo, sem necessidade de "ausência" para valer
- lider: não lança horas; sua experiência no sistema é só controle das
  demandas — aprova/reprova (mesmo escopo do sublider) e acompanha por um
  dashboard, mais gestão de usuários (exclusiva do líder)

## Modelo de dados
- usuarios: id, nome, email (único, identificador), senha_hash (opcional),
  perfil, gestor_id, ativo, trocar_senha
- lancamentos: id, usuario_id, data, hora_inicio, hora_fim, total_minutos
  (calculado pelo servidor), motivo, status (pendente|aprovado|reprovado),
  aprovador_id, decidido_em, comentario, criado_em

## Regras de negócio
- O total é sempre calculado pelo servidor; nunca digitado.
- Colaborador só edita/exclui lançamento pendente; aprovado é imutável.
- Sublider e líder aprovam/decidem qualquer lançamento pendente do setor.
- Líder não tem acesso à tela de lançamento (não lança horas).
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
2. Meus lançamentos (formulário + lista com status + total do mês) — colaborador e sublider
3. Painel de aprovação (fila de pendentes, aprovar/reprovar, comentário, lote) — sublider e líder; tela inicial do líder
4. Visão do setor (total por pessoa/mês, filtros, exportar Excel) — dashboard do líder
5. Gestão de usuários (só líder)

## Etapas
1. Projeto base, banco, migrações, seed com usuários de teste dos 3 perfis
2. Autenticação local + middleware de perfis
3. Tela de lançamento do colaborador
4. Painel de aprovação
5. Visão do setor + exportação
6. Testes de permissão entre perfis
7. Deploy (systemd, HTTPS, backup diário do .sqlite)

## Convenções
- Datas/horas em horário local do Brasil; total em minutos no banco.
- Código simples e comentado; sem dependências desnecessárias.
- Testar cada regra de permissão com usuários de perfis diferentes.
