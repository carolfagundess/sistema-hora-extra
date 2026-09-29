const express = require('express');
const { autenticar } = require('../auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.usuarioId) return res.redirect('/');
  res.render('login', { erro: null });
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const resultado = await autenticar(email, senha);

  if (!resultado.ok) {
    const mensagem =
      resultado.motivo === 'muitas_tentativas'
        ? 'Muitas tentativas de login. Tente novamente mais tarde.'
        : 'E-mail ou senha invalidos.';
    return res.status(401).render('login', { erro: mensagem });
  }

  req.session.usuarioId = resultado.usuario.id;

  if (resultado.usuario.trocar_senha) {
    return res.redirect('/trocar-senha');
  }
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
