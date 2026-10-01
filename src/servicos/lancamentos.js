// Regras de negocio dos lancamentos de horas extras. O total em minutos e
// sempre calculado aqui, nunca recebido do formulario.
const db = require('../db');

function paraMinutos(horaTexto) {
  const [h, m] = horaTexto.split(':').map(Number);
  return h * 60 + m;
}

// Calcula o total de minutos entre inicio e fim, assumindo que o intervalo
// nao ultrapassa a virada do dia (regra do MVP; lancamentos que cruzam a
// meia-noite devem ser feitos em duas datas).
function calcularMinutos(horaInicio, horaFim) {
  const minutos = paraMinutos(horaFim) - paraMinutos(horaInicio);
  return minutos;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Confere se a data existe no calendario (recusa 30/02, 31/04, 29/02 de ano nao bissexto).
function dataExiste(data) {
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

// O navegador ja restringe os campos, mas o servidor nao pode confiar nisso.
function validarEntrada({ data, horaInicio, horaFim, motivo }) {
  if (typeof data !== 'string' || !RE_DATA.test(data) || !dataExiste(data)) {
    throw new Error('Data invalida.');
  }
  if (!RE_HORA.test(horaInicio) || !RE_HORA.test(horaFim)) {
    throw new Error('Horario invalido (use HH:MM).');
  }
  if (typeof motivo !== 'string' || motivo.length > 500) {
    throw new Error('Motivo invalido (maximo 500 caracteres).');
  }
}

function criar({ usuarioId, data, horaInicio, horaFim, motivo }) {
  validarEntrada({ data, horaInicio, horaFim, motivo });
  const totalMinutos = calcularMinutos(horaInicio, horaFim);
  if (totalMinutos <= 0) {
    throw new Error('O horario final deve ser depois do horario inicial.');
  }

  return db
    .prepare(
      `INSERT INTO lancamentos (usuario_id, data, hora_inicio, hora_fim, total_minutos, motivo, status)
       VALUES (@usuarioId, @data, @horaInicio, @horaFim, @totalMinutos, @motivo, 'pendente')`
    )
    .run({ usuarioId, data, horaInicio, horaFim, totalMinutos, motivo });
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
}

function listarPorUsuario(usuarioId) {
  return db
    .prepare(
      'SELECT * FROM lancamentos WHERE usuario_id = ? ORDER BY data DESC, hora_inicio DESC'
    )
    .all(usuarioId);
}

function totalMinutosDoMes(usuarioId, anoMes) {
  const linha = db
    .prepare(
      `SELECT COALESCE(SUM(total_minutos), 0) AS total
       FROM lancamentos
       WHERE usuario_id = ? AND status = 'aprovado' AND substr(data, 1, 7) = ?`
    )
    .get(usuarioId, anoMes);
  return linha.total;
}

function atualizar(id, { data, horaInicio, horaFim, motivo }) {
  validarEntrada({ data, horaInicio, horaFim, motivo });
  const totalMinutos = calcularMinutos(horaInicio, horaFim);
  if (totalMinutos <= 0) {
    throw new Error('O horario final deve ser depois do horario inicial.');
  }

  db.prepare(
    `UPDATE lancamentos
     SET data = @data, hora_inicio = @horaInicio, hora_fim = @horaFim,
         total_minutos = @totalMinutos, motivo = @motivo
     WHERE id = @id AND status = 'pendente'`
  ).run({ id, data, horaInicio, horaFim, totalMinutos, motivo });
}

function excluir(id) {
  db.prepare("DELETE FROM lancamentos WHERE id = ? AND status = 'pendente'").run(id);
}

function formatarMinutos(totalMinutos) {
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${horas}h${String(minutos).padStart(2, '0')}`;
}

module.exports = {
  calcularMinutos,
  criar,
  buscarPorId,
  listarPorUsuario,
  totalMinutosDoMes,
  atualizar,
  excluir,
  formatarMinutos,
};
