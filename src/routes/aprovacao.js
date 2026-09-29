const express = require('express');
const { exigirLogin, exigirPerfil, bloquearSeSenhaPendente } = require('../auth');
const aprovacaoServico = require('../servicos/aprovacao');
const { formatarMinutos } = require('../servicos/lancamentos');

const router = express.Router();

router.use(exigirLogin, bloquearSeSenhaPendente, exigirPerfil('sublider', 'lider'));

function renderizarPainel(req, res, mensagem) {
  const pendentes = aprovacaoServico.listarPendentes(req.usuarioLogado);
  res.render('aprovacao', {
    usuario: req.usuarioLogado,
    pendentes,
    formatarMinutos,
    mensagem,
  });
}

router.get('/aprovacao', (req, res) => {
  renderizarPainel(req, res, null);
});

router.post('/aprovacao/:id/decidir', (req, res) => {
  const { decisao, comentario } = req.body;

  if (decisao !== 'aprovado' && decisao !== 'reprovado') {
    return renderizarPainel(req, res, 'Decisao invalida.');
  }

  try {
    aprovacaoServico.decidir(req.params.id, req.usuarioLogado, decisao, comentario);
    res.redirect('/aprovacao');
  } catch (erro) {
    renderizarPainel(req, res, erro.message);
  }
});

router.post('/aprovacao/lote', (req, res) => {
  const { decisao, comentario, ids } = req.body;

  if (decisao !== 'aprovado' && decisao !== 'reprovado') {
    return renderizarPainel(req, res, 'Decisao invalida.');
  }

  const listaIds = [].concat(ids || []);
  if (listaIds.length === 0) {
    return renderizarPainel(req, res, 'Selecione ao menos um lancamento.');
  }

  const aplicados = aprovacaoServico.decidirEmLote(
    listaIds,
    req.usuarioLogado,
    decisao,
    comentario
  );

  renderizarPainel(
    req,
    res,
    `${aplicados} de ${listaIds.length} lancamento(s) selecionado(s) foram ${decisao}s.`
  );
});

module.exports = router;
