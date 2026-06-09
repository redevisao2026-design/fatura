const { Pool } = require('pg');

const isVercel = !!process.env.VERCEL;

function validateSupabaseDatabaseUrl(connectionString) {
  if (!connectionString) {
    throw new Error('DATABASE_URL nao configurado. Use a string de conexao do Supabase.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL invalido. Use uma URL PostgreSQL valida do Supabase.');
  }

  const host = parsedUrl.hostname.toLowerCase();
  const allowedHost = host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com');
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (!allowedHost || localHost) {
    throw new Error(
      `DATABASE_URL deve apontar para o Supabase. Host atual: ${parsedUrl.hostname}`
    );
  }

  return connectionString;
}

const pool = new Pool({
  connectionString: validateSupabaseDatabaseUrl(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  max: isVercel ? 1 : 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: isVercel ? 5000 : 30000,
  allowExitOnIdle: true,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Erro inesperado no pool:', err);
});

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

    console.log('[PostgreSQL] Banco de dados inicializado');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
