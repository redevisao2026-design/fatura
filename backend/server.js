require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDatabase } = require('./database');
const seedDatabase = require('./seed');
const { ensureUploadBaseDir } = require('./upload-path');
const clientesRoutes = require('./routes/clientes');
const faturasRoutes = require('./routes/faturas');
const empresaRoutes = require('./routes/empresa');
const usuariosRoutes = require('./routes/usuarios');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8080;
const isVercel = !!process.env.VERCEL;
const uploadBaseDir = ensureUploadBaseDir();
let bootstrapPromise = null;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadBaseDir));
app.use(express.static(path.join(__dirname, '../public')));

// Auth routes inline (evita problema de arquivo bloqueado pelo editor)
const authRouter = express.Router();
authRouter.post('/registro', authMiddleware, async (req, res) => {
  if (!req.usuario.is_admin) return res.status(403).json({ erro: 'Apenas admins' });
  const { nome, usuario, email, senha, is_admin } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Campos obrigatorios' });
  try {
    const h = await bcrypt.hash(senha, 10);
    const r = await pool.query(
      'INSERT INTO usuarios (nome,usuario,email,senha,is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nome, usuario, email || null, h, is_admin || 0]
    );
    res.status(201).json({ mensagem: 'Usuario criado', id: r.rows[0].id });
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
    console.error('[Auth] Login:', e);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

if (isVercel) {
  app.use('/api', async (req, res, next) => {
    try {
      await bootstrapDatabase();
      next();
    } catch (err) {
      console.error('❌ Erro ao inicializar banco de dados:', err);
      res.status(500).json({ erro: 'Erro ao inicializar banco de dados' });
    }
  });
}

app.use('/api/auth', authRouter);
app.use('/api/clientes', clientesRoutes);
app.use('/api/faturas', faturasRoutes);
app.use('/api/empresa', empresaRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Atualizar status de faturas vencidas
async function atualizarFaturasVencidas() {
  try {
    const result = await pool.query(`
      UPDATE faturas
      SET status = 'vencido'
      WHERE status = 'pendente'
        AND data_vencimento < CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'
    `);
    console.log(`[Auto-Update] Faturas vencidas atualizadas (${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
  } catch (err) {
    console.error('[Auto-Update] Erro:', err);
  }
}

async function bootstrapDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initDatabase();
      await seedDatabase();
      await atualizarFaturasVencidas();
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }

  return bootstrapPromise;
}

async function start() {
  await bootstrapDatabase();

  setInterval(atualizarFaturasVencidas, 3600000);

  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`⏰ Auto-atualização de status ativada (a cada 1 hora)`);
  });
}

if (require.main === module && !isVercel) {
  start().catch((err) => {
    console.error('❌ Erro ao inicializar:', err);
    process.exit(1);
  });
}

module.exports = app;
