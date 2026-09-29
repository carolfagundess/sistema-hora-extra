// Modulo de autenticacao local (MVP). Toda a logica de "quem e o usuario
// logado" fica isolada aqui para permitir trocar por login Microsoft (Entra
// ID) na fase 2 sem alterar o restante do sistema.
const bcrypt = require('bcryptjs');
const db = require('../db');

const MAX_TENTATIVAS = 5;
const tentativasPorEmail = new Map();

function buscarPorEmail(email) {
  return db
    .prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1')
    .get(email);
}

function excedeuTentativas(email) {
  const tentativas = tentativasPorEmail.get(email) || 0;
  return tentativas >= MAX_TENTATIVAS;
}

function registrarFalha(email) {
  const tentativas = tentativasPorEmail.get(email) || 0;
  tentativasPorEmail.set(email, tentativas + 1);
}

function limparTentativas(email) {
  tentativasPorEmail.delete(email);
}

async function autenticar(email, senha) {
  if (excedeuTentativas(email)) {
    return { ok: false, motivo: 'muitas_tentativas' };
  }

  const usuario = buscarPorEmail(email);
  if (!usuario || !usuario.senha_hash) {
    registrarFalha(email);
    return { ok: false, motivo: 'credenciais_invalidas' };
  }

  const senhaConfere = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaConfere) {
    registrarFalha(email);
    return { ok: false, motivo: 'credenciais_invalidas' };
  }

  limparTentativas(email);
  return { ok: true, usuario };
}

// Le o usuario logado a partir da sessao (req.session.usuarioId).
function getUsuarioLogado(req) {
  if (!req.session || !req.session.usuarioId) return null;
  return db
    .prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1')
    .get(req.session.usuarioId);
}

function exigirLogin(req, res, next) {
  const usuario = getUsuarioLogado(req);
  if (!usuario) {
    return res.redirect('/login');
  }
  req.usuarioLogado = usuario;
  next();
}

function exigirPerfil(...perfis) {
  return (req, res, next) => {
    const usuario = req.usuarioLogado || getUsuarioLogado(req);
    if (!usuario || !perfis.includes(usuario.perfil)) {
      return res.status(403).render('erro', {
        mensagem: 'Voce nao tem permissao para acessar esta pagina.',
      });
    }
    next();
  };
}

module.exports = {
  autenticar,
  getUsuarioLogado,
  exigirLogin,
  exigirPerfil,
};
