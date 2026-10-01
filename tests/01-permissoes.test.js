'use strict';
// Matriz de permissoes por perfil, sessao, troca de senha obrigatoria e usuario desativado.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { cenarioPadrao, SENHA, SENHA_TEMP } = require('./helpers');

describe('permissoes por perfil', () => {
  let c;
  before(async () => {
    c = await cenarioPadrao();
  });
  after(() => c.amb.parar());

  // [metodo, rota, esperado lider, sublider, colaborador]
  const PERMITIDOS_E_NEGADOS = [
    ['GET', '/lancamentos', 403, 200, 200],
    ['GET', '/aprovacao', 200, 200, 403],
    ['GET', '/relatorio', 200, 200, 403],
    ['GET', '/relatorio/exportar', 200, 200, 403],
    ['GET', '/usuarios', 200, 403, 403],
  ];
  for (const [metodo, rota, lider, sub, colab] of PERMITIDOS_E_NEGADOS) {
    it(`${metodo} ${rota} -> lider ${lider}, sublider ${sub}, colaborador ${colab}`, async () => {
      assert.equal((await c.lider.req(metodo, rota)).status, lider, 'lider');
      assert.equal((await c.sub.req(metodo, rota)).status, sub, 'sublider');
      assert.equal((await c.ana.req(metodo, rota)).status, colab, 'colaborador');
    });
  }

  const POSTS_NEGADOS = [
    ['ana', '/usuarios'],
    ['sub', '/usuarios'],
    ['ana', '/usuarios/1/editar'],
    ['sub', '/usuarios/1/editar'],
    ['ana', '/usuarios/1/redefinir-senha'],
    ['sub', '/usuarios/1/redefinir-senha'],
    ['ana', '/aprovacao/1/decidir'],
    ['ana', '/aprovacao/lote'],
    ['lider', '/lancamentos'],
    ['lider', '/lancamentos/1/editar'],
    ['lider', '/lancamentos/1/excluir'],
  ];
  for (const [quem, rota] of POSTS_NEGADOS) {
    it(`POST ${rota} e negado (403) para ${quem}`, async () => {
      const r = await c[quem].post(rota, { nome: 'x', email: 'x@x.com', perfil: 'lider', senha_inicial: '12345678', decisao: 'aprovado' });
      assert.equal(r.status, 403);
    });
  }

  it('visitante anonimo e mandado para /login em todas as rotas protegidas', async () => {
    const anonimo = c.amb.cliente();
    for (const [metodo, rota] of [
      ['GET', '/'],
      ['GET', '/lancamentos'],
      ['GET', '/aprovacao'],
      ['GET', '/relatorio'],
      ['GET', '/relatorio/exportar'],
      ['GET', '/usuarios'],
      ['GET', '/trocar-senha'],
      ['POST', '/lancamentos'],
      ['POST', '/aprovacao/lote'],
      ['POST', '/aprovacao/1/decidir'],
      ['POST', '/usuarios'],
      ['POST', '/usuarios/1/editar'],
      ['POST', '/usuarios/1/redefinir-senha'],
    ]) {
      const r = await anonimo.req(metodo, rota, metodo === 'POST' ? { form: { x: 'y' } } : {});
      assert.equal(r.status, 302, `${metodo} ${rota}`);
      assert.equal(r.location, '/login', `${metodo} ${rota}`);
    }
  });

  it('pagina inicial: lider vai para /aprovacao; sublider e colaborador para /lancamentos', async () => {
    assert.equal((await c.lider.get('/')).location, '/aprovacao');
    assert.equal((await c.sub.get('/')).location, '/lancamentos');
    assert.equal((await c.ana.get('/')).location, '/lancamentos');
  });

  it('rota inexistente devolve 404 com pagina de erro do sistema', async () => {
    const r = await c.lider.get('/nao-existe');
    assert.equal(r.status, 404);
    assert.match(r.texto, /Pagina nao encontrada/);
  });

  it('logout invalida a sessao: reutilizar o cookie antigo manda para /login', async () => {
    await c.amb.usuarioPronto('Sai Logo', 'sai@teste.com', 'colaborador');
    const u = await c.amb.logar('sai@teste.com');
    assert.equal((await u.get('/lancamentos')).status, 200);
    assert.equal((await u.post('/logout', {})).location, '/login');
    const depois = await u.get('/lancamentos');
    assert.equal(depois.status, 302);
    assert.equal(depois.location, '/login');
  });

  describe('troca de senha obrigatoria no primeiro acesso', () => {
    it('colaborador com senha pendente so alcanca /trocar-senha e /logout', async () => {
      c.amb.criarUsuario('Pendente Colab', 'pendente@teste.com', 'colaborador');
      const u = c.amb.cliente();
      const login = await u.post('/login', { email: 'pendente@teste.com', senha: SENHA_TEMP });
      assert.equal(login.location, '/trocar-senha');
      for (const rota of ['/', '/lancamentos']) {
        const r = await u.get(rota);
        assert.equal(r.status, 302, rota);
        assert.equal(r.location, '/trocar-senha', rota);
      }
      assert.equal((await u.get('/trocar-senha')).status, 200);
      assert.equal((await u.post('/logout', {})).location, '/login');
    });

    it('lider com senha pendente nao acessa aprovacao, relatorio nem usuarios', async () => {
      c.amb.criarUsuario('Lider Pendente', 'lider2@teste.com', 'lider');
      const u = c.amb.cliente();
      await u.post('/login', { email: 'lider2@teste.com', senha: SENHA_TEMP });
      for (const rota of ['/', '/aprovacao', '/relatorio', '/relatorio/exportar', '/usuarios']) {
        const r = await u.get(rota);
        assert.equal(r.status, 302, rota);
        assert.equal(r.location, '/trocar-senha', rota);
      }
    });
  });

  describe('usuario desativado', () => {
    it('perde o acesso na hora, nao consegue logar e pode ser reativado', async () => {
      await c.amb.usuarioPronto('Vai Sair', 'vaisair@teste.com', 'colaborador');
      const sessaoAberta = await c.amb.logar('vaisair@teste.com');
      const id = c.amb.id('vaisair@teste.com');
      assert.equal((await sessaoAberta.get('/lancamentos')).status, 200);

      // desativar = enviar o formulario de edicao SEM o campo "ativo"
      const desativar = await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Vai Sair', perfil: 'colaborador' });
      assert.equal(desativar.status, 200);
      assert.equal(c.amb.consulta('SELECT ativo FROM usuarios WHERE id = ?', id)[0].ativo, 0);

      // a sessao que ja estava aberta deixa de funcionar imediatamente
      const aposDesativar = await sessaoAberta.get('/lancamentos');
      assert.equal(aposDesativar.status, 302);
      assert.equal(aposDesativar.location, '/login');

      // login com a senha CORRETA precisa ser recusado (401), e nao aceito (302).
      // Se aceitar, o navegador cai num loop infinito de redirecionamentos.
      const novo = c.amb.cliente();
      const tentativa = await novo.post('/login', { email: 'vaisair@teste.com', senha: SENHA });
      assert.equal(tentativa.status, 401, 'usuario desativado nao pode logar');
      assert.match(tentativa.texto, /E-mail ou senha invalidos/);

      // reativar
      const reativar = await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Vai Sair', perfil: 'colaborador', ativo: 'on' });
      assert.equal(reativar.status, 200);
      const volta = c.amb.cliente();
      assert.equal((await volta.post('/login', { email: 'vaisair@teste.com', senha: SENHA })).status, 302);
    });
  });
});
