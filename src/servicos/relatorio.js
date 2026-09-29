// Relatorio consolidado do setor: total de horas extras por pessoa em um
// mes, com detalhamento por status. Usado no dashboard (visao do setor) e
// na exportacao para Excel.
const db = require('../db');

// Retorna, para cada usuario ativo, o total de minutos aprovados,
// pendentes e reprovados no mes informado (formato 'YYYY-MM').
function totalPorPessoa(anoMes) {
  return db
    .prepare(
      `SELECT
         u.id AS usuario_id,
         u.nome,
         u.perfil,
         COALESCE(SUM(CASE WHEN l.status = 'aprovado' THEN l.total_minutos END), 0) AS minutos_aprovados,
         COALESCE(SUM(CASE WHEN l.status = 'pendente' THEN l.total_minutos END), 0) AS minutos_pendentes,
         COALESCE(SUM(CASE WHEN l.status = 'reprovado' THEN l.total_minutos END), 0) AS minutos_reprovados
       FROM usuarios u
       LEFT JOIN lancamentos l
         ON l.usuario_id = u.id AND substr(l.data, 1, 7) = @anoMes
       WHERE u.ativo = 1
       GROUP BY u.id
       ORDER BY u.nome ASC`
    )
    .all({ anoMes });
}

// Lista os lancamentos do mes (todas as pessoas), usado para o detalhe da
// exportacao em Excel.
function listarLancamentosDoMes(anoMes) {
  return db
    .prepare(
      `SELECT l.*, u.nome AS usuario_nome
       FROM lancamentos l
       JOIN usuarios u ON u.id = l.usuario_id
       WHERE substr(l.data, 1, 7) = @anoMes
       ORDER BY u.nome ASC, l.data ASC`
    )
    .all({ anoMes });
}

module.exports = {
  totalPorPessoa,
  listarLancamentosDoMes,
};
