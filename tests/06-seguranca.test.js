'use strict';
// Robustez do login, bloqueio por tentativas, cookie de sessao, XSS e configuracao.
const { describe, it, before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cenarioPadrao, lancar, motivoUnico, RAIZ, SENHA } = require('./helpers');

describe('seguranca e robustez', () => {
  let c;
  before(async () => {
    c = await cenarioPadrao();
  });
  after(() => c.amb.parar());

  describe('login com dados malformados NAO derruba o servidor', () => {
    const CORPOS = [
      ['corpo vazio', ''],
      ['so a senha', 'senha=x'],
      ['so o e-mail', 'email=a@b.com'],
      ['e-mail repetido (vira lista)', 'email=a@b.com&email=c@d.com&senha=x'],
      ['senha repetida (vira lista)', 'email=a@b.com&senha=x&senha=y'],
      ['campos aninhados', 'email[a]=1&senha[b]=2'],
      ['campos vazios', 'email=&senha='],
      ['injecao de SQL', 'email=%27%20OR%20%271%27%3D%271&senha=%27%20OR%20%271%27%3D%271'],
      ['e-mail enorme', 'email=' + 'e'.repeat(5000) + '&senha=x'],
      ['byte nulo', 'email=a%00b&senha=x'],
      ['unicode', 'email=%F0%9F%98%80%40x.com&senha=%C3%A9'],
    ];
    for (const [rotulo, corpo] of CORPOS) {
      it(rotulo, async () => {
        const r = await c.amb.cliente().req('POST', '/login', { corpo });
        assert.ok([400, 401].includes(r.status), `status ${r.status}`);
        assert.equal(c.amb.vivo(), true, 'o processo do servidor caiu');
        assert.equal((await c.amb.cliente().get('/login')).status, 200);
      });
    }

    it('corpo JSON (sem parser) e tratado como vazio', async () => {
      const r = await c.amb.cliente().req('POST', '/login', {
        corpo: JSON.stringify({ email: 'ana@teste.com', senha: SENHA }),
        headers: { 'content-type': 'application/json' },
      });
      assert.equal(r.status, 401);
      assert.equal(c.amb.vivo(), true);
    });

    it('corpo gigante (300 KB) e recusado sem derrubar o servidor', async () => {
      const r = await c.amb.cliente().req('POST', '/login', { corpo: 'email=a&senha=' + 'x'.repeat(300_000) });
      assert.ok(r.status >= 400 && r.status < 600);
      assert.equal(c.amb.vivo(), true);
      assert.equal((await c.amb.cliente().get('/login')).status, 200);
    });
  });

  describe('login', () => {
    it('e-mail sem diferenciar maiusculas e ignorando espacos nas pontas', async () => {
      for (const email of ['ANA@TESTE.COM', '  ana@teste.com  ', 'Ana@Teste.com']) {
        const r = await c.amb.cliente().post('/login', { email, senha: SENHA });
        assert.equal(r.status, 302, email);
      }
    });

    it('mesma mensagem para e-mail inexistente e senha errada (nao revela quem existe)', async () => {
      const a = await c.amb.cliente().post('/login', { email: 'ninguem@teste.com', senha: 'qualquer123' });
      const b = await c.amb.cliente().post('/login', { email: 'ana@teste.com', senha: 'errada12345' });
      assert.equal(a.status, 401);
      assert.equal(b.status, 401);
      assert.match(a.texto, /E-mail ou senha invalidos/);
      assert.match(b.texto, /E-mail ou senha invalidos/);
    });

    it('injecao de SQL no login nao autentica ninguem', async () => {
      const r = await c.amb.cliente().post('/login', { email: "' OR '1'='1' --", senha: "' OR '1'='1" });
      assert.equal(r.status, 401);
    });

    it('apos 5 erros bloqueia ate com a senha certa; variar maiusculas nao burla; outro usuario nao e afetado', async () => {
      await c.amb.usuarioPronto('Alvo Bloqueio', 'alvo@teste.com', 'colaborador');
      for (const email of ['alvo@teste.com', 'ALVO@teste.com', ' Alvo@Teste.com ', 'alvo@TESTE.com', 'ALVO@TESTE.COM']) {
        assert.equal((await c.amb.cliente().post('/login', { email, senha: 'errada12345' })).status, 401);
      }
      const certa = await c.amb.cliente().post('/login', { email: 'alvo@teste.com', senha: SENHA });
      assert.equal(certa.status, 401);
      assert.match(certa.texto, /Muitas tentativas/);
      assert.equal((await c.amb.cliente().post('/login', { email: 'bruno@teste.com', senha: SENHA })).status, 302);
    });

    it('login com sucesso zera o contador de erros', async () => {
      await c.amb.usuarioPronto('Zera Contador', 'zera@teste.com', 'colaborador');
      for (let rodada = 0; rodada < 3; rodada++) {
        for (let i = 0; i < 4; i++) await c.amb.cliente().post('/login', { email: 'zera@teste.com', senha: 'errada12345' });
        assert.equal((await c.amb.cliente().post('/login', { email: 'zera@teste.com', senha: SENHA })).status, 302, `rodada ${rodada}`);
      }
    });
  });

  describe('cookie de sessao', () => {
    it('e HttpOnly e SameSite=Lax (e nao Secure enquanto o site e HTTP puro)', async () => {
      const r = await c.amb.cliente().post('/login', { email: 'ana@teste.com', senha: SENHA });
      const cookie = r.setCookies.join(' | ');
      assert.match(cookie, /connect\.sid=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.doesNotMatch(cookie, /;\s*Secure/i);
    });

    it('visitante que so abre /login nao recebe cookie de sessao', async () => {
      const r = await c.amb.cliente().get('/login');
      assert.equal(r.setCookies.length, 0);
    });

    test.todo('CSRF: exigir token por formulario (hoje a defesa e so o SameSite=Lax)');
  });

  describe('XSS: dados de usuario sao escapados nas telas', () => {
    it('nome de usuario com HTML', async () => {
      const nome = '<img src=x onerror=alert(1)>';
      await c.lider.post('/usuarios', { nome, email: 'xss@teste.com', perfil: 'colaborador', senha_inicial: 'inicial123' });
      const html = (await c.lider.get('/usuarios')).texto;
      assert.doesNotMatch(html, /<img src=x onerror/);
      assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    });

    it('motivo do lancamento com HTML, na tela do colaborador e no painel de aprovacao', async () => {
      const motivo = '"><script>alert(1)</script>';
      await lancar(c.ana, c.amb, { motivo });
      assert.doesNotMatch((await c.ana.get('/lancamentos')).texto, /<script>alert\(1\)/);
      assert.doesNotMatch((await c.lider.get('/aprovacao')).texto, /<script>alert\(1\)/);
    });

    it('comentario de decisao com HTML', async () => {
      const { id } = await lancar(c.ana, c.amb, { motivo: motivoUnico() });
      await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'reprovado', comentario: '<b onmouseover=alert(1)>x</b>' });
      assert.doesNotMatch((await c.ana.get('/lancamentos')).texto, /<b onmouseover/);
    });
  });

  describe('configuracao', () => {
    it('em producao o servidor se recusa a subir sem SESSION_SECRET', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horas-extras-sem-segredo-'));
      const env = { ...process.env, NODE_ENV: 'production', DB_PATH: path.join(dir, 'x.sqlite'), PORT: '0' };
      delete env.SESSION_SECRET;
      const r = spawnSync(process.execPath, [path.join(RAIZ, 'src', 'server.js')], { cwd: RAIZ, env, encoding: 'utf8', timeout: 10000 });
      fs.rmSync(dir, { recursive: true, force: true });
      assert.equal(r.status, 1);
      assert.match(r.stderr + r.stdout, /SESSION_SECRET/);
    });

    it('docker-compose exige SESSION_SECRET e nao fixa um segredo no arquivo', () => {
      const compose = fs.readFileSync(path.join(RAIZ, 'docker-compose.yml'), 'utf8');
      assert.match(compose, /SESSION_SECRET:\s*\$\{SESSION_SECRET:\?/);
    });

    it('.env fica fora do git e fora da imagem Docker', () => {
      for (const arq of ['.gitignore', '.dockerignore']) {
        const linhas = fs.readFileSync(path.join(RAIZ, arq), 'utf8').split(/\r?\n/).map((l) => l.trim());
        assert.ok(linhas.includes('.env'), `${arq} deve listar .env`);
      }
    });
  });
});
