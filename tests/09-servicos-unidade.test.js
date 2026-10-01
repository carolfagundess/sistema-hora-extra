'use strict';
// Testes unitarios das regras de negocio (banco em memoria, sem servidor).
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

require('../scripts/migrate.js');
const db = require('../src/db');
const usuarios = require('../src/servicos/usuarios');
const lancamentos = require('../src/servicos/lancamentos');
const aprovacao = require('../src/servicos/aprovacao');

let ana, bruno, lider;
before(async () => {
  for (const [nome, email, perfil] of [
    ['Ana', 'ana@teste.com', 'colaborador'],
    ['Bruno', 'bruno@teste.com', 'colaborador'],
    ['Lider', 'lider@teste.com', 'lider'],
  ]) {
    await usuarios.criar({ nome, email, perfil, senhaInicial: 'SenhaForte2026' });
  }
  ana = usuarios.buscarPorEmail('ana@teste.com');
  bruno = usuarios.buscarPorEmail('bruno@teste.com');
  lider = usuarios.buscarPorEmail('lider@teste.com');
});

const novo = (extra = {}) => ({ usuarioId: ana.id, data: '2026-10-10', horaInicio: '18:00', horaFim: '19:00', motivo: 'teste', ...extra });
const criarLanc = (extra) => Number(lancamentos.criar(novo(extra)).lastInsertRowid);
const buscar = (id) => lancamentos.buscarPorId(id);

describe('calculo e formatacao de horas', () => {
  it('calcularMinutos', () => {
    assert.equal(lancamentos.calcularMinutos('18:00', '20:30'), 150);
    assert.equal(lancamentos.calcularMinutos('08:00', '17:00'), 540);
    assert.equal(lancamentos.calcularMinutos('00:00', '23:59'), 1439);
    assert.ok(lancamentos.calcularMinutos('23:00', '01:00') < 0, 'cruzar a meia-noite nao e suportado');
  });

  it('formatarMinutos', () => {
    const f = lancamentos.formatarMinutos;
    assert.equal(f(0), '0h00');
    assert.equal(f(5), '0h05');
    assert.equal(f(59), '0h59');
    assert.equal(f(60), '1h00');
    assert.equal(f(150), '2h30');
    assert.equal(f(540), '9h00');
    assert.equal(f(6000), '100h00');
  });
});

describe('lancamentos.criar / atualizar: validacao', () => {
  it('aceita 00:00-23:59', () => {
    const id = criarLanc({ horaInicio: '00:00', horaFim: '23:59' });
    assert.equal(buscar(id).total_minutos, 1439);
  });

  for (const data of ['xyz', '2026-13-01', '2026-00-10', '2026-10-32', '2026-1-5', '2026-02-30', '2026-04-31', '2027-02-29', '', null, 20261010]) {
    it(`criar recusa data ${JSON.stringify(data)}`, () => {
      assert.throws(() => lancamentos.criar(novo({ data })), /Data invalida/);
    });
  }

  it('aceita 29/02 de ano bissexto', () => {
    assert.doesNotThrow(() => lancamentos.criar(novo({ data: '2028-02-29' })));
  });

  for (const hora of ['24:00', '12:60', '9:00', '09:0', 'ab:cd', '', '12:00:00', null]) {
    it(`criar recusa hora ${JSON.stringify(hora)}`, () => {
      assert.throws(() => lancamentos.criar(novo({ horaInicio: hora })), /Horario invalido/);
      assert.throws(() => lancamentos.criar(novo({ horaFim: hora })), /Horario invalido/);
    });
  }

  it('recusa fim igual ou anterior ao inicio', () => {
    assert.throws(() => lancamentos.criar(novo({ horaInicio: '18:00', horaFim: '18:00' })), /depois do horario inicial/);
    assert.throws(() => lancamentos.criar(novo({ horaInicio: '20:00', horaFim: '18:00' })), /depois do horario inicial/);
  });

  it('motivo: 500 passa, 501 e nao-texto nao', () => {
    assert.doesNotThrow(() => lancamentos.criar(novo({ motivo: 'x'.repeat(500) })));
    assert.throws(() => lancamentos.criar(novo({ motivo: 'x'.repeat(501) })), /Motivo invalido/);
    assert.throws(() => lancamentos.criar(novo({ motivo: 123 })), /Motivo invalido/);
  });

  it('atualizar aplica a mesma validacao e recalcula o total', () => {
    const id = criarLanc();
    assert.throws(() => lancamentos.atualizar(id, { data: '2026-10-10', horaInicio: '99:00', horaFim: '99:30', motivo: 'x' }), /Horario invalido/);
    assert.equal(buscar(id).total_minutos, 60);
    lancamentos.atualizar(id, { data: '2026-10-10', horaInicio: '17:00', horaFim: '20:00', motivo: 'novo' });
    assert.equal(buscar(id).total_minutos, 180);
  });

  it('atualizar e excluir so atuam em lancamento pendente', () => {
    const id = criarLanc();
    db.prepare("UPDATE lancamentos SET status = 'aprovado' WHERE id = ?").run(id);
    lancamentos.atualizar(id, { data: '2026-10-10', horaInicio: '01:00', horaFim: '23:00', motivo: 'x' });
    lancamentos.excluir(id);
    const l = buscar(id);
    assert.ok(l, 'nao pode ter sido excluido');
    assert.equal(l.total_minutos, 60);
  });
});

