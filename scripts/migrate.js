// Aplica as migracoes pendentes de /migrations, em ordem, registrando
// as ja aplicadas em uma tabela de controle (migracoes_aplicadas).
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

db.exec(`
  CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
    nome TEXT PRIMARY KEY,
    aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const jaAplicadas = new Set(
  db.prepare('SELECT nome FROM migracoes_aplicadas').all().map((r) => r.nome)
);

const arquivos = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const registrarAplicada = db.prepare(
  'INSERT INTO migracoes_aplicadas (nome) VALUES (?)'
);

for (const arquivo of arquivos) {
  if (jaAplicadas.has(arquivo)) continue;

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, arquivo), 'utf8');
  const aplicar = db.transaction(() => {
    db.exec(sql);
    registrarAplicada.run(arquivo);
  });
  aplicar();
  console.log(`Migracao aplicada: ${arquivo}`);
}

console.log('Migracoes em dia.');
