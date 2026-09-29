# Deploy — Controle de Horas Extras (CRC)

Roteiro para quando a VM Linux estiver disponível. Testado como referência
para Ubuntu/Debian; ajuste os comandos de pacote se for outra distro.

Situação atual: **sem domínio ainda**, então o site fica em HTTP puro via
IP até haver um domínio apontando para a VM (ver seção 6).

## 1. Preparar o servidor

```bash
sudo apt update && sudo apt install -y nodejs npm sqlite3 caddy git
node --version   # precisa ser >= 22.5 (para o modulo nativo node:sqlite)
```

Se o Node do repositório da distro for antigo, instale via
[NodeSource](https://github.com/nodesource/distributions) ou `nvm`.

## 2. Criar o usuário de serviço e as pastas

```bash
sudo useradd --system --home /opt/horas-extras --shell /usr/sbin/nologin horas-extras

sudo mkdir -p /opt/horas-extras /var/lib/horas-extras /var/backups/horas-extras
sudo chown -R horas-extras:horas-extras /opt/horas-extras /var/lib/horas-extras /var/backups/horas-extras
```

## 3. Publicar o código

```bash
sudo -u horas-extras git clone <url-do-repositorio> /opt/horas-extras
cd /opt/horas-extras
sudo -u horas-extras npm ci --omit=dev
```

## 4. Configurar o ambiente

```bash
sudo -u horas-extras cp .env.example /opt/horas-extras/.env
sudo -u horas-extras nano /opt/horas-extras/.env
```

Preencha:
- `SESSION_SECRET`: gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DB_PATH=/var/lib/horas-extras/dados.sqlite`
- `SESSION_SECURE_COOKIE=false` (mude para `true` só depois da seção 6)

## 5. Banco de dados e primeiro líder

```bash
cd /opt/horas-extras
sudo -u horas-extras env $(cat .env | xargs) node scripts/migrate.js
```

Não existe tela de "primeiro acesso" — o primeiro líder precisa ser
criado uma vez, direto pelo serviço, antes de qualquer login. Crie um
script local temporário (não commitar) baseado neste modelo e rode uma
vez só:

```js
// /tmp/bootstrap-lider.js — rode com: node /tmp/bootstrap-lider.js
// depois APAGUE o arquivo (contém a senha inicial em texto puro).
const usuariosServico = require('/opt/horas-extras/src/servicos/usuarios');

usuariosServico
  .criar({
    nome: 'Thomaz Perini',
    email: 'thomaz.perini@redeunifique.com.br',
    perfil: 'lider',
    senhaInicial: 'DEFINA-UMA-SENHA-FORTE-AQUI',
  })
  .then(() => console.log('Lider criado.'))
  .catch((e) => console.error(e));
```

```bash
sudo -u horas-extras env DB_PATH=/var/lib/horas-extras/dados.sqlite node /tmp/bootstrap-lider.js
rm /tmp/bootstrap-lider.js
```

Depois disso, o próprio líder cadastra o resto da equipe pela tela
**Gestão de usuários**, sem precisar mais mexer em terminal.

## 6. Serviço systemd (a aplicação)

```bash
sudo cp deploy/horas-extras.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now horas-extras
sudo systemctl status horas-extras
```

Logs: `sudo journalctl -u horas-extras -f`

## 7. Proxy reverso (Caddy)

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Com a config padrão (`:80`), o site já responde em `http://<IP-da-VM>/`.

**Quando houver domínio apontado para o IP da VM:**
1. Edite `/etc/caddy/Caddyfile`: comente o bloco `:80` e descomente o
   bloco do domínio.
2. `sudo systemctl reload caddy` (o Caddy emite o certificado Let's
   Encrypt automaticamente).
3. No `.env` do app, mude `SESSION_SECURE_COOKIE=true`.
4. `sudo systemctl restart horas-extras`.

## 8. Backup diário

```bash
sudo cp deploy/backup.sh /opt/horas-extras/deploy/backup.sh
sudo chmod +x /opt/horas-extras/deploy/backup.sh
sudo cp deploy/horas-extras-backup.service deploy/horas-extras-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now horas-extras-backup.timer
sudo systemctl list-timers horas-extras-backup.timer   # confere o proximo horario
```

Testar manualmente: `sudo systemctl start horas-extras-backup.service`,
depois `ls /var/backups/horas-extras`.

## 9. Atualizar uma versão nova

```bash
cd /opt/horas-extras
sudo -u horas-extras git pull
sudo -u horas-extras npm ci --omit=dev
sudo -u horas-extras env $(cat .env | xargs) node scripts/migrate.js
sudo systemctl restart horas-extras
```

## Checklist antes de liberar para a equipe

- [ ] `systemctl status horas-extras` e `caddy` — ambos `active (running)`
- [ ] Login funciona pelo IP (ou domínio) em um navegador de verdade
- [ ] Líder consegue abrir Gestão de usuários e ver os 14 usuários
- [ ] `systemctl list-timers` mostra o backup agendado
- [ ] `.env` tem `SESSION_SECRET` único (não o valor de exemplo)
- [ ] Aviso enviado à equipe com o link e a senha inicial de cada um
