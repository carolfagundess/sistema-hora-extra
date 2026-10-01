'use strict';
// "Mes atual" tem que ser o de Brasilia (UTC-3), nao o de UTC. O servidor roda com o relogio
// congelado (tests/fake-date.js) para testar a virada do mes sem esperar.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { cenarioPadrao, lancar } = require('./helpers');

const CASOS = [
  // [descricao, instante UTC, mes esperado em Brasilia, data do lancamento]
  ['31/10 as 22:30 em Brasilia (ja e 01/11 em UTC)', '2026-11-01T01:30:00Z', '2026-10', '2026-10-31'],
  ['30/09 as 23:00 em Brasilia (ja e 01/10 em UTC)', '2026-10-01T02:00:00Z', '2026-09', '2026-09-30'],
  ['01/11 as 00:30 em Brasilia (virou o mes nos dois fusos)', '2026-11-01T03:30:00Z', '2026-11', '2026-11-01'],
  ['15/10 ao meio-dia (controle)', '2026-10-15T15:00:00Z', '2026-10', '2026-10-15'],
];

for (const [descricao, agoraUtc, mesEsperado, dataLancamento] of CASOS) {
  describe(`mes atual: ${descricao}`, () => {
    let c;
    before(async () => {
      c = await cenarioPadrao({ fakeNow: agoraUtc });
    });
    after(() => c.amb.parar());

    it(`relatorio abre em ${mesEsperado} quando nenhum mes e informado`, async () => {
      const r = await c.lider.get('/relatorio');
      assert.match(r.texto, new RegExp(`value="${mesEsperado}"`));
    });

    it(`"Aprovado no mes" do colaborador considera o mes ${mesEsperado}`, async () => {
      const { id } = await lancar(c.ana, c.amb, { data: dataLancamento, inicio: '18:00', fim: '20:00' });
      await c.lider.post(`/aprovacao/${id}/decidir`, { decisao: 'aprovado' });
      const html = (await c.ana.get('/lancamentos')).texto;
      const valor = html.match(/estatistica-valor[^>]*>\s*([^<\s]+)\s*</)?.[1];
      assert.equal(valor, '2h00');
    });
  });
}
