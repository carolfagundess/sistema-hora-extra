// Gestao de usuarios (exclusiva do lider). O lider define a senha inicial
// e qualquer redefinicao; em ambos os casos a troca no proximo acesso fica
// obrigatoria (trocar_senha = 1).
const bcrypt = require('bcryptjs');
const db = require('../db');

const PERFIS_VALIDOS = ['colaborador', 'sublider', 'lider'];
const SALT_ROUNDS = 10;

function listar() {
  return db
    .prepare('SELECT * FROM usuarios ORDER BY ativo DESC, nome ASC')
    .all();
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

function buscarPorEmail(email) {
  return db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
}

function validarPerfil(perfil) {
  if (!PERFIS_VALIDOS.includes(perfil)) {
    throw new Error('Perfil invalido.');
  }
}

async function criar({ nome, email, perfil, senhaInicial, gestorId }) {
  if (!nome || !email || !perfil || !senhaInicial) {
    throw new Error('Preencha todos os campos.');
  }
  validarPerfil(perfil);
  if (senhaInicial.length < 8) {
    throw new Error('A senha inicial deve ter pelo menos 8 caracteres.');
  }
  if (buscarPorEmail(email)) {
    throw new Error('Ja existe um usuario com este e-mail.');
  }

  const senhaHash = await bcrypt.hash(senhaInicial, SALT_ROUNDS);

  return db
    .prepare(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, gestor_id, ativo, trocar_senha)
       VALUES (@nome, @email, @senhaHash, @perfil, @gestorId, 1, 1)`
    )
    .run({ nome, email, senhaHash, perfil, gestorId: gestorId || null });
}

// Atualiza dados cadastrais (nome, perfil, ativo). Nao mexe em senha.
function atualizar(id, { nome, perfil, ativo }) {
  validarPerfil(perfil);
  if (!nome) {
    throw new Error('Informe o nome.');
  }

  db.prepare(
    `UPDATE usuarios SET nome = @nome, perfil = @perfil, ativo = @ativo WHERE id = @id`
  ).run({ id, nome, perfil, ativo: ativo ? 1 : 0 });
}

async function redefinirSenha(id, novaSenha) {
  if (!novaSenha || novaSenha.length < 8) {
    throw new Error('A senha deve ter pelo menos 8 caracteres.');
  }
  const senhaHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);
  db.prepare(
    'UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?'
  ).run(senhaHash, id);
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorEmail,
  criar,
  atualizar,
  redefinirSenha,
  PERFIS_VALIDOS,
};
