# Homologação com Docker (VM local)

Roteiro rápido para rodar o sistema na VM do seu notebook, para a equipe
testar antes do deploy definitivo. Já foi testado ponta a ponta (build,
subida, login, criação de usuário, restart com persistência de dados).

## Pré-requisitos na VM

- Docker + Docker Compose instalados (`docker --version`, `docker compose version`)
- Repositório clonado

## 1. Configurar o segredo de sessão

```bash
cd sistema-hora-extra
echo "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .env
```

Se a VM não tiver Node instalado, gere a variável em qualquer outra
máquina e cole no `.env` manualmente — só precisa ser uma string longa e
aleatória.

## 2. Subir o sistema

```bash
docker compose up -d --build
docker compose logs -f app   # Ctrl+C para sair do log, o container continua rodando
```

O site fica em `http://<IP-da-VM>:3000` (ou `http://localhost:3000` se
você acessar direto na VM).

## 3. Criar o primeiro líder

Ainda não existe tela de "primeiro acesso" — é preciso criar a primeira
conta líder pelo terminal, uma única vez:

```bash
docker compose exec app node scripts/criar-usuario.js "Thomaz Perini" thomaz.perini@redeunifique.com.br lider "SenhaTemporariaForte1"
```

Depois disso, Thomaz loga normalmente, troca a senha (obrigatório no
primeiro acesso) e cadastra o resto da equipe pela tela **Gestão de
usuários** — sem precisar mais do terminal.

## 4. Compartilhar com a equipe

Descubra o IP da VM na rede (`ip addr` ou `hostname -I` dentro dela) e
passe `http://<esse-IP>:3000` para o time testar. Como é HTTP puro (sem
HTTPS), só use isso em rede interna/confiável — nunca exponha essa porta
direto na internet.

## Comandos úteis

```bash
docker compose logs -f app        # acompanhar logs
docker compose restart app        # reiniciar o app (dados persistem no volume)
docker compose down               # parar tudo (dados continuam no volume)
docker compose down -v            # parar E apagar os dados (cuidado!)
docker compose up -d --build      # reconstruir apos alguma mudanca no codigo
```

## Diferenças em relação ao deploy definitivo (`deploy/README.md`)

Isso aqui é só para **homologação interna**, não é o deploy final:
- Sem Caddy/HTTPS — HTTP puro, adequado só para rede local/VPN
- Sem systemd — o Docker Compose cuida de reiniciar o container
  (`restart: unless-stopped`), mas não sobrevive a um reboot da VM a
  menos que o Docker esteja configurado para iniciar no boot
- Sem backup automatico — os dados ficam no volume Docker
  (`sistema-hora-extra_dados-horas-extras`); se for testar por muito
  tempo, faca um backup manual:
  ```bash
  docker compose exec app sh -c "sqlite3 /data/dados.sqlite '.backup /data/backup-manual.sqlite'"
  docker compose cp app:/data/backup-manual.sqlite ./backup-manual.sqlite
  ```

Quando a homologação validar o sistema, o deploy real segue
`deploy/README.md` (VM 24/7 com systemd + Caddy + backup automático). O
mesmo `Dockerfile`/`docker-compose.yml` também pode virar a base desse
deploy definitivo mais adiante, se preferirem continuar com Docker em vez
de systemd direto — hoje o README cobre o caminho sem Docker porque foi o
combinado originalmente.
