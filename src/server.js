const path = require('path');
const express = require('express');
const session = require('express-session');
const { exigirLogin, bloquearSeSenhaPendente } = require('./auth');
const loginRoutes = require('./routes/login');
const trocarSenhaRoutes = require('./routes/trocarSenha');
const lancamentosRoutes = require('./routes/lancamentos');
const aprovacaoRoutes = require('./routes/aprovacao');
const relatorioRoutes = require('./routes/relatorio');
const usuariosRoutes = require('./routes/usuarios');

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET nao definido. Configure a variavel de ambiente antes de subir em producao.');
  process.exit(1);
}

const app = express();

// Necessario atras de proxy reverso (Caddy/Nginx) para o Express enxergar
// o protocolo original (X-Forwarded-Proto) corretamente.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Cookie "secure" so pode ser ligado depois que o HTTPS estiver ativo no
// proxy (precisa de dominio para o Caddy emitir certificado). Ate la, com
// SESSION_SECURE_COOKIE=false (ou ausente), o login funciona por HTTP puro
// via IP; ligar essa variavel assim que o dominio+HTTPS estiverem no ar.
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'defina-um-segredo-forte-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // bloqueia POST vindo de outro site (CSRF)
      secure: process.env.SESSION_SECURE_COOKIE === 'true',
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  })
);

app.use(loginRoutes);
app.use(trocarSenhaRoutes);
app.use(lancamentosRoutes);
app.use(aprovacaoRoutes);
app.use(relatorioRoutes);
app.use(usuariosRoutes);

app.get('/', exigirLogin, bloquearSeSenhaPendente, (req, res) => {
  if (req.usuarioLogado.perfil === 'lider') {
    return res.redirect('/aprovacao');
  }
  res.redirect('/lancamentos');
});


app.use((req, res) => {
  res.status(404).render('erro', { mensagem: 'Pagina nao encontrada.' });
});

// Qualquer erro nao tratado vira uma pagina de erro, em vez de derrubar o processo.
app.use((erro, req, res, next) => {
  console.error(erro);
  if (res.headersSent) return next(erro);
  res.status(500).render('erro', { mensagem: 'Ocorreu um erro inesperado. Tente novamente.' });
});

process.on('unhandledRejection', (erro) => console.error('unhandledRejection:', erro));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
