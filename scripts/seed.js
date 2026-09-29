// Popula o banco com usuarios de teste dos 3 perfis, para desenvolvimento.
// Senha inicial de todos: "trocar123" (troca obrigatoria no primeiro acesso).
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const SENHA_INICIAL = 'trocar123';
const SALT_ROUNDS = 10;

function hashSenha(senha) {
  return bcrypt.hashSync(senha, SALT_ROUNDS);
}

const inserirUsuario = db.prepare(`
  INSERT INTO usuarios (nome, email, senha_hash, perfil, gestor_id, ativo, trocar_senha)
  VALUES (@nome, @email, @senha_hash, @perfil, @gestor_id, 1, 1)
`);

const seed = db.transaction(() => {
  const lider = inserirUsuario.run({
    nome: 'Ana Lider',
    email: 'ana.lider@empresa.com',
    senha_hash: hashSenha(SENHA_INICIAL),
    perfil: 'lider',
    gestor_id: null,
  });

  const sublider = inserirUsuario.run({
    nome: 'Bruno Sublider',
    email: 'bruno.sublider@empresa.com',
    senha_hash: hashSenha(SENHA_INICIAL),
    perfil: 'sublider',
    gestor_id: lider.lastInsertRowid,
  });

  inserirUsuario.run({
    nome: 'Carla Colaboradora',
    email: 'carla.colaboradora@empresa.com',
    senha_hash: hashSenha(SENHA_INICIAL),
    perfil: 'colaborador',
    gestor_id: lider.lastInsertRowid,
  });

  inserirUsuario.run({
    nome: 'Diego Colaborador',
    email: 'diego.colaborador@empresa.com',
    senha_hash: hashSenha(SENHA_INICIAL),
    perfil: 'colaborador',
    gestor_id: lider.lastInsertRowid,
  });
});

seed();

console.log('Seed concluido. Usuarios de teste (senha: trocar123):');
console.log('- lider:       ana.lider@empresa.com');
console.log('- sublider:    bruno.sublider@empresa.com');
console.log('- colaborador: carla.colaboradora@empresa.com');
console.log('- colaborador: diego.colaborador@empresa.com');
