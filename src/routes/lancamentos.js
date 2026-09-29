const express = require('express');
const { exigirLogin, bloquearSeSenhaPendente } = require('../auth');
const lancamentosServico = require('../servicos/lancamentos');

const router = express.Router();

router.use(exigirLogin, bloquearSeSenhaPendente);

function mesAtual() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function renderizarLista(req, res, erro) {
  const usuarioId = req.usuarioLogado.id;
  const lancamentos = lancamentosServico.listarPorUsuario(usuarioId);
  const totalMesMinutos = lancamentosServico.totalMinutosDoMes(usuarioId, mesAtual());

  res.render('lancamentos', {
    usuario: req.usuarioLogado,
    lancamentos,
    totalMesFormatado: lancamentosServico.formatarMinutos(totalMesMinutos),
    formatarMinutos: lancamentosServico.formatarMinutos,
    erro,
  });
}

router.get('/lancamentos', (req, res) => {
  renderizarLista(req, res, null);
});

router.post('/lancamentos', (req, res) => {
  const { data, hora_inicio, hora_fim, motivo } = req.body;

  if (!data || !hora_inicio || !hora_fim || !motivo) {
    return renderizarLista(req, res, 'Preencha todos os campos.');
  }

  try {
    lancamentosServico.criar({
      usuarioId: req.usuarioLogado.id,
      data,
      horaInicio: hora_inicio,
      horaFim: hora_fim,
      motivo,
    });
    res.redirect('/lancamentos');
  } catch (erro) {
    renderizarLista(req, res, erro.message);
  }
});

// Garante que o lancamento pertence ao usuario logado e ainda esta pendente
// antes de qualquer edicao ou exclusao.
function carregarLancamentoProprioPendente(req, res, next) {
  const lancamento = lancamentosServico.buscarPorId(req.params.id);

  if (!lancamento || lancamento.usuario_id !== req.usuarioLogado.id) {
    return res.status(403).render('erro', {
      mensagem: 'Lancamento nao encontrado ou nao pertence a voce.',
    });
  }

  if (lancamento.status !== 'pendente') {
    return res.status(403).render('erro', {
      mensagem: 'Somente lancamentos pendentes podem ser alterados ou excluidos.',
    });
  }

  req.lancamento = lancamento;
  next();
}

router.post('/lancamentos/:id/editar', carregarLancamentoProprioPendente, (req, res) => {
  const { data, hora_inicio, hora_fim, motivo } = req.body;

  if (!data || !hora_inicio || !hora_fim || !motivo) {
    return renderizarLista(req, res, 'Preencha todos os campos.');
  }

  try {
    lancamentosServico.atualizar(req.params.id, {
      data,
      horaInicio: hora_inicio,
      horaFim: hora_fim,
      motivo,
    });
    res.redirect('/lancamentos');
  } catch (erro) {
    renderizarLista(req, res, erro.message);
  }
});

router.post('/lancamentos/:id/excluir', carregarLancamentoProprioPendente, (req, res) => {
  lancamentosServico.excluir(req.params.id);
  res.redirect('/lancamentos');
});

module.exports = router;