describe('totais', () => {
  it('totalMinutosDoMes soma apenas aprovados do mes pedido', () => {
    const base = { usuarioId: bruno.id };
    const a = criarLanc({ ...base, data: '2031-05-02', horaInicio: '08:00', horaFim: '10:00' }); // 120
    const b = criarLanc({ ...base, data: '2031-05-20', horaInicio: '08:00', horaFim: '09:00' }); // 60
    criarLanc({ ...base, data: '2031-05-21', horaInicio: '08:00', horaFim: '12:00' }); // pendente
    const d = criarLanc({ ...base, data: '2031-06-01', horaInicio: '08:00', horaFim: '09:00' }); // outro mes
    for (const id of [a, b, d]) db.prepare("UPDATE lancamentos SET status = 'aprovado' WHERE id = ?").run(id);
    assert.equal(lancamentos.totalMinutosDoMes(bruno.id, '2031-05'), 180);
    assert.equal(lancamentos.totalMinutosDoMes(bruno.id, '2031-06'), 60);
    assert.equal(lancamentos.totalMinutosDoMes(bruno.id, '1999-01'), 0);
  });
});

describe('aprovacao', () => {
  it('podeDecidir', () => {
    const pendente = { status: 'pendente', usuario_id: ana.id };
    assert.equal(aprovacao.podeDecidir(lider, pendente), true);
    assert.equal(aprovacao.podeDecidir(ana, pendente), false, 'proprio lancamento');
    assert.equal(aprovacao.podeDecidir(lider, { status: 'aprovado', usuario_id: ana.id }), false);
    assert.equal(aprovacao.podeDecidir(lider, { status: 'reprovado', usuario_id: ana.id }), false);
    assert.equal(aprovacao.podeDecidir(lider, undefined), false);
  });

  it('decidir grava aprovador, data e comentario (nulo quando vazio)', () => {
    const id = criarLanc();
    aprovacao.decidir(id, lider, 'aprovado', undefined);
    const l = buscar(id);
    assert.equal(l.status, 'aprovado');
    assert.equal(l.aprovador_id, lider.id);
    assert.ok(l.decidido_em);
    assert.equal(l.comentario, null);
  });

  it('decidir recusa o proprio lancamento, o ja decidido e o inexistente', () => {
    const meu = criarLanc({ usuarioId: lider.id });
    assert.throws(() => aprovacao.decidir(meu, lider, 'aprovado'), /nao pode decidir/);
    const id = criarLanc();
    aprovacao.decidir(id, lider, 'reprovado');
    assert.throws(() => aprovacao.decidir(id, lider, 'aprovado'), /nao pode decidir/);
    assert.throws(() => aprovacao.decidir(999999, lider, 'aprovado'), /nao pode decidir/);
  });

  it('decidirEmLote ignora o que nao pode e devolve quantos foram aplicados', () => {
    const ok1 = criarLanc();
    const ok2 = criarLanc({ usuarioId: bruno.id });
    const proprio = criarLanc({ usuarioId: lider.id });
    const decidido = criarLanc();
    aprovacao.decidir(decidido, lider, 'reprovado');
    const n = aprovacao.decidirEmLote([ok1, ok2, proprio, decidido, 999999, '1 OR 1=1'], lider, 'aprovado', 'lote');
    assert.equal(n, 2);
    assert.equal(buscar(proprio).status, 'pendente');
    assert.equal(buscar(decidido).status, 'reprovado');
  });

  it('listarPendentes nao inclui os do proprio aprovador nem os ja decididos', () => {
    const meu = criarLanc({ usuarioId: lider.id, motivo: 'meu-pendente' });
    const alheio = criarLanc({ usuarioId: ana.id, motivo: 'alheio-pendente' });
    const motivos = aprovacao.listarPendentes(lider).map((l) => l.motivo);
    assert.ok(motivos.includes('alheio-pendente'));
    assert.ok(!motivos.includes('meu-pendente'));
    assert.ok(aprovacao.listarPendentes(lider).every((l) => l.status === 'pendente'));
    assert.ok(meu && alheio);
  });
});

