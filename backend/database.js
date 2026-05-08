const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Usar volume montado no Fly.io se disponível, senão usar local
const dbDir = process.env.NODE_ENV === 'production' && fs.existsSync('/app/data') 
  ? '/app/data' 
  : path.join(__dirname, '../database');

// Criar diretório se não existir
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'faturas.db');
console.log('📁 Banco de dados:', dbPath);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Tabela de usuários
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    email TEXT,
    senha TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migração: adicionar coluna usuario se não existir
  db.all(`PRAGMA table_info(usuarios)`, (err, columns) => {
    if (!err && columns) {
      const hasUsuario = columns.some(col => col.name === 'usuario');
      const hasIsAdmin = columns.some(col => col.name === 'is_admin');
      
      if (!hasUsuario) {
        db.run(`ALTER TABLE usuarios ADD COLUMN usuario TEXT`, (err) => {
          if (!err) {
            console.log('✅ Coluna usuario adicionada com sucesso');
            // Copiar email para usuario para usuários existentes
            db.run(`UPDATE usuarios SET usuario = email WHERE usuario IS NULL`);
          }
        });
      }
      
      if (!hasIsAdmin) {
        db.run(`ALTER TABLE usuarios ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
          if (!err) {
            console.log('✅ Coluna is_admin adicionada com sucesso');
          }
        });
      }
    }
  });

  // Tabela de empresa
  db.run(`CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    cnpj TEXT UNIQUE NOT NULL,
    inscricao_estadual TEXT,
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    logo TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Adicionar coluna inscricao_estadual se não existir (migração)
  db.run(`PRAGMA table_info(empresa)`, (err, rows) => {
    if (!err) {
      db.all(`PRAGMA table_info(empresa)`, (err, columns) => {
        if (!err && columns) {
          const hasIE = columns.some(col => col.name === 'inscricao_estadual');
          if (!hasIE) {
            db.run(`ALTER TABLE empresa ADD COLUMN inscricao_estadual TEXT`, (err) => {
              if (!err) {
                console.log('Coluna inscricao_estadual adicionada com sucesso');
              }
            });
          }
        }
      });
    }
  });

  // Tabela de clientes
  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT UNIQUE NOT NULL,
    email TEXT,
    telefone TEXT,
    endereco TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de faturas
  db.run(`CREATE TABLE IF NOT EXISTS faturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    empresa_id INTEGER,
    numero_fatura TEXT NOT NULL,
    valor REAL NOT NULL,
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
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (empresa_id) REFERENCES empresa(id)
  )`);

  // Adicionar coluna empresa_id se não existir (migração)
  db.run(`PRAGMA table_info(faturas)`, (err, rows) => {
    if (!err) {
      db.all(`PRAGMA table_info(faturas)`, (err, columns) => {
        if (!err && columns) {
          const hasEmpresaId = columns.some(col => col.name === 'empresa_id');
          const hasBoleto = columns.some(col => col.name === 'boleto_path');
          const hasNota = columns.some(col => col.name === 'nota_path');
          const hasConta = columns.some(col => col.name === 'conta_financeira');
          const hasTurno = columns.some(col => col.name === 'turno');
          const hasPdv = columns.some(col => col.name === 'pdv');
          const hasObs = columns.some(col => col.name === 'observacao');
          if (!hasEmpresaId) {
            db.run(`ALTER TABLE faturas ADD COLUMN empresa_id INTEGER REFERENCES empresa(id)`, (err) => {
              if (!err) {
                console.log('Coluna empresa_id adicionada à tabela faturas com sucesso');
              }
            });
          }
          if (!hasBoleto) {
            db.run(`ALTER TABLE faturas ADD COLUMN boleto_path TEXT`, (err) => {
              if (!err) {
                console.log('Coluna boleto_path adicionada à tabela faturas com sucesso');
              }
            });
          }
          if (!hasNota) {
            db.run(`ALTER TABLE faturas ADD COLUMN nota_path TEXT`, (err) => {
              if (!err) {
                console.log('Coluna nota_path adicionada à tabela faturas com sucesso');
              }
            });
          }
          if (!hasConta) db.run(`ALTER TABLE faturas ADD COLUMN conta_financeira TEXT`);
          if (!hasTurno) db.run(`ALTER TABLE faturas ADD COLUMN turno TEXT`);
          if (!hasPdv) db.run(`ALTER TABLE faturas ADD COLUMN pdv TEXT`);
          if (!hasObs) db.run(`ALTER TABLE faturas ADD COLUMN observacao TEXT`);
        }
      });
    }
  });
});

module.exports = db;
