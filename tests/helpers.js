'use strict';
// Utilitarios compartilhados pelos testes de integracao.
//
// Cada arquivo de teste sobe SEU PROPRIO servidor (processo filho) numa porta
// livre, com um banco SQLite temporario. Nada toca no seu dados.sqlite real.
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..');
const SENHA_TEMP = 'senhaTemp123'; // senha inicial (troca obrigatoria)
const SENHA = 'SenhaForte2026'; // senha definitiva usada nos testes

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Mes atual (AAAA-MM) no fuso de Brasilia, calculado de forma independente do app.
function mesAtualBrasilia() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}

// Cliente HTTP minimo com "cookie jar" (uma sessao de navegador).
class Cliente {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  // opcoes: { form: objeto|[[k,v]], corpo: string, headers: {} }
  async req(metodo, caminho, opcoes = {}) {
    const headers = { ...(opcoes.headers || {}) };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let body;
    if (opcoes.form) {
      const pares = Array.isArray(opcoes.form) ? opcoes.form : Object.entries(opcoes.form);
      body = new URLSearchParams(pares).toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (opcoes.corpo !== undefined) {
      body = opcoes.corpo;
      headers['content-type'] = headers['content-type'] || 'application/x-www-form-urlencoded';
    }
    const res = await fetch(this.base + caminho, { method: metodo, headers, body, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie();
    for (const c of setCookies) {
      const par = c.split(';')[0];
      const i = par.indexOf('=');
      this.cookies.set(par.slice(0, i), par.slice(i + 1));
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      location: res.headers.get('location'),
      headers: res.headers,
      setCookies,
      buffer,
      texto: buffer.toString('utf8'),
    };
  }

  get(caminho, opcoes) {
    return this.req('GET', caminho, opcoes);
  }

  post(caminho, form, opcoes = {}) {
    return this.req('POST', caminho, { ...opcoes, form });
  }
}

async function iniciarAmbiente({ fakeNow, env: extra } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horas-extras-teste-'));
  const dbPath = path.join(dir, 'dados.sqlite');
  const port = await portaLivre();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    SESSION_SECRET: 'segredo-de-teste',
    SESSION_SECURE_COOKIE: 'false',
    DB_PATH: dbPath,
    PORT: String(port),
    ...extra,
  };
  if (fakeNow) env.FAKE_NOW = fakeNow;

  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'migrate.js')], {
    cwd: RAIZ,
    env,
    stdio: 'pipe',
  });

  const args = [];
  if (fakeNow) args.push('--require', path.join(__dirname, 'fake-date.js'));
  args.push(path.join(RAIZ, 'src', 'server.js'));
  const proc = spawn(process.execPath, args, { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });

  let log = '';
  let saiu = null;
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  proc.on('exit', (code, sinal) => {
    saiu = { code, sinal };
  });

  const base = `http://127.0.0.1:${port}`;
  const limite = Date.now() + 20000;
  for (;;) {
    if (saiu) throw new Error(`O servidor encerrou ao iniciar:\n${log}`);
    try {
      const r = await fetch(`${base}/login`);
      if (r.status === 200) break;
    } catch (_) {
      /* ainda subindo */
    }
    if (Date.now() > limite) {
      proc.kill();
      throw new Error(`O servidor nao subiu em 20s:\n${log}`);
    }
    await esperar(100);
  }

  const amb = {
    base,
    dbPath,
    vivo: () => saiu === null,
    log: () => log,
    cliente: () => new Cliente(base),

    // Consulta SQL direta no banco do teste (somente para conferir o resultado).
    consulta(sql, ...params) {
      const db = new DatabaseSync(dbPath);
      try {
        return db.prepare(sql).all(...params);
      } finally {
        db.close();
      }
    },

    // Cria o usuario pelo mesmo script usado em producao (scripts/criar-usuario.js).
    criarUsuario(nome, email, perfil, senha = SENHA_TEMP) {
      execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'criar-usuario.js'), nome, email, perfil, senha], {
        cwd: RAIZ,
        env,
        stdio: 'pipe',
      });
    },

    // Cria o usuario e ja faz a troca obrigatoria de senha do primeiro acesso.
    async usuarioPronto(nome, email, perfil) {
      amb.criarUsuario(nome, email, perfil);
      const c = amb.cliente();
      let r = await c.post('/login', { email, senha: SENHA_TEMP });
      assert.equal(r.status, 302, `login inicial de ${email}: ${r.texto.slice(0, 200)}`);
      assert.equal(r.location, '/trocar-senha');
      r = await c.post('/trocar-senha', { senha_nova: SENHA, confirmar_senha: SENHA });
      assert.equal(r.status, 302, `troca de senha de ${email}`);
    },

    // Faz login com a senha definitiva e devolve o cliente logado.
    async logar(email, senha = SENHA) {
      const c = amb.cliente();
      const r = await c.post('/login', { email, senha });
      assert.equal(r.status, 302, `login de ${email} falhou: ${r.texto.slice(0, 200)}`);
      return c;
    },

    id(email) {
      return amb.consulta('SELECT id FROM usuarios WHERE lower(email) = lower(?)', email)[0]?.id;
    },

    async parar() {
      await new Promise((resolve) => {
        if (saiu) return resolve();
        proc.once('exit', resolve);
        proc.kill();
      });
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {
        /* arquivo ainda preso no Windows: ignorar, e pasta temporaria */
      }
    },
  };
  return amb;
}

// Cenario padrao: 1 lider, 1 sublider e 2 colaboradores, todos ja logados.
const USUARIOS_PADRAO = {
  lider: ['Lider Teste', 'lider@teste.com', 'lider'],
  sub: ['Sub Teste', 'sub@teste.com', 'sublider'],
  ana: ['Ana Colab', 'ana@teste.com', 'colaborador'],
  bruno: ['Bruno Colab', 'bruno@teste.com', 'colaborador'],
};

async function cenarioPadrao(opcoes) {
  const amb = await iniciarAmbiente(opcoes);
  const cenario = { amb, ids: {} };
  for (const [chave, [nome, email, perfil]] of Object.entries(USUARIOS_PADRAO)) {
    await amb.usuarioPronto(nome, email, perfil);
    cenario[chave] = await amb.logar(email);
    cenario.ids[chave] = amb.id(email);
  }
  return cenario;
}

let sequencia = 0;
const motivoUnico = (prefixo = 'motivo') => `${prefixo}-${++sequencia}-${process.pid}`;

// Lanca horas pelo formulario e devolve { resposta, id }.
async function lancar(cliente, amb, { data, inicio = '18:00', fim = '19:00', motivo = motivoUnico() } = {}) {
  const resposta = await cliente.post('/lancamentos', {
    data: data || `${mesAtualBrasilia()}-10`,
    hora_inicio: inicio,
    hora_fim: fim,
    motivo,
  });
  const linha = amb.consulta('SELECT id FROM lancamentos WHERE motivo = ? ORDER BY id DESC LIMIT 1', motivo)[0];
  return { resposta, id: linha?.id, motivo };
}

const statusDe = (amb, id) => amb.consulta('SELECT * FROM lancamentos WHERE id = ?', id)[0];

module.exports = {
  RAIZ,
  SENHA,
  SENHA_TEMP,
  Cliente,
  iniciarAmbiente,
  cenarioPadrao,
  lancar,
  statusDe,
  motivoUnico,
  mesAtualBrasilia,
};
