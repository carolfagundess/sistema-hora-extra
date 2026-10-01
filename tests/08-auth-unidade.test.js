'use strict';
// Testes unitarios do modulo de autenticacao (banco em memoria, sem servidor).
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

require('../scripts/migrate.js'); // aplica as migracoes no banco em memoria
const db = require('../src/db');
const auth = require('../src/auth');
const usuarios = require('../src/servicos/usuarios');

const MINUTO = 60 * 1000;
const realNow = Date.now;
afterEach(() => {
  Date.now = realNow;
});
const avancar = (ms) => {
  Date.now = () => realNow() + ms;
};

describe('autenticar()', () => {
  before(async () => {
    await usuarios.criar({ nome: 'Ana', email: 'ana@teste.com', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' });
  });

  it('aceita e-mail e senha corretos', async () => {
    const r = await auth.autenticar('ana@teste.com', 'SenhaForte2026');
    assert.equal(r.ok, true);
    assert.equal(r.usuario.email, 'ana@teste.com');
  });

  it('a busca por e-mail ignora maiusculas', async () => {
    assert.equal((await auth.autenticar('ANA@TESTE.COM', 'SenhaForte2026')).ok, true);
  });

  it('recusa senha errada e usuario inexistente com o mesmo motivo', async () => {
    assert.deepEqual(await auth.autenticar('ana@teste.com', 'errada'), { ok: false, motivo: 'credenciais_invalidas' });
    assert.deepEqual(await auth.autenticar('ninguem@teste.com', 'x'), { ok: false, motivo: 'credenciais_invalidas' });
  });

  it('recusa usuario DESATIVADO mesmo com a senha correta', async () => {
    await usuarios.criar({ nome: 'Ex', email: 'ex@teste.com', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' });
    db.prepare('UPDATE usuarios SET ativo = 0 WHERE email = ?').run('ex@teste.com');
    const r = await auth.autenticar('ex@teste.com', 'SenhaForte2026');
    assert.equal(r.ok, false);
  });

  it('usuario sem senha cadastrada nao autentica e nao lanca excecao', async () => {
    db.prepare("INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Sem Senha', 'sem@teste.com', NULL, 'colaborador')").run();
    assert.equal((await auth.autenticar('sem@teste.com', 'qualquer')).ok, false);
  });
});

describe('bloqueio por tentativas', () => {
  before(async () => {
    for (const e of ['b1', 'b2', 'b3', 'b4']) {
      await usuarios.criar({ nome: e, email: `${e}@teste.com`, perfil: 'colaborador', senhaInicial: 'SenhaForte2026' });
    }
  });
  const errar = async (email, vezes) => {
    for (let i = 0; i < vezes; i++) await auth.autenticar(email, 'errada');
  };

  it('4 erros ainda nao bloqueiam; o 5o bloqueia ate a senha certa', async () => {
    await errar('b1@teste.com', 4);
    assert.equal((await auth.autenticar('b1@teste.com', 'SenhaForte2026')).ok, true, 'apos 4 erros ainda entra');
    await errar('b2@teste.com', 5);
    const r = await auth.autenticar('b2@teste.com', 'SenhaForte2026');
    assert.deepEqual(r, { ok: false, motivo: 'muitas_tentativas' });
  });

  it('o bloqueio expira sozinho depois de 15 minutos (e nao antes)', async () => {
    await errar('b3@teste.com', 5);
    avancar(14 * MINUTO);
    assert.equal((await auth.autenticar('b3@teste.com', 'SenhaForte2026')).motivo, 'muitas_tentativas', 'aos 14 min ainda bloqueado');
    avancar(16 * MINUTO);
    assert.equal((await auth.autenticar('b3@teste.com', 'SenhaForte2026')).ok, true, 'aos 16 min liberado');
  });

  it('depois de expirar, o contador recomeca do zero', async () => {
    await errar('b4@teste.com', 5);
    avancar(16 * MINUTO);
    await errar('b4@teste.com', 4); // 4 erros novos: nao pode bloquear
    assert.equal((await auth.autenticar('b4@teste.com', 'SenhaForte2026')).ok, true);
  });
});

describe('sessao e perfis', () => {
  let ativo;
  let inativo;
  before(async () => {
    await usuarios.criar({ nome: 'Ativo', email: 'sessao-ativo@teste.com', perfil: 'sublider', senhaInicial: 'SenhaForte2026' });
    await usuarios.criar({ nome: 'Inativo', email: 'sessao-inativo@teste.com', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' });
    ativo = usuarios.buscarPorEmail('sessao-ativo@teste.com');
    inativo = usuarios.buscarPorEmail('sessao-inativo@teste.com');
    db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(inativo.id);
  });

  it('getUsuarioLogado: sessao valida, ausente e de usuario inativo', () => {
    assert.equal(auth.getUsuarioLogado({ session: { usuarioId: ativo.id } }).id, ativo.id);
    assert.equal(auth.getUsuarioLogado({ session: {} }), null);
    assert.equal(auth.getUsuarioLogado({}), null);
    assert.equal(auth.getUsuarioLogado({ session: { usuarioId: inativo.id } }), undefined);
  });

  it('exigirPerfil deixa passar o perfil permitido e responde 403 aos demais', () => {
    const mw = auth.exigirPerfil('lider', 'sublider');
    let passou = false;
    mw({ usuarioLogado: { perfil: 'sublider' } }, {}, () => (passou = true));
    assert.equal(passou, true);

    let status;
    const res = { status(s) { status = s; return this; }, render() {} };
    passou = false;
    mw({ usuarioLogado: { perfil: 'colaborador' } }, res, () => (passou = true));
    assert.equal(passou, false);
    assert.equal(status, 403);
  });

  it('alterarSenha troca o hash e tira a pendencia de troca', async () => {
    const antes = usuarios.buscarPorId(ativo.id);
    assert.equal(antes.trocar_senha, 1);
    await auth.alterarSenha(ativo.id, 'OutraSenha123');
    const depois = usuarios.buscarPorId(ativo.id);
    assert.equal(depois.trocar_senha, 0);
    assert.notEqual(depois.senha_hash, antes.senha_hash);
    assert.equal((await auth.autenticar('sessao-ativo@teste.com', 'OutraSenha123')).ok, true);
  });
});
