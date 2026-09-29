// Cria um usuario direto pelo terminal — usado para o bootstrap do
// primeiro lider (antes de existir qualquer conta para logar e usar a
// tela de Gestao de usuarios). Depois do primeiro lider, prefira sempre
// a tela; use este script so quando nao houver outra forma de entrar.
//
// Uso: node scripts/criar-usuario.js "Nome Completo" email@dominio.com perfil senhaInicial
const usuariosServico = require('../src/servicos/usuarios');

const [, , nome, email, perfil, senhaInicial] = process.argv;

if (!nome || !email || !perfil || !senhaInicial) {
  console.error('Uso: node scripts/criar-usuario.js "Nome Completo" email@dominio.com perfil senhaInicial');
  console.error('Perfis validos: colaborador, sublider, lider');
  process.exit(1);
}

usuariosServico
  .criar({ nome, email, perfil, senhaInicial })
  .then(() => {
    console.log(`Usuario criado: ${nome} <${email}> (${perfil})`);
  })
  .catch((erro) => {
    console.error('Erro:', erro.message);
    process.exit(1);
  });
