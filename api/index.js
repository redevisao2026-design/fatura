require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDatabase } = require('../backend/database');
const seedDatabase = require('../backend/seed');
const clientesRoutes = require('../backend/routes/clientes');
const faturasRoutes = require('../backend/routes/faturas');
const empresaRoutes = require('../backend/routes/empresa');
const usuariosRoutes = require('../backend/routes/usuarios');
const authMiddleware = require('../backend/middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// DB init lazy - ANTES de todas as rotas
let dbReady = false;
app.use(async (req, res, next) => {
  if (dbReady) return next();
  try {
    console.log('[DB] DATABASE_URL set:', !!process.env.DATABASE_URL);
    await initDatabase();
    await seedDatabase();
    dbReady = true;
    next();
  } catch(e) {
    console.error('[DB] Init error:', e.message);
    res.status(500).json({ erro: 'Erro ao inicializar banco de dados', detalhe: e.message });
  }
});

// Auth inline
const authRouter = express.Router();
authRouter.post('/registro', authMiddleware, async (req, res) => {
  if (!req.usuario.is_admin) return res.status(403).json({ erro: 'Apenas admins' });
  const { nome, usuario, email, senha, is_admin } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Campos obrigatorios' });
  try {
    const h = await bcrypt.hash(senha, 10);
    const r = await pool.query('INSERT INTO usuarios (nome,usuario,email,senha,is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING id', [nome, usuario, email || null, h, is_admin || 0]);
    res.status(201).json({ mensagem: 'Criado', id: r.rows[0].id });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ erro: 'Usuario ja existe' });
    res.status(500).json({ erro: 'Erro ao criar usuario' });
  }
});
authRouter.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const r = await pool.query('SELECT * FROM usuarios WHERE usuario=$1', [usuario]);
    const u = r.rows[0];
    if (!u) return res.status(401).json({ erro: 'Credenciais invalidas' });
    if (!await bcrypt.compare(senha, u.senha)) return res.status(401).json({ erro: 'Credenciais invalidas' });
    const token = jwt.sign({ id: u.id, usuario: u.usuario, is_admin: u.is_admin || 0 }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, usuario: { id: u.id, nome: u.nome, usuario: u.usuario, email: u.email, is_admin: u.is_admin || 0 } });
  } catch(e) {
    console.error('[Auth] Login error:', e.message);
    res.status(500).json({ erro: 'Erro interno', detalhe: e.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/clientes', clientesRoutes);
app.use('/api/faturas', faturasRoutes);
app.use('/api/empresa', empresaRoutes);
app.use('/api/usuarios', usuariosRoutes);

module.exports = app;
