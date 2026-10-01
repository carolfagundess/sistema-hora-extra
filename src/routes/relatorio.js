const express = require('express');
const ExcelJS = require('exceljs');
const { exigirLogin, bloquearSeSenhaPendente, exigirPerfil } = require('../auth');
const relatorioServico = require('../servicos/relatorio');
const { formatarMinutos } = require('../servicos/lancamentos');

const router = express.Router();

// O prefixo '/relatorio' evita que este middleware intercepte outras
// rotas que passam pelo mesmo router.
router.use('/relatorio', exigirLogin, bloquearSeSenhaPendente, exigirPerfil('sublider', 'lider'));

function mesAtual() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7); // YYYY-MM
}

function mesValido(mes) {
  return typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes);
}

router.get('/relatorio', (req, res) => {
  const anoMes = mesValido(req.query.mes) ? req.query.mes : mesAtual();
  const porPessoa = relatorioServico.totalPorPessoa(anoMes);

  res.render('relatorio', {
    usuario: req.usuarioLogado,
    anoMes,
    porPessoa,
    formatarMinutos,
  });
});

router.get('/relatorio/exportar', async (req, res) => {
  const anoMes = mesValido(req.query.mes) ? req.query.mes : mesAtual();
  const porPessoa = relatorioServico.totalPorPessoa(anoMes);
  const lancamentos = relatorioServico.listarLancamentosDoMes(anoMes);

  const workbook = new ExcelJS.Workbook();

  const resumo = workbook.addWorksheet('Resumo por pessoa');
  resumo.columns = [
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'Perfil', key: 'perfil', width: 14 },
    { header: 'Aprovado (h)', key: 'aprovado', width: 14 },
    { header: 'Pendente (h)', key: 'pendente', width: 14 },
    { header: 'Reprovado (h)', key: 'reprovado', width: 14 },
  ];
  resumo.getRow(1).font = { bold: true };
  porPessoa.forEach((p) => {
    resumo.addRow({
      nome: p.nome,
      perfil: p.perfil,
      aprovado: formatarMinutos(p.minutos_aprovados),
      pendente: formatarMinutos(p.minutos_pendentes),
      reprovado: formatarMinutos(p.minutos_reprovados),
    });
  });

  const detalhe = workbook.addWorksheet('Lancamentos');
  detalhe.columns = [
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Inicio', key: 'inicio', width: 10 },
    { header: 'Fim', key: 'fim', width: 10 },
    { header: 'Total (h)', key: 'total', width: 10 },
    { header: 'Motivo', key: 'motivo', width: 30 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Comentario', key: 'comentario', width: 30 },
  ];
  detalhe.getRow(1).font = { bold: true };
  lancamentos.forEach((l) => {
    detalhe.addRow({
      nome: l.usuario_nome,
      data: l.data,
      inicio: l.hora_inicio,
      fim: l.hora_fim,
      total: formatarMinutos(l.total_minutos),
      motivo: l.motivo,
      status: l.status,
      comentario: l.comentario || '',
    });
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="horas-extras-${anoMes}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
