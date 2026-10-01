// Modulo de autenticacao local (MVP). Toda a logica de "quem e o usuario
// logado" fica isolada aqui para permitir trocar por login Microsoft (Entra
// ID) na fase 2 sem alterar o restante do sistema.
const bcrypt = require('bcryptjs');
const db = require('../db');

const MAX_TENTATIVAS = 5;
const tentativasPorEmail = new Map();
const JANELA_BLOQUEIO_MS = 15 * 60 * 1000; // o bloqueio expira sozinho


function buscarPorEmail(email) {
  return db
    .prepare('SELECT * FROM usuarios WHERE lower(email) = lower(?) AND ativo = 1')
    .get(email);
}

function excedeuTentativas(email) {
  const registro = tentativasPorEmail.get(email);
  if (!registro) return false;
  if (Date.now() - registro.inicio > JANELA_BLOQUEIO_MS) {
    tentativasPorEmail.delete(email);
    return false;
  }
  return registro.total >= MAX_TENTATIVAS;
}

function registrarFalha(email) {
  const registro = tentativasPorEmail.get(email);
  if (!registro || Date.now() - registro.inicio > JANELA_BLOQUEIO_MS) {
    tentativasPorEmail.set(email, { total: 1, inicio: Date.now() });
  } else {
    registro.total++;
  }
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

// Impede o acesso a qualquer tela enquanto a troca de senha obrigatoria
// nao for feita (exceto a propria tela de troca e o logout).
const ROTAS_LIBERADAS_COM_SENHA_PENDENTE = ['/trocar-senha', '/logout'];

function bloquearSeSenhaPendente(req, res, next) {
  const usuario = req.usuarioLogado || getUsuarioLogado(req);
  if (usuario && usuario.trocar_senha && !ROTAS_LIBERADAS_COM_SENHA_PENDENTE.includes(req.path)) {
    return res.redirect('/trocar-senha');
  }
  next();
}

async function alterarSenha(usuarioId, novaSenha) {
  const novoHash = await bcrypt.hash(novaSenha, 10);
  db.prepare(
    'UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?'
  ).run(novoHash, usuarioId);
}

module.exports = {
  autenticar,
  alterarSenha,
  getUsuarioLogado,
  exigirLogin,
  exigirPerfil,
  bloquearSeSenhaPendente,
};
