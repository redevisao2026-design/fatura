const bcrypt = require('bcryptjs');
const { pool } = require('./database');

async function seedDatabase() {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM usuarios');
  if (parseInt(rows[0].count) === 0) {
    console.log('📝 Criando usuário administrador inicial...');
    const senhaHash = await bcrypt.hash('123456', 10);
    await pool.query(
      'INSERT INTO usuarios (nome, usuario, email, senha, is_admin) VALUES ($1, $2, $3, $4, $5)',
      ['Diogo Alves', 'daoliveira', null, senhaHash, 1]
    );
    console.log('✅ Usuário administrador criado: daoliveira / 123456');
  } else {
    console.log('✅ Banco de dados já possui usuários');
  }
}

module.exports = seedDatabase;
