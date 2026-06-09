const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../database');
const auth = require('../middleware/auth');
const router = express.Router();

const isAdmin = (req, res, next) => {
  if (!req.usuario.is_admin) return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
  next();
};

router.use(auth);

// Listar usuários (apenas admin)
router.get('/', isAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, usuario, email, is_admin FROM usuarios ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar usuários' });
  }
});

// Atualizar usuário
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, usuario, email, senhaAtual, senhaNova, senha, is_admin } = req.body;

  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    const usuarioDb = rows[0];
    if (!usuarioDb) return res.status(404).json({ erro: 'Usuário não encontrado' });

    if (!req.usuario.is_admin) {
      if (parseInt(id) !== req.usuario.id) return res.status(403).json({ erro: 'Acesso negado' });
      if (!senhaAtual || !senhaNova) return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });

      const senhaValida = await bcrypt.compare(senhaAtual, usuarioDb.senha);
      if (!senhaValida) return res.status(401).json({ erro: 'Senha atual incorreta' });

      const senhaHash = await bcrypt.hash(senhaNova, 10);
      await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [senhaHash, id]);
      return res.json({ mensagem: 'Senha atualizada com sucesso' });
    }

    if (!nome || !usuario) return res.status(400).json({ erro: 'Nome e usuário são obrigatórios' });

    const novaSenha = senhaNova || senha;
    if (novaSenha) {
      const senhaHash = await bcrypt.hash(novaSenha, 10);
      await pool.query(
        'UPDATE usuarios SET nome=$1, usuario=$2, email=$3, senha=$4, is_admin=$5 WHERE id=$6',
        [nome, usuario, email || null, senhaHash, is_admin || 0, id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nome=$1, usuario=$2, email=$3, is_admin=$4 WHERE id=$5',
        [nome, usuario, email || null, is_admin || 0, id]
      );
    }
    res.json({ mensagem: 'Usuário atualizado com sucesso' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ erro: 'Este nome de usuário já está em uso' });
    console.error('[Usuarios] Erro ao atualizar:', err);
    res.status(500).json({ erro: 'Erro ao atualizar usuário' });
  }
});

// Deletar usuário (apenas admin, não pode deletar admin)
router.delete('/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (rows[0].is_admin) return res.status(403).json({ erro: 'Não é possível deletar um administrador' });

    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ mensagem: 'Usuário deletado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao deletar usuário' });
  }
});

module.exports = router;
