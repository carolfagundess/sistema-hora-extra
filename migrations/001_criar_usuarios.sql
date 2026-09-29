-- Tabela de usuarios do sistema
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT,
  perfil TEXT NOT NULL CHECK (perfil IN ('colaborador', 'sublider', 'lider')),
  gestor_id INTEGER REFERENCES usuarios(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_usuarios_gestor_id ON usuarios(gestor_id);
