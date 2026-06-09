const express = require('express');
const { pool } = require('../database');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// Listar clientes
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar clientes' });
  }
});

// Criar cliente
router.post('/', async (req, res) => {
  const { nome, cpf_cnpj, email, telefone, endereco } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO clientes (nome, cpf_cnpj, email, telefone, endereco) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nome, cpf_cnpj, email, telefone, endereco]
    );
    res.status(201).json({ mensagem: 'Cliente criado com sucesso', id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado' });
    res.status(400).json({ erro: 'Erro ao criar cliente' });
  }
});

// Atualizar cliente
router.put('/:id', async (req, res) => {
  const { nome, cpf_cnpj, email, telefone, endereco } = req.body;
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE clientes SET nome = $1, cpf_cnpj = $2, email = $3, telefone = $4, endereco = $5 WHERE id = $6',
      [nome, cpf_cnpj, email, telefone, endereco, id]
    );
    res.json({ mensagem: 'Cliente atualizado com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao atualizar cliente' });
  }
});

// Deletar cliente
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Cliente deletado com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao deletar cliente' });
  }
});

module.exports = router;
