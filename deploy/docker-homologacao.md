# Homologação com Docker (VM Linux local)

Roteiro para rodar o sistema numa VM Linux (Ubuntu/Debian) no seu
notebook, para a equipe testar antes do deploy definitivo. Já foi testado
ponta a ponta (build, subida, login, criação de usuário, restart com
persistência de dados) — o que muda aqui é só o provisionamento da VM.

## 0. Provisionar a VM

Se a VM ainda não existe: crie uma VM Ubuntu Server (22.04+) no
VirtualBox/VMware/Hyper-V com rede em modo **bridge** (não NAT) — assim
ela pega um IP na sua rede local e o resto do time consegue acessar. Rede
NAT deixaria a VM visível só para o seu notebook.

Instalar Docker Engine + Compose na VM (dentro da VM, via SSH ou console):

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

A VM não precisa ter Node instalado (só Docker) — use `openssl`, que já
vem no Ubuntu:

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
  Docker no boot da VM (`systemctl enable --now docker`), o container
  volta sozinho depois de um reboot
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
