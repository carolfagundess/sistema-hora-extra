'use strict';
// Painel de aprovacao: quem pode decidir o que, registro de quem/quando, lote.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { cenarioPadrao, lancar, statusDe, motivoUnico } = require('./helpers');

describe('aprovacao', () => {
  let c;
  before(async () => {
    c = await cenarioPadrao();
  });
  after(() => c.amb.parar());

  it('lider aprova lancamento do colaborador e o sistema registra quem, quando e o comentario', async () => {
    const { id } = await lancar(c.ana, c.amb);
    const r = await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'aprovado', comentario: 'ok, valido' });
    assert.equal(r.status, 302);
    const l = statusDe(c.amb, id);
    assert.equal(l.status, 'aprovado');
    assert.equal(l.aprovador_id, c.ids.lider);
    assert.ok(l.decidido_em, 'decidido_em deve ser preenchido');
    assert.equal(l.comentario, 'ok, valido');
  });

  it('sublider tambem aprova e reprova (atua no lugar do lider)', async () => {
    const a = await lancar(c.ana, c.amb);
    const b = await lancar(c.bruno, c.amb);
    assert.equal((await c.sub.post(`/aprovacao/${a.id}/decidir`, { decisao: 'aprovado' })).status, 302);
    assert.equal((await c.sub.post(`/aprovacao/${b.id}/decidir`, { decisao: 'reprovado', comentario: 'sem justificativa' })).status, 302);
    assert.equal(statusDe(c.amb, a.id).aprovador_id, c.ids.sub);
    const reprovado = statusDe(c.amb, b.id);
    assert.equal(reprovado.status, 'reprovado');
    assert.equal(reprovado.comentario, 'sem justificativa');
  });

  it('lider decide lancamento do sublider (e o contrario nao se aplica a si mesmo)', async () => {
    const { id } = await lancar(c.sub, c.amb);
    assert.equal((await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'aprovado' })).status, 302);
    assert.equal(statusDe(c.amb, id).aprovador_id, c.ids.lider);
  });

  it('ninguem aprova o proprio lancamento (nem como lote)', async () => {
    const { id } = await lancar(c.sub, c.amb);
    const individual = await c.sub.post(`/aprovacao/${id}/decidir`, { decisao: 'aprovado' });
    assert.equal(individual.status, 200);
    assert.match(individual.texto, /nao pode decidir/);
    const lote = await c.sub.post('/aprovacao/lote', [['decisao', 'aprovado'], ['ids', String(id)]]);
    assert.match(lote.texto, /0 de 1/);
    const l = statusDe(c.amb, id);
    assert.equal(l.status, 'pendente');
    assert.equal(l.aprovador_id, null);
  });

  it('o painel nao lista o proprio lancamento, mas lista o dos outros', async () => {
    const dele = await lancar(c.sub, c.amb, { motivo: motivoUnico('proprio-do-sub') });
    const dela = await lancar(c.ana, c.amb, { motivo: motivoUnico('da-ana-no-painel') });
    const painel = (await c.sub.get('/aprovacao')).texto;
    assert.doesNotMatch(painel, new RegExp(dele.motivo));
    assert.match(painel, new RegExp(dela.motivo));
  });

  it('lancamento ja decidido nao pode ser decidido de novo e nada muda', async () => {
    const { id } = await lancar(c.ana, c.amb);
    await c.sub.post(`/aprovacao/${id}/decidir`, { decisao: 'aprovado', comentario: 'primeira' });
    const de_novo = await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'reprovado', comentario: 'segunda' });
    assert.equal(de_novo.status, 200);
    assert.match(de_novo.texto, /nao pode decidir/);
    const l = statusDe(c.amb, id);
    assert.equal(l.status, 'aprovado');
    assert.equal(l.aprovador_id, c.ids.sub);
    assert.equal(l.comentario, 'primeira');
  });

  for (const decisao of ['banana', 'pendente', '', 'APROVADO']) {
    it(`decisao invalida ('${decisao}') e recusada`, async () => {
      const { id } = await lancar(c.ana, c.amb);
      const r = await c.lider.post(`/aprovacao/${id}/decidir`, { decisao });
      assert.equal(r.status, 200);
      assert.match(r.texto, /Decisao invalida/);
      assert.equal(statusDe(c.amb, id).status, 'pendente');
    });
  }

  it('id inexistente ou com injecao de SQL nao decide nada', async () => {
    const { id } = await lancar(c.ana, c.amb);
    for (const alvo of ['999999', encodeURIComponent('1 OR 1=1'), encodeURIComponent(`${id}; DROP TABLE lancamentos`)]) {
      const r = await c.lider.post(`/aprovacao/${alvo}/decidir`, { decisao: 'aprovado' });
      assert.equal(r.status, 200, alvo);
      assert.match(r.texto, /nao pode decidir/, alvo);
    }
    assert.equal(statusDe(c.amb, id).status, 'pendente');
    assert.ok(c.amb.consulta('SELECT COUNT(*) AS n FROM lancamentos')[0].n > 0, 'tabela continua existindo');
  });

  describe('decisao em lote', () => {
    it('aplica so aos que podem ser decididos e informa quantos', async () => {
      const a = await lancar(c.ana, c.amb);
      const b = await lancar(c.bruno, c.amb);
      const proprio = await lancar(c.sub, c.amb);
      const r = await c.sub.post('/aprovacao/lote', [
        ['decisao', 'aprovado'],
        ['comentario', 'lote ok'],
        ['ids', String(a.id)],
        ['ids', String(b.id)],
        ['ids', String(proprio.id)],
        ['ids', '999999'],
      ]);
      assert.equal(r.status, 200);
      assert.match(r.texto, /2 de 4/);
      assert.equal(statusDe(c.amb, a.id).status, 'aprovado');
      assert.equal(statusDe(c.amb, b.id).status, 'aprovado');
      assert.equal(statusDe(c.amb, a.id).comentario, 'lote ok');
      assert.equal(statusDe(c.amb, proprio.id).status, 'pendente');
    });

    it('aceita um unico id (nao vem como lista) e reprova em lote', async () => {
      const a = await lancar(c.ana, c.amb);
      const r = await c.lider.post('/aprovacao/lote', { decisao: 'reprovado', ids: String(a.id) });
      assert.match(r.texto, /1 de 1/);
      assert.equal(statusDe(c.amb, a.id).status, 'reprovado');
    });

    it('sem nenhum id selecionado: mensagem e nada muda', async () => {
      const r = await c.lider.post('/aprovacao/lote', { decisao: 'aprovado' });
      assert.match(r.texto, /Selecione ao menos um/);
    });

    it('decisao invalida em lote e recusada', async () => {
      const a = await lancar(c.ana, c.amb);
      const r = await c.lider.post('/aprovacao/lote', { decisao: 'banana', ids: String(a.id) });
      assert.match(r.texto, /Decisao invalida/);
      assert.equal(statusDe(c.amb, a.id).status, 'pendente');
    });

    it('colaborador nao consegue decidir em lote (403) e nada muda', async () => {
      const a = await lancar(c.bruno, c.amb);
      const r = await c.ana.post('/aprovacao/lote', { decisao: 'aprovado', ids: String(a.id) });
      assert.equal(r.status, 403);
      assert.equal(statusDe(c.amb, a.id).status, 'pendente');
    });
  });

  it('colaborador ve o resultado e o comentario da decisao na propria tela', async () => {
    const { id, motivo } = await lancar(c.ana, c.amb);
    await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'reprovado', comentario: 'falta anexo do chamado' });
    const pagina = (await c.ana.get('/lancamentos')).texto;
    assert.match(pagina, new RegExp(motivo));
    assert.match(pagina, /status-reprovado/);
    assert.match(pagina, /falta anexo do chamado/);
  });
});