describe('servicos/usuarios', () => {
  it('criar normaliza e-mail e recusa duplicado sem diferenciar maiusculas', async () => {
    await usuarios.criar({ nome: 'Caixa Alta', email: '  Caixa@Alta.COM ', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' });
    assert.equal(usuarios.buscarPorEmail('caixa@alta.com').email, 'caixa@alta.com');
    await assert.rejects(usuarios.criar({ nome: 'Dup', email: 'CAIXA@alta.com', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' }), /Ja existe/);
  });

  it('criar valida campos, perfil e tamanho da senha', async () => {
    await assert.rejects(usuarios.criar({ nome: '', email: 'a@a.com', perfil: 'colaborador', senhaInicial: 'SenhaForte2026' }), /Preencha/);
    await assert.rejects(usuarios.criar({ nome: 'X', email: 'x1@a.com', perfil: 'admin', senhaInicial: 'SenhaForte2026' }), /Perfil invalido/);
    await assert.rejects(usuarios.criar({ nome: 'X', email: 'x2@a.com', perfil: 'colaborador', senhaInicial: '1234567' }), /pelo menos 8/);
  });

  it('atualizar e redefinirSenha avisam quando o usuario nao existe', async () => {
    assert.throws(() => usuarios.atualizar(999999, { nome: 'X', perfil: 'colaborador', ativo: true }), /Usuario nao encontrado/);
    await assert.rejects(usuarios.redefinirSenha(999999, 'NovaSenha123'), /Usuario nao encontrado/);
    await assert.rejects(usuarios.redefinirSenha(ana.id, '123'), /pelo menos 8/);
  });

  it('redefinirSenha troca o hash e exige nova troca no proximo acesso', async () => {
    db.prepare('UPDATE usuarios SET trocar_senha = 0 WHERE id = ?').run(bruno.id);
    const antes = usuarios.buscarPorId(bruno.id).senha_hash;
    await usuarios.redefinirSenha(bruno.id, 'NovaSenha123');
    const depois = usuarios.buscarPorId(bruno.id);
    assert.notEqual(depois.senha_hash, antes);
    assert.equal(depois.trocar_senha, 1);
  });

  it('listar mostra ativos primeiro, em ordem alfabetica', () => {
    db.prepare("UPDATE usuarios SET ativo = 0 WHERE email = 'ana@teste.com'").run();
    const lista = usuarios.listar();
    const primeiroInativo = lista.findIndex((u) => !u.ativo);
    assert.ok(primeiroInativo > 0);
    assert.ok(lista.slice(primeiroInativo).every((u) => !u.ativo));
    const nomes = lista.slice(0, primeiroInativo).map((u) => u.nome);
    assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b)));
  });
});
