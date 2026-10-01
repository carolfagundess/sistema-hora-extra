'use strict';
// Visao do setor (relatorio) e exportacao para Excel.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { cenarioPadrao, lancar, mesAtualBrasilia } = require('./helpers');

describe('relatorio do setor', () => {
  let c;
  const mes = mesAtualBrasilia();

  // devolve o trecho HTML da <tr> que contem o nome
  const linhaDe = (html, nome) => html.split('<tr').find((t) => t.includes(nome)) || '';

  before(async () => {
    c = await cenarioPadrao();
    // Ana: 2h30 aprovado, 1h00 pendente, 0h30 reprovado (no mes) e 5h00 aprovado em 2020 (fora do mes)
    const aprovado = await lancar(c.ana, c.amb, { data: `${mes}-05`, inicio: '18:00', fim: '20:30' });
    await lancar(c.ana, c.amb, { data: `${mes}-06`, inicio: '18:00', fim: '19:00' });
    const reprovado = await lancar(c.ana, c.amb, { data: `${mes}-07`, inicio: '18:00', fim: '18:30' });
    const antigo = await lancar(c.ana, c.amb, { data: '2020-01-10', inicio: '08:00', fim: '13:00' });
    await c.lider.post(`/aprovacao/${aprovado.id}/decidir`, { decisao: 'aprovado' });
    await c.lider.post(`/aprovacao/${reprovado.id}/decidir`, { decisao: 'reprovado' });
    await c.lider.post(`/aprovacao/${antigo.id}/decidir`, { decisao: 'aprovado' });
    await c.amb.usuarioPronto('Inativo Relat', 'inativo@teste.com', 'colaborador');
    const id = c.amb.id('inativo@teste.com');
    await c.lider.post(`/usuarios/${id}/editar`, { nome: 'Inativo Relat', perfil: 'colaborador' });
  });
  after(() => c.amb.parar());

  it('totais por pessoa separados por status e restritos ao mes', async () => {
    const html = (await c.lider.get(`/relatorio?mes=${mes}`)).texto;
    const ana = linhaDe(html, 'Ana Colab');
    assert.match(ana, /2h30/, 'aprovado');
    assert.match(ana, /1h00/, 'pendente');
    assert.match(ana, /0h30/, 'reprovado');
    assert.doesNotMatch(ana, /5h00/, 'lancamento de 2020 nao pode entrar');
  });

  it('o mes de 2020 mostra so o lancamento de 2020', async () => {
    const ana = linhaDe((await c.lider.get('/relatorio?mes=2020-01')).texto, 'Ana Colab');
    assert.match(ana, /5h00/);
    assert.doesNotMatch(ana, /2h30/);
  });

  it('sublider enxerga o mesmo relatorio do lider', async () => {
    const r = await c.sub.get(`/relatorio?mes=${mes}`);
    assert.equal(r.status, 200);
    assert.match(linhaDe(r.texto, 'Ana Colab'), /2h30/);
  });

  it('usuarios inativos nao aparecem', async () => {
    assert.doesNotMatch((await c.lider.get(`/relatorio?mes=${mes}`)).texto, /Inativo Relat/);
  });

  for (const mesRuim of ['abc', '2026-1', '2026-10-01', '"><script>alert(1)</script>', '']) {
    it(`mes invalido ('${mesRuim}') cai no mes atual, sem erro e sem refletir o valor`, async () => {
      const r = await c.lider.get(`/relatorio?mes=${encodeURIComponent(mesRuim)}`);
      assert.equal(r.status, 200);
      assert.match(r.texto, new RegExp(`value="${mes}"`));
      assert.doesNotMatch(r.texto, /<script>alert/);
    });
  }

  it('parametro mes repetido (lista) nao quebra', async () => {
    const r = await c.lider.get('/relatorio?mes=2026-10&mes=2026-11');
    assert.equal(r.status, 200);
    assert.equal(c.amb.vivo(), true);
  });

  it('exporta .xlsx valido com as duas abas e os dados do mes', async () => {
    const r = await c.lider.get(`/relatorio/exportar?mes=${mes}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /spreadsheetml\.sheet/);
    assert.match(r.headers.get('content-disposition'), new RegExp(`horas-extras-${mes}\\.xlsx`));
    assert.equal(r.buffer.subarray(0, 2).toString(), 'PK', 'um .xlsx e um zip');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumo por pessoa', 'Lancamentos']);

    const resumo = wb.getWorksheet('Resumo por pessoa');
    const nomes = [];
    resumo.eachRow((row, n) => n > 1 && nomes.push(row.getCell(1).value));
    assert.ok(nomes.includes('Ana Colab'));
    assert.ok(!nomes.includes('Inativo Relat'));

    const detalhe = wb.getWorksheet('Lancamentos');
    const doMes = [];
    detalhe.eachRow((row, n) => n > 1 && doMes.push(row.getCell(2).value));
    assert.equal(doMes.length, 3, 'so os 3 lancamentos do mes corrente');
    assert.ok(doMes.every((d) => String(d).startsWith(mes)));
  });

  it('texto do motivo com formula nao vira formula no Excel', async () => {
    const { motivo } = await lancar(c.ana, c.amb, { data: `${mes}-08`, motivo: '=HYPERLINK("http://x.test","clique")' });
    const r = await c.lider.get(`/relatorio/exportar?mes=${mes}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer);
    let achou = null;
    wb.getWorksheet('Lancamentos').eachRow((row) => {
      const celula = row.getCell(6);
      if (String(celula.text || celula.value).includes('HYPERLINK')) achou = celula;
    });
    assert.ok(achou, 'motivo presente na planilha ' + motivo);
    assert.equal(achou.type, ExcelJS.ValueType.String, 'precisa ser texto, nao formula');
  });
});
