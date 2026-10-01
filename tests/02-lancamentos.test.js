'use strict';
// Lancamento de horas extras (colaborador/sublider): calculo, validacao, edicao e exclusao.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { cenarioPadrao, lancar, statusDe, motivoUnico, mesAtualBrasilia } = require('./helpers');

describe('lancamentos', () => {
  let c;
  before(async () => {
    c = await cenarioPadrao();
  });
  after(() => c.amb.parar());

  const contar = (usuarioId) =>
    c.amb.consulta('SELECT COUNT(*) AS n FROM lancamentos WHERE usuario_id = ?', usuarioId)[0].n;

  it('cria lancamento pendente e calcula o total no servidor (18:00-20:30 = 150 min)', async () => {
    const { resposta, id } = await lancar(c.ana, c.amb, { inicio: '18:00', fim: '20:30' });
    assert.equal(resposta.status, 302);
    assert.equal(resposta.location, '/lancamentos');
    const l = statusDe(c.amb, id);
    assert.equal(l.total_minutos, 150);
    assert.equal(l.status, 'pendente');
    assert.equal(l.usuario_id, c.ids.ana);
    assert.equal(l.aprovador_id, null);
  });

  it('ignora total_minutos e usuario_id enviados pelo cliente', async () => {
    const motivo = motivoUnico('forjado');
    await c.ana.post('/lancamentos', {
      data: `${mesAtualBrasilia()}-10`,
      hora_inicio: '18:00',
      hora_fim: '19:00',
      motivo,
      total_minutos: '9999',
      usuario_id: String(c.ids.bruno),
      status: 'aprovado',
    });
    const l = c.amb.consulta('SELECT * FROM lancamentos WHERE motivo = ?', motivo)[0];
    assert.equal(l.total_minutos, 60);
    assert.equal(l.usuario_id, c.ids.ana);
    assert.equal(l.status, 'pendente');
  });

  it('sublider tambem lanca as proprias horas', async () => {
    const { resposta, id } = await lancar(c.sub, c.amb);
    assert.equal(resposta.status, 302);
    assert.equal(statusDe(c.amb, id).usuario_id, c.ids.sub);
  });

  it('recusa campos em branco', async () => {
    const antes = contar(c.ids.ana);
    const r = await c.ana.post('/lancamentos', { data: '', hora_inicio: '', hora_fim: '', motivo: '' });
    assert.equal(r.status, 200);
    assert.match(r.texto, /Preencha todos os campos/);
    assert.equal(contar(c.ids.ana), antes);
  });

  for (const [inicio, fim] of [
    ['20:00', '18:00'],
    ['18:00', '18:00'],
  ]) {
    it(`recusa horario final nao posterior ao inicial (${inicio}-${fim})`, async () => {
      const antes = contar(c.ids.ana);
      const r = await c.ana.post('/lancamentos', {
        data: `${mesAtualBrasilia()}-10`,
        hora_inicio: inicio,
        hora_fim: fim,
        motivo: motivoUnico(),
      });
      assert.equal(r.status, 200);
      assert.match(r.texto, /horario final deve ser depois/);
      assert.equal(contar(c.ids.ana), antes);
    });
  }

  for (const [inicio, fim] of [
    ['abc', 'def'],
    ['25:00', '26:00'],
    ['18:00', '99:99'],
    ['18:60', '19:00'],
    ['1:00', '2:00'],
    ['18:00:00', '19:00:00'],
    ['', '19:00'],
  ]) {
    it(`recusa hora invalida no servidor ('${inicio}' - '${fim}') sem vazar erro do banco`, async () => {
      const antes = contar(c.ids.ana);
      const r = await c.ana.post('/lancamentos', {
        data: `${mesAtualBrasilia()}-10`,
        hora_inicio: inicio,
        hora_fim: fim,
        motivo: motivoUnico(),
      });
      assert.equal(r.status, 200);
      assert.doesNotMatch(r.texto, /constraint failed|SQLITE|TypeError/i);
      assert.match(r.texto, /Horario invalido|Preencha todos/);
      assert.equal(contar(c.ids.ana), antes);
    });
  }

  for (const data of ['xyz', '2026-13-45', '2026-1-5', '10/10/2026', '2026-02-30', '2026-04-31']) {
    it(`recusa data invalida ('${data}')`, async () => {
      const antes = contar(c.ids.ana);
      const r = await c.ana.post('/lancamentos', { data, hora_inicio: '18:00', hora_fim: '19:00', motivo: motivoUnico() });
      assert.equal(r.status, 200);
      assert.match(r.texto, /Data invalida/);
      assert.equal(contar(c.ids.ana), antes);
    });
  }

  it('motivo: aceita 500 caracteres e recusa 501', async () => {
    const ok = await lancar(c.ana, c.amb, { motivo: 'm'.repeat(500) });
    assert.equal(ok.resposta.status, 302);
    const antes = contar(c.ids.ana);
    const r = await c.ana.post('/lancamentos', {
      data: `${mesAtualBrasilia()}-10`,
      hora_inicio: '18:00',
      hora_fim: '19:00',
      motivo: 'm'.repeat(501),
    });
    assert.equal(r.status, 200);
    assert.match(r.texto, /Motivo invalido/);
    assert.equal(contar(c.ids.ana), antes);
  });

  it('cada pessoa so ve os proprios lancamentos', async () => {
    const { motivo } = await lancar(c.ana, c.amb, { motivo: motivoUnico('so-da-ana') });
    assert.match((await c.ana.get('/lancamentos')).texto, new RegExp(motivo));
    assert.doesNotMatch((await c.bruno.get('/lancamentos')).texto, new RegExp(motivo));
  });

  describe('edicao e exclusao', () => {
    it('edita o proprio pendente e recalcula o total', async () => {
      const { id } = await lancar(c.ana, c.amb, { inicio: '18:00', fim: '19:00' });
      const r = await c.ana.post(`/lancamentos/${id}/editar`, {
        data: `${mesAtualBrasilia()}-11`,
        hora_inicio: '17:00',
        hora_fim: '20:00',
        motivo: 'editado',
      });
      assert.equal(r.status, 302);
      const l = statusDe(c.amb, id);
      assert.equal(l.total_minutos, 180);
      assert.equal(l.motivo, 'editado');
      assert.equal(l.status, 'pendente');
    });

    it('edicao com hora invalida e recusada e preserva o valor anterior', async () => {
      const { id } = await lancar(c.ana, c.amb, { inicio: '18:00', fim: '19:00' });
      const r = await c.ana.post(`/lancamentos/${id}/editar`, {
        data: `${mesAtualBrasilia()}-10`,
        hora_inicio: '99:00',
        hora_fim: '99:30',
        motivo: 'x',
      });
      assert.equal(r.status, 200);
      assert.match(r.texto, /Horario invalido/);
      assert.equal(statusDe(c.amb, id).total_minutos, 60);
    });

    it('nao edita nem exclui lancamento de outra pessoa (403) e nada muda', async () => {
      const { id } = await lancar(c.ana, c.amb, { inicio: '18:00', fim: '19:00', motivo: 'da-ana' });
      const edit = await c.bruno.post(`/lancamentos/${id}/editar`, {
        data: `${mesAtualBrasilia()}-10`,
        hora_inicio: '01:00',
        hora_fim: '23:00',
        motivo: 'invadido',
      });
      assert.equal(edit.status, 403);
      assert.equal((await c.bruno.post(`/lancamentos/${id}/excluir`, {})).status, 403);
      const l = statusDe(c.amb, id);
      assert.equal(l.motivo, 'da-ana');
      assert.equal(l.total_minutos, 60);
    });

    it('lancamento inexistente devolve 403 e nao quebra', async () => {
      assert.equal((await c.ana.post('/lancamentos/999999/editar', { data: '2026-10-10', hora_inicio: '18:00', hora_fim: '19:00', motivo: 'x' })).status, 403);
      assert.equal((await c.ana.post('/lancamentos/999999/excluir', {})).status, 403);
      assert.equal(c.amb.vivo(), true);
    });

    it('exclui o proprio pendente', async () => {
      const { id } = await lancar(c.ana, c.amb);
      const r = await c.ana.post(`/lancamentos/${id}/excluir`, {});
      assert.equal(r.status, 302);
      assert.equal(statusDe(c.amb, id), undefined);
    });

    it('aprovado e reprovado sao imutaveis: nao edita nem exclui (403)', async () => {
      for (const decisao of ['aprovado', 'reprovado']) {
        const { id } = await lancar(c.ana, c.amb, { inicio: '18:00', fim: '19:00' });
        assert.equal((await c.lider.post(`/aprovacao/${id}/decidir`, { decisao })).status, 302);
        const edit = await c.ana.post(`/lancamentos/${id}/editar`, {
          data: `${mesAtualBrasilia()}-10`,
          hora_inicio: '01:00',
          hora_fim: '23:00',
          motivo: 'tentativa',
        });
        assert.equal(edit.status, 403, decisao);
        assert.equal((await c.ana.post(`/lancamentos/${id}/excluir`, {})).status, 403, decisao);
        const l = statusDe(c.amb, id);
        assert.equal(l.total_minutos, 60);
        assert.equal(l.status, decisao);
      }
    });
  });

  it('"Aprovado no mes" soma so lancamentos aprovados do mes corrente', async () => {
    await c.amb.usuarioPronto('Carla Total', 'carla@teste.com', 'colaborador');
    const carla = await c.amb.logar('carla@teste.com');
    const mes = mesAtualBrasilia();
    const aprovado = await lancar(carla, c.amb, { data: `${mes}-05`, inicio: '18:00', fim: '20:30' }); // 2h30
    await lancar(carla, c.amb, { data: `${mes}-06`, inicio: '18:00', fim: '19:00' }); // pendente: nao conta
    const outroMes = await lancar(carla, c.amb, { data: '2020-01-10', inicio: '08:00', fim: '13:00' }); // outro mes
    await c.lider.post(`/aprovacao/${aprovado.id}/decidir`, { decisao: 'aprovado' });
    await c.lider.post(`/aprovacao/${outroMes.id}/decidir`, { decisao: 'aprovado' });
    const pagina = await carla.get('/lancamentos');
    const valor = pagina.texto.match(/estatistica-valor[^>]*>\s*([^<\s]+)\s*</)?.[1];
    assert.equal(valor, '2h30');
  });
});
