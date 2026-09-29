// Regras de negocio da aprovacao de lancamentos. Sistema de setor unico
// (CRC): sublider e lider aprovam qualquer lancamento pendente, exceto o
// proprio. Toda decisao registra quem e quando.
const db = require('../db');

function listarPendentes(aprovador) {
  return db
    .prepare(
      `SELECT l.*, u.nome AS usuario_nome
       FROM lancamentos l
       JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.status = 'pendente' AND l.usuario_id != ?
       ORDER BY l.data ASC, l.hora_inicio ASC`
    )
    .all(aprovador.id);
}

// Verifica se o aprovador pode decidir sobre este lancamento: precisa
// estar pendente e nao pode ser do proprio aprovador.
function podeDecidir(aprovador, lancamento) {
  if (!lancamento || lancamento.status !== 'pendente') {
    return false;
  }
  if (lancamento.usuario_id === aprovador.id) {
    return false;
  }
  return true;
}

function buscarPendentePorId(id) {
  return db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
}

function decidir(id, aprovador, decisao, comentario) {
  const lancamento = buscarPendentePorId(id);

  if (!podeDecidir(aprovador, lancamento)) {
    throw new Error('Voce nao pode decidir sobre este lancamento.');
  }

  db.prepare(
    `UPDATE lancamentos
     SET status = @decisao, aprovador_id = @aprovadorId,
         decidido_em = datetime('now'), comentario = @comentario
     WHERE id = @id`
  ).run({ id, decisao, aprovadorId: aprovador.id, comentario: comentario || null });
}

// Decide em lote; ignora silenciosamente ids que o aprovador nao pode
// decidir (ja resolvidos por outra pessoa ou proprios), contando quantos
// foram de fato aplicados.
function decidirEmLote(ids, aprovador, decisao, comentario) {
  let aplicados = 0;
  for (const id of ids) {
    const lancamento = buscarPendentePorId(id);
    if (podeDecidir(aprovador, lancamento)) {
      decidir(id, aprovador, decisao, comentario);
      aplicados++;
    }
  }
  return aplicados;
}

module.exports = {
  listarPendentes,
  podeDecidir,
  decidir,
  decidirEmLote,
};
