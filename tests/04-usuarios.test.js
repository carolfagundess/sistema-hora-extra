'use strict';
// Gestao de usuarios (so lider) e troca de senha.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { cenarioPadrao, SENHA, SENHA_TEMP } = require('./helpers');

describe('gestao de usuarios', () => {
  let c;
  before(async () => {
    c = await cenarioPadrao();
  });
  after(() => c.amb.parar());

  const linha = (email) => c.amb.consulta('SELECT * FROM usuarios WHERE lower(email) = lower(?)', email)[0];
  const total = () => c.amb.consulta('SELECT COUNT(*) AS n FROM usuarios')[0].n;

  it('lider cadastra usuario; ele aparece na lista e precisa trocar a senha no 1o acesso', async () => {
    const r = await c.lider.post('/usuarios', { nome: 'Novo Colab', email: 'novo@teste.com', perfil: 'colaborador', senha_inicial: 'inicial123' });
    assert.equal(r.status, 200);
    assert.match(r.texto, /cadastrado com sucesso/);
    assert.match((await c.lider.get('/usuarios')).texto, /novo@teste\.com/);
    const u = linha('novo@teste.com');
    assert.equal(u.perfil, 'colaborador');
    assert.equal(u.ativo, 1);
    assert.equal(u.trocar_senha, 1);
    const login = await c.amb.cliente().post('/login', { email: 'novo@teste.com', senha: 'inicial123' });
    assert.equal(login.location, '/trocar-senha');
  });

  it('nunca guarda a senha em texto: grava hash bcrypt', async () => {
    const hash = linha('novo@teste.com').senha_hash;
    assert.match(hash, /^\$2[aby]\$/);
    assert.notEqual(hash, 'inicial123');
  });

  it('normaliza o e-mail (minusculas, sem espacos) ao cadastrar', async () => {
    await c.lider.post('/usuarios', { nome: 'Maiusculo', email: '  Maiusculo@Teste.COM ', perfil: 'colaborador', senha_inicial: 'inicial123' });
    assert.ok(linha('maiusculo@teste.com'));
    assert.equal(linha('maiusculo@teste.com').email, 'maiusculo@teste.com');
  });

  it('recusa e-mail duplicado, inclusive trocando maiusculas/minusculas', async () => {
    const antes = total();
    for (const email of ['ana@teste.com', 'ANA@TESTE.COM', ' Ana@Teste.com ']) {
      const r = await c.lider.post('/usuarios', { nome: 'Duplicada', email, perfil: 'colaborador', senha_inicial: 'inicial123' });
      assert.match(r.texto, /Ja existe um usuario com este e-mail/, email);
    }
    assert.equal(total(), antes);
  });

  for (const [rotulo, dados, erro] of [
    ['campos em branco', { nome: '', email: '', perfil: '', senha_inicial: '' }, /Preencha todos os campos/],
    ['senha curta (7)', { nome: 'X', email: 'curta@teste.com', perfil: 'colaborador', senha_inicial: '1234567' }, /pelo menos 8/],
    ['perfil invalido', { nome: 'X', email: 'perfil@teste.com', perfil: 'admin', senha_inicial: '12345678' }, /Perfil invalido/],
  ]) {
    it(`recusa cadastro com ${rotulo} e nao cria nada`, async () => {
      const antes = total();
      const r = await c.lider.post('/usuarios', dados);
      assert.equal(r.status, 200);
      assert.match(r.texto, erro);
      assert.equal(total(), antes);
    });
  }

  it('lider altera nome e perfil; novo perfil vale na hora (colaborador -> sublider acessa /aprovacao)', async () => {
    await c.amb.usuarioPronto('Promovido', 'promovido@teste.com', 'colaborador');
    const u = await c.amb.logar('promovido@teste.com');
    assert.equal((await u.get('/aprovacao')).status, 403);
    const id = c.amb.id('promovido@teste.com');
    const r = await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Promovido Silva', perfil: 'sublider', ativo: 'on' });
    assert.match(r.texto, /Usuario atualizado/);
    assert.equal(linha('promovido@teste.com').nome, 'Promovido Silva');
    assert.equal((await u.get('/aprovacao')).status, 200);
  });

  it('edicao com perfil invalido, nome vazio ou usuario inexistente e recusada', async () => {
    const id = c.amb.id('ana@teste.com');
    assert.match((await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Ana', perfil: 'root', ativo: 'on' })).texto, /Perfil invalido/);
    assert.match((await c.lider.post(`/usuarios/${id}/editar`, { nome: '', perfil: 'colaborador', ativo: 'on' })).texto, /Informe o nome/);
    assert.match((await c.lider.post('/usuarios/999999/editar', { nome: 'Fantasma', perfil: 'colaborador', ativo: 'on' })).texto, /Usuario nao encontrado/);
    assert.equal(linha('ana@teste.com').perfil, 'colaborador');
  });

  it('lider nao pode desativar nem rebaixar a propria conta', async () => {
    const id = c.ids.lider;
    const rebaixar = await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Lider Teste', perfil: 'colaborador', ativo: 'on' });
    assert.match(rebaixar.texto, /nao pode desativar ou rebaixar a propria conta/);
    const desativar = await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Lider Teste', perfil: 'lider' });
    assert.match(desativar.texto, /nao pode desativar ou rebaixar a propria conta/);
    const u = linha('lider@teste.com');
    assert.equal(u.perfil, 'lider');
    assert.equal(u.ativo, 1);
  });

  describe('redefinir senha', () => {
    it('senha curta e recusada', async () => {
      const id = c.amb.id('bruno@teste.com');
      const r = await c.lider.post(`/usuarios/${id}/redefinir-senha`, { senha_nova: '123' });
      assert.match(r.texto, /pelo menos 8/);
      assert.equal((await c.amb.cliente().post('/login', { email: 'bruno@teste.com', senha: SENHA })).status, 302);
    });

    it('usuario inexistente da erro claro (nao diz que redefiniu)', async () => {
      const r = await c.lider.post('/usuarios/999999/redefinir-senha', { senha_nova: 'NovaSenha123' });
      assert.match(r.texto, /Usuario nao encontrado/);
      assert.doesNotMatch(r.texto, /Senha redefinida/);
    });

    it('redefinir invalida a senha antiga e obriga a trocar no proximo acesso', async () => {
      await c.amb.usuarioPronto('Esqueceu', 'esqueceu@teste.com', 'colaborador');
      const id = c.amb.id('esqueceu@teste.com');
      const r = await c.lider.post(`/usuarios/${id}/redefinir-senha`, { senha_nova: 'Provisoria123' });
      assert.match(r.texto, /Senha redefinida/);
      assert.equal((await c.amb.cliente().post('/login', { email: 'esqueceu@teste.com', senha: SENHA })).status, 401);
      const novo = await c.amb.cliente().post('/login', { email: 'esqueceu@teste.com', senha: 'Provisoria123' });
      assert.equal(novo.status, 302);
      assert.equal(novo.location, '/trocar-senha');
    });
  });

  describe('troca de senha pelo proprio usuario', () => {
    let u;
    before(async () => {
      c.amb.criarUsuario('Troca Senha', 'troca@teste.com', 'colaborador');
      u = c.amb.cliente();
      await u.post('/login', { email: 'troca@teste.com', senha: SENHA_TEMP });
    });

    it('recusa senha curta', async () => {
      const r = await u.post('/trocar-senha', { senha_nova: '1234567', confirmar_senha: '1234567' });
      assert.equal(r.status, 400);
      assert.match(r.texto, /pelo menos 8/);
    });

    it('recusa confirmacao diferente', async () => {
      const r = await u.post('/trocar-senha', { senha_nova: 'SenhaNova123', confirmar_senha: 'SenhaNova124' });
      assert.equal(r.status, 400);
      assert.match(r.texto, /nao conferem/);
    });

    it('troca com sucesso: senha antiga deixa de valer, nova vale e a pendencia some', async () => {
      assert.equal(linha('troca@teste.com').trocar_senha, 1);
      const r = await u.post('/trocar-senha', { senha_nova: 'SenhaNova123', confirmar_senha: 'SenhaNova123' });
      assert.equal(r.status, 302);
      assert.equal(linha('troca@teste.com').trocar_senha, 0);
      assert.equal((await u.get('/lancamentos')).status, 200);
      assert.equal((await c.amb.cliente().post('/login', { email: 'troca@teste.com', senha: SENHA_TEMP })).status, 401);
      assert.equal((await c.amb.cliente().post('/login', { email: 'troca@teste.com', senha: 'SenhaNova123' })).status, 302);
    });
  });
});
