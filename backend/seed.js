const bcrypt = require('bcryptjs');
const { pool } = require('./database');

async function seedDatabase() {
  console.log('[Seed] Garantindo usuario administrador inicial...');

  const senhaHash = await bcrypt.hash('123456', 10);
  await pool.query(
    `INSERT INTO usuarios (nome, usuario, email, senha, is_admin)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (usuario) DO NOTHING`,
    ['Diogo Alves', 'daoliveira', null, senhaHash, 1]
  );

  console.log('[Seed] Seed verificado: daoliveira / 123456');
}

module.exports = seedDatabase;
