const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL:', err);
});

// Inicializar tabelas
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        usuario TEXT UNIQUE NOT NULL,
        email TEXT,
        senha TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS empresa (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        razao_social TEXT NOT NULL,
        cnpj TEXT UNIQUE NOT NULL,
        inscricao_estadual TEXT,
        endereco TEXT,
        telefone TEXT,
        email TEXT,
        logo TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        cpf_cnpj TEXT UNIQUE NOT NULL,
        email TEXT,
        telefone TEXT,
        endereco TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS faturas (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        empresa_id INTEGER REFERENCES empresa(id),
        numero_fatura TEXT NOT NULL,
        valor NUMERIC NOT NULL,
        data_vencimento DATE NOT NULL,
        status TEXT DEFAULT 'pendente',
        arquivo_path TEXT,
        tipo_arquivo TEXT,
        boleto_path TEXT,
        nota_path TEXT,
        conta_financeira TEXT,
        turno TEXT,
        pdv TEXT,
        observacao TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Banco de dados PostgreSQL inicializado');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
