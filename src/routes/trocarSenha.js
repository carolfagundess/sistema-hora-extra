const express = require('express');
const { exigirLogin, alterarSenha } = require('../auth');

const router = express.Router();

const TAMANHO_MINIMO_SENHA = 8;

router.get('/trocar-senha', exigirLogin, (req, res) => {
  res.render('trocar-senha', { erro: null });
});

router.post('/trocar-senha', exigirLogin, async (req, res) => {
  const { senha_nova, confirmar_senha } = req.body;

  if (!senha_nova || senha_nova.length < TAMANHO_MINIMO_SENHA) {
    return res.status(400).render('trocar-senha', {
      erro: `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`,
    });
  }

  if (senha_nova !== confirmar_senha) {
    return res.status(400).render('trocar-senha', {
      erro: 'As senhas informadas nao conferem.',
    });
  }

  await alterarSenha(req.usuarioLogado.id, senha_nova);
  res.redirect('/');
});

module.exports = router;
