const path = require('path');
const express = require('express');
const session = require('express-session');
const { exigirLogin, bloquearSeSenhaPendente } = require('./auth');
const loginRoutes = require('./routes/login');
const trocarSenhaRoutes = require('./routes/trocarSenha');
const lancamentosRoutes = require('./routes/lancamentos');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'defina-um-segredo-forte-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
  })
);

app.use(loginRoutes);
app.use(trocarSenhaRoutes);
app.use(lancamentosRoutes);

app.get('/', exigirLogin, bloquearSeSenhaPendente, (req, res) => {
  res.redirect('/lancamentos');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
