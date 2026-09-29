// Regras de negocio da aprovacao de lancamentos. Sublider so decide sobre
// lancamentos da propria equipe; lider decide sobre todas. Ninguem aprova
// o proprio lancamento. Toda decisao registra quem e quando.
const db = require('../db');

function listarPendentes(aprovador) {
  if (aprovador.perfil === 'lider') {
    return db
      .prepare(
        `SELECT l.*, u.nome AS usuario_nome, u.equipe AS usuario_equipe
         FROM lancamentos l
         JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.status = 'pendente' AND l.usuario_id != ?
         ORDER BY l.data ASC, l.hora_inicio ASC`
      )
      .all(aprovador.id);
  }

  return db
    .prepare(
      `SELECT l.*, u.nome AS usuario_nome, u.equipe AS usuario_equipe
       FROM lancamentos l
       JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.status = 'pendente' AND u.equipe = ? AND l.usuario_id != ?
       ORDER BY l.data ASC, l.hora_inicio ASC`
    )
    .all(aprovador.equipe, aprovador.id);
}

// Verifica se o aprovador pode decidir sobre este lancamento: precisa estar
// pendente, nao pode ser do proprio aprovador, e sublider so decide da
// propria equipe.
function podeDecidir(aprovador, lancamentoComUsuario) {
  if (!lancamentoComUsuario || lancamentoComUsuario.status !== 'pendente') {
    return false;
  }
  if (lancamentoComUsuario.usuario_id === aprovador.id) {
    return false;
  }
  if (aprovador.perfil === 'sublider' && lancamentoComUsuario.usuario_equipe !== aprovador.equipe) {
    return false;
  }
  return true;
}

function buscarPendentePorId(id) {
  return db
    .prepare(
      `SELECT l.*, u.equipe AS usuario_equipe
       FROM lancamentos l
       JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.id = ?`
    )
    .get(id);
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
// decidir (ja resolvidos por outra pessoa, de outra equipe, ou proprios),
// contando quantos foram de fato aplicados.
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
