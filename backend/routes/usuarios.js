const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const auth = require('../middleware/auth');
const router = express.Router();

// Middleware para verificar se é admin
const isAdmin = (req, res, next) => {
  if (!req.usuario.is_admin) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

// Todas as rotas abaixo exigem usuário autenticado
router.use(auth);

// Listar usuários (apenas admin)
router.get('/', isAdmin, (req, res) => {
  db.all('SELECT id, nome, usuario, email, is_admin FROM usuarios ORDER BY nome', [], (err, usuarios) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao buscar usuários' });
    }
    res.json(usuarios);
  });
});

// Atualizar usuário
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, usuario, email, senhaAtual, senhaNova, senha, is_admin } = req.body;

  // Buscar usuário alvo
  db.get('SELECT * FROM usuarios WHERE id = ?', [id], async (err, usuarioDb) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao buscar usuário' });
    }
    if (!usuarioDb) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    // Se não é admin, só pode alterar a própria senha
    if (!req.usuario.is_admin) {
      if (parseInt(id) !== req.usuario.id) {
        return res.status(403).json({ erro: 'Acesso negado' });
      }

      if (!senhaAtual || !senhaNova) {
        return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });
      }

      const senhaValida = await bcrypt.compare(senhaAtual, usuarioDb.senha);
      if (!senhaValida) {
        return res.status(401).json({ erro: 'Senha atual incorreta' });
      }

      const senhaHash = await bcrypt.hash(senhaNova, 10);
      db.run('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, id], function(updateErr) {
        if (updateErr) {
          console.error('[Usuarios] Erro ao atualizar senha:', updateErr);
          return res.status(500).json({ erro: 'Erro ao atualizar senha' });
        }
        return res.json({ mensagem: 'Senha atualizada com sucesso' });
      });
      return;
    }

    // Fluxo de admin: pode alterar dados e opcionalmente a senha
    if (!nome || !usuario) {
      return res.status(400).json({ erro: 'Nome e usuário são obrigatórios' });
    }

    try {
      let updateQuery;
      let params;
      const novaSenha = senhaNova || senha; // manter compatibilidade com payload antigo

      if (novaSenha) {
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        updateQuery = 'UPDATE usuarios SET nome = ?, usuario = ?, email = ?, senha = ?, is_admin = ? WHERE id = ?';
        params = [nome, usuario, email || null, senhaHash, is_admin || 0, id];
      } else {
        updateQuery = 'UPDATE usuarios SET nome = ?, usuario = ?, email = ?, is_admin = ? WHERE id = ?';
        params = [nome, usuario, email || null, is_admin || 0, id];
      }
      
      db.run(updateQuery, params, function(updateErr) {
        if (updateErr) {
          console.error('[Usuarios] Erro ao atualizar:', updateErr);
          if (updateErr.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ erro: 'Este nome de usuário já está em uso' });
          }
          return res.status(400).json({ erro: 'Erro ao atualizar usuário: ' + updateErr.message });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ erro: 'Usuário não encontrado' });
        }
        
        res.json({ mensagem: 'Usuário atualizado com sucesso' });
      });
    } catch (error) {
      console.error('[Usuarios] Erro ao atualizar:', error);
      res.status(500).json({ erro: 'Erro ao atualizar usuário' });
    }
  });
});

// Deletar usuário (apenas admin, não pode deletar admin)
router.delete('/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  
  // Verificar se o usuário a ser deletado é admin
  db.get('SELECT is_admin FROM usuarios WHERE id = ?', [id], (err, usuario) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao verificar usuário' });
    }
    
    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    
    if (usuario.is_admin) {
      return res.status(403).json({ erro: 'Não é possível deletar um administrador' });
    }
    
    // Deletar usuário
    db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ erro: 'Erro ao deletar usuário' });
      }
      res.json({ mensagem: 'Usuário deletado com sucesso' });
    });
  });
});

module.exports = router;
