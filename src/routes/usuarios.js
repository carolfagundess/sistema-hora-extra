const express = require('express');
const { exigirLogin, bloquearSeSenhaPendente, exigirPerfil } = require('../auth');
const usuariosServico = require('../servicos/usuarios');

const router = express.Router();

// O prefixo '/usuarios' evita que este middleware intercepte outras rotas
// que passam pelo mesmo router.
router.use('/usuarios', exigirLogin, bloquearSeSenhaPendente, exigirPerfil('lider'));

function renderizarLista(req, res, erro, mensagem) {
  res.render('usuarios', {
    usuario: req.usuarioLogado,
    usuarios: usuariosServico.listar(),
    perfis: usuariosServico.PERFIS_VALIDOS,
    erro,
    mensagem,
  });
}

router.get('/usuarios', (req, res) => {
  renderizarLista(req, res, null, null);
});

router.post('/usuarios', async (req, res) => {
  const { nome, email, perfil, senha_inicial } = req.body;

  try {
    await usuariosServico.criar({
      nome,
      email,
      perfil,
      senhaInicial: senha_inicial,
      gestorId: req.usuarioLogado.id,
    });
    renderizarLista(req, res, null, `Usuario ${nome} cadastrado com sucesso.`);
  } catch (erro) {
    renderizarLista(req, res, erro.message, null);
  }
});

router.post('/usuarios/:id/editar', (req, res) => {
  const { nome, perfil } = req.body;
  const ativo = req.body.ativo === 'on';
  const idAlvo = Number(req.params.id);

  if (idAlvo === req.usuarioLogado.id && (!ativo || perfil !== 'lider')) {
    return renderizarLista(req, res, 'Voce nao pode desativar ou rebaixar a propria conta.', null);
  }

  try {
    usuariosServico.atualizar(idAlvo, { nome, perfil, ativo });
    renderizarLista(req, res, null, 'Usuario atualizado.');
  } catch (erro) {
    renderizarLista(req, res, erro.message, null);
  }
});

router.post('/usuarios/:id/redefinir-senha', async (req, res) => {
  const { senha_nova } = req.body;

  try {
    await usuariosServico.redefinirSenha(req.params.id, senha_nova);
    renderizarLista(req, res, null, 'Senha redefinida. O usuario tera que trocar no proximo acesso.');
  } catch (erro) {
    renderizarLista(req, res, erro.message, null);
  }
});

module.exports = router;
