const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'dados.sqlite');
const conexao = new DatabaseSync(dbPath);

conexao.exec('PRAGMA journal_mode = WAL');
conexao.exec('PRAGMA foreign_keys = ON');

// Fina camada de compatibilidade com a API do better-sqlite3 usada no
// restante do codigo (prepare().run/get/all, exec, transaction).
const db = {
  exec: (sql) => conexao.exec(sql),

  prepare(sql) {
    const stmt = conexao.prepare(sql);
    return {
      run: (...args) => stmt.run(...args),
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
    };
  },

  transaction(fn) {
    return (...args) => {
      conexao.exec('BEGIN');
      try {
        const resultado = fn(...args);
        conexao.exec('COMMIT');
        return resultado;
      } catch (erro) {
        conexao.exec('ROLLBACK');
        throw erro;
      }
    };
  },
};

module.exports = db;
