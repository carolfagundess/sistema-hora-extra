const express = require('express');
const { autenticar } = require('../auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.usuarioId) return res.redirect('/');
  res.render('login', { erro: null });
});

router.post('/login', async (req, res, next) => {
  try {
    await processarLogin(req, res);
  } catch (erro) {
    next(erro);
  }
});

async function processarLogin(req, res) {
  // Validações básicas
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  const resultado = await autenticar(email, senha);

  // Se a autenticação falhar, renderiza a página de login com uma mensagem de erro apropriada
  if (!resultado.ok) {
    const mensagem =
      resultado.motivo === 'muitas_tentativas'
        ? 'Muitas tentativas de login. Tente novamente mais tarde.'
        : 'E-mail ou senha invalidos.';
    return res.status(401).render('login', { erro: mensagem });
  }

  // Se a autenticação for bem-sucedida, armazena o ID do usuário na sessão e redireciona para a página inicial ou para a página de troca de senha, se necessário
  req.session.usuarioId = resultado.usuario.id;

  if (resultado.usuario.trocar_senha) {
    return res.redirect('/trocar-senha');
  }
  res.redirect('/');
}

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
