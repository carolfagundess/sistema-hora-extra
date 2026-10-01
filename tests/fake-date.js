'use strict';
// Pre-carregado com `node --require tests/fake-date.js src/server.js`.
// Congela "agora" no instante informado em FAKE_NOW (ISO 8601, ex.: 2026-11-01T01:30:00Z)
// para testar virada de mes/fuso sem esperar o relogio real.
const RealDate = Date;
const FIXO = new RealDate(process.env.FAKE_NOW).getTime();
if (Number.isNaN(FIXO)) throw new Error('FAKE_NOW invalido: ' + process.env.FAKE_NOW);

global.Date = new Proxy(RealDate, {
  construct(alvo, args) {
    return args.length === 0 ? new alvo(FIXO) : new alvo(...args);
  },
  apply(alvo) {
    return new alvo(FIXO).toString();
  },
  get(alvo, prop) {
    if (prop === 'now') return () => FIXO;
    return Reflect.get(alvo, prop, alvo);
  },
});
