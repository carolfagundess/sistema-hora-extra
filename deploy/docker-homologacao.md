# Homologação com Docker (VM Linux local)

Roteiro para rodar o sistema numa VM Linux no seu notebook, para a equipe
testar antes do deploy definitivo. Já foi testado ponta a ponta (build,
subida, login, criação de usuário, restart com persistência de dados) —
o que muda aqui é só o provisionamento da VM.

## 0. Provisionar a VM

Recomendado: **Alpine Linux** — ISO de ~60MB, roda bem com 512MB–1GB de
RAM, instalador 100% em texto (sem interface gráfica pesada, que é uma
causa comum de travamento em VMs com pouco recurso) e tem tudo que
precisamos (Docker, Compose, openssl, git). Se preferir algo mais
familiar, a Opção B (Ubuntu Server) também está documentada abaixo.

Em ambos os casos: crie a VM no VirtualBox/VMware/Hyper-V com rede em
modo **bridge** (não NAT) — assim ela pega um IP na sua rede local e o
resto do time consegue acessar. Rede NAT deixaria a VM visível só para o
seu notebook.

### Opção A: Alpine Linux (recomendado)

1. Baixe a ISO **Standard** (não a "virtual" nem a "netboot") em
   https://alpinelinux.org/downloads/ — arquitetura `x86_64`.
2. Crie a VM: 1 núcleo já basta (2 se sobrar), **1024MB de RAM**, disco de
   uns 4–8GB (bem menos que o Ubuntu Server precisa), rede em bridge.
3. Monte a ISO no drive óptico e inicie a VM. Ela boota direto num prompt
   de login — entre como `root` (sem senha).
4. Rode o instalador guiado:
   ```bash
   setup-alpine
   ```
   Responda as perguntas: teclado (`us` serve, ou `br` se preferir),
   hostname (ex: `horas-extras`), interface de rede `eth0` com DHCP
   (deve detectar sozinho via bridge), senha de root, fuso horário
   (`America/Sao_Paulo`), mirror de pacotes (deixe escolher
   automaticamente), usuário adicional (pode pular com Enter), disco de
   instalação: escolha `sda`, modo `sys` (instala no disco, não só na
   RAM), confirme a formatação.
5. Quando terminar, `reboot`. Remova a ISO do drive óptico (Dispositivos
   → Unidades de Disco Óptico → Remover disco) para não bootar o
   instalador de novo.
6. Logue como `root` com a senha que definiu, e instale o Docker:
   ```bash
   # habilita o repositorio "community", onde fica o pacote do docker
   sed -i 's/^#\(.*community\)/\1/' /etc/apk/repositories
   apk update
   apk add docker docker-cli-compose git openssl

   rc-update add docker boot   # sobe sozinho apos reboot da VM
   service docker start
   ```
7. Confirme: `docker --version` e `docker compose version`. Se der erro
   "unknown command" no `docker compose` (o nome do pacote varia um pouco
   entre versões do Alpine), tente `apk add docker-compose` no lugar de
   `docker-cli-compose` — nesse caso troque, em todos os comandos deste
   guia, `docker compose` por `docker-compose` (com hífen).
8. Clone o repositório:
   ```bash
   git clone <url-do-repositorio> sistema-hora-extra
   cd sistema-hora-extra
   ```

Alpine não usa firewall por padrão (`iptables` não vem ativo), então não
precisa liberar porta nenhuma para este teste de homologação em rede
local.

### Opção B: Ubuntu Server (mais familiar, mais pesado)

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER   # evita precisar de sudo em todo comando docker
newgrp docker                    # aplica o grupo na sessao atual sem precisar relogar

sudo systemctl enable --now docker   # garante que o Docker sobe sozinho apos reboot da VM
```

Confirme: `docker --version` e `docker compose version`.

Liberar a porta no firewall da VM, se o `ufw` estiver ativo:

```bash
sudo ufw allow 3000/tcp
```

Clonar o repositório:

```bash
git clone <url-do-repositorio> sistema-hora-extra
cd sistema-hora-extra
```

## 1. Configurar o segredo de sessão

A VM não precisa ter Node instalado (só Docker) — use `openssl` (já
instalado na Opção A; já vem por padrão no Ubuntu na Opção B):

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
```

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
- Sem systemd para o app em si — o Docker Compose cuida de reiniciar o
  container (`restart: unless-stopped`); como o passo 0 já habilitou o
  Docker para subir sozinho no boot da VM (`rc-update add docker boot` no
  Alpine, ou `systemctl enable --now docker` no Ubuntu), o container
  volta junto depois de um reboot
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
