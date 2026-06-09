const fs = require('fs');
const content = `const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/registro', auth, async (req, res) => {
  if (!req.usuario.is_admin) return res.status(403).json({ erro: 'Apenas admins' });
  const { nome, usuario, email, senha, is_admin } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Campos obrigatorios' });
  try {
    const h = await bcrypt.hash(senha, 10);
    const r = await pool.query(
      'INSERT INTO usuarios (nome,usuario,email,senha,is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nome, usuario, email || null, h, is_admin || 0]
    );
    res.status(201).json({ mensagem: 'Criado', id: r.rows[0].id });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ erro: 'Usuario ja existe' });
    res.status(500).json({ erro: 'Erro ao criar usuario' });
  }
});

router.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const r = await pool.query('SELECT * FROM usuarios WHERE usuario=$1', [usuario]);
    const u = r.rows[0];
    if (!u) return res.status(401).json({ erro: 'Credenciais invalidas' });
    if (!await bcrypt.compare(senha, u.senha)) return res.status(401).json({ erro: 'Credenciais invalidas' });
    const token = jwt.sign(
      { id: u.id, usuario: u.usuario, is_admin: u.is_admin || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, usuario: { id: u.id, nome: u.nome, usuario: u.usuario, email: u.email, is_admin: u.is_admin || 0 } });
  } catch(e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;
`;
fs.writeFileSync(__dirname + '/backend/routes/auth.js', content, 'utf8');
const written = fs.readFileSync(__dirname + '/backend/routes/auth.js', 'utf8');
console.log('Linhas escritas:', written.split('\n').length);
console.log('Contem pool:', written.includes('pool'));
console.log('Contem module.exports:', written.includes('module.exports'));
