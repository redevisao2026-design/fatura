const express = require('express');
const { pool } = require('../database');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// Listar todas as empresas
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM empresa ORDER BY criado_em DESC');
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar empresas' });
  }
});

// Obter uma empresa específica
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM empresa WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Empresa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar empresa' });
  }
});

// Criar nova empresa
router.post('/', async (req, res) => {
  const { nome, razao_social, cnpj, inscricao_estadual, endereco, telefone, email } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO empresa (nome, razao_social, cnpj, inscricao_estadual, endereco, telefone, email) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [nome, razao_social, cnpj, inscricao_estadual, endereco, telefone, email]
    );
    res.status(201).json({ mensagem: 'Empresa criada com sucesso', id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ erro: 'CNPJ já cadastrado' });
    res.status(400).json({ erro: 'Erro ao criar empresa' });
  }
});

// Atualizar empresa existente
router.put('/:id', async (req, res) => {
  const { nome, razao_social, cnpj, inscricao_estadual, endereco, telefone, email } = req.body;
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `UPDATE empresa SET nome=$1, razao_social=$2, cnpj=$3, inscricao_estadual=$4,
       endereco=$5, telefone=$6, email=$7, atualizado_em=CURRENT_TIMESTAMP WHERE id=$8`,
      [nome, razao_social, cnpj, inscricao_estadual, endereco, telefone, email, id]
    );
    if (rowCount === 0) return res.status(404).json({ erro: 'Empresa não encontrada' });
    res.json({ mensagem: 'Empresa atualizada com sucesso', id: parseInt(id) });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao atualizar empresa' });
  }
});

// Deletar empresa
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM empresa WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ erro: 'Empresa não encontrada' });
    res.json({ mensagem: 'Empresa deletada com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao deletar empresa' });
  }
});

module.exports = router;
