const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('../database');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Diretório base para uploads (persistente em produção)
const uploadBaseDir = (process.env.NODE_ENV === 'production' && fs.existsSync('/app/data'))
  ? '/app/data/uploads'
  : path.join(__dirname, '../../uploads');

// Garante que o diretório exista
if (!fs.existsSync(uploadBaseDir)) {
  fs.mkdirSync(uploadBaseDir, { recursive: true });
}

// Utilitário: resolve caminho real do arquivo, checando diretórios e limpando paths antigos
function resolveUploadPath(fileName) {
  if (!fileName) return null;
  const base = path.basename(fileName); // evita caminhos duplicados
  const candidates = [
    path.join(uploadBaseDir, base),
    path.join(uploadBaseDir, fileName),
    path.join(__dirname, '../../uploads', base),
    path.join(__dirname, '../../uploads', fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // se nenhum existir, retornar primeiro candidato para erro claro
  return candidates[0];
}

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadBaseDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log('[Multer] Arquivo recebido:', file.originalname);
    console.log('[Multer] Mimetype:', file.mimetype);
    
    const ext = path.extname(file.originalname).toLowerCase();
    console.log('[Multer] Extensão:', ext);
    
    // Aceitar CSV, PDF e XLSX
    if (ext === '.pdf' || ext === '.csv' || ext === '.xlsx') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF, CSV e XLSX são permitidos'));
    }
  }
});

// Upload exclusivo para anexos (boletos / notas) - apenas PDF
const uploadAnexos = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF são permitidos para anexos'));
    }
  }
});

// Função auxiliar para obter data atual de Brasília
function getDataBrasilia() {
  const agora = new Date();
  const brasiliaOffset = -3 * 60; // -3 horas em minutos
  const utcTime = agora.getTime() + (agora.getTimezoneOffset() * 60000);
  const brasilia = new Date(utcTime + (brasiliaOffset * 60000));
  return brasilia;
}

// Função auxiliar para formatar data no formato YYYY-MM-DD
function formatarData(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

router.use(authMiddleware);

// Listar faturas (exclui HAVER/vales negativos da visão principal)
router.get('/', (req, res) => {
  // Primeiro, atualizar status das faturas vencidas automaticamente
  const dataAtualBrasilia = formatarData(getDataBrasilia());
  
  db.run(
    `UPDATE faturas 
     SET status = 'vencido' 
     WHERE status = 'pendente' 
     AND data_vencimento < ?`,
    [dataAtualBrasilia],
    (errUpdate) => {
      if (errUpdate) {
        console.error('[Faturas] Erro ao atualizar status vencido:', errUpdate);
      } else {
        console.log('[Faturas] Status de faturas vencidas atualizado automaticamente');
      }
      
      // Depois buscar faturas da visão principal (sem haver/vale negativo)
      const query = `
        SELECT f.*, c.nome as cliente_nome 
        FROM faturas f 
        JOIN clientes c ON f.cliente_id = c.id 
        WHERE LOWER(f.status) != 'haver'
          AND LOWER(f.numero_fatura) != 'haver'
          AND f.valor >= 0
        ORDER BY f.data_vencimento DESC
      `;
      
      db.all(query, (err, faturas) => {
        if (err) {
          return res.status(500).json({ erro: 'Erro ao buscar faturas' });
        }
        res.json(faturas);
      });
    }
  );
});

// Listar haver / vales negativos
router.get('/haver', (req, res) => {
  const query = `
    SELECT f.*, c.nome as cliente_nome
    FROM faturas f
    JOIN clientes c ON f.cliente_id = c.id
    WHERE LOWER(f.status) = 'haver'
       OR LOWER(f.numero_fatura) = 'haver'
       OR f.valor < 0
    ORDER BY f.data_vencimento DESC
  `;
  db.all(query, (err, faturas) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao buscar haver' });
    }
    res.json(faturas);
  });
});

// Criar fatura
router.post('/', (req, res) => {
  const { cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao } = req.body;

  db.run(
    `INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, status || 'pendente', conta_financeira || null, turno || null, pdv || null, observacao || null],
    function(err) {
      if (err) {
        return res.status(400).json({ erro: 'Erro ao criar fatura' });
      }
      res.status(201).json({ mensagem: 'Fatura criada com sucesso', id: this.lastID });
    }
  );
});

// Upload de arquivo (PDF ou CSV)
router.post('/upload', upload.single('arquivo'), (req, res) => {
  console.log('[Upload] Iniciando upload...');
  console.log('[Upload] Arquivo:', req.file);
  console.log('[Upload] Body:', req.body);
  
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  }

  const { cliente_id, empresa_id, numero_fatura, valor, data_vencimento } = req.body;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const tipoArquivo = ext === '.pdf' ? 'pdf' : (ext === '.xlsx' ? 'xlsx' : 'csv');
  
  console.log('[Upload] Tipo de arquivo:', tipoArquivo);
  console.log('[Upload] Empresa ID:', empresa_id);

  if (tipoArquivo === 'csv' || tipoArquivo === 'xlsx') {
    console.log('[Upload] Processando', tipoArquivo.toUpperCase(), '...');
    // Processar CSV ou XLSX
    const faturas = [];
    let erros = [];
    let ultimoClienteNome = ''; // Para linhas sem cliente
    
    if (tipoArquivo === 'xlsx') {
      // Processar XLSX
      console.log('[Upload] Lendo arquivo Excel...');
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0]; // Primeira aba
      const worksheet = workbook.Sheets[sheetName];
      
      // Converter para array de arrays
      const dados = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      console.log('[Upload] Total de linhas no Excel:', dados.length);
      console.log('[Upload] Primeira linha:', dados[0]);
      
      // Pular primeira linha (cabeçalho) e processar dados
      for (let i = 1; i < dados.length; i++) {
        const linha = dados[i];
        
        // Pular linhas vazias
        if (!linha || linha.length === 0 || linha.every(c => !c)) continue;
        
        console.log(`[Upload] Linha ${i + 1} RAW (todas as colunas):`, linha);
        console.log(`[Upload] Total de colunas: ${linha.length}`);
        
        // Detectar qual coluna tem os dados
        // Se coluna 2 (C) tem apenas símbolos/marcas, os dados estão em D, E, F (índices 3, 4, 5)
        // Se coluna 1 (B) tem os dados, usar B, C, D (índices 1, 2, 3)
        let colCliente, colNumero, colData, colValor;
        
        // Verificar se coluna C (índice 2) parece ser uma marca de validação
        const colunaC = linha[2] ? String(linha[2]).trim() : '';
        const ehMarcaValidacao = colunaC === '✓' || colunaC === '✔' || colunaC === 'v' || colunaC === 'V' || colunaC.length <= 2;
        
        if (ehMarcaValidacao && linha.length >= 6) {
          // Formato: A=CLIENTE, C=marca, D=NUMERO, E=DATA, F=VALOR
          console.log('[Upload] Detectado formato com coluna de validação');
          colCliente = 0; // Coluna A
          colNumero = 3;  // Coluna D
          colData = 4;    // Coluna E
          colValor = 5;   // Coluna F
        } else {
          // Formato padrão: A=CLIENTE, B=NUMERO, C=DATA, D=VALOR
          console.log('[Upload] Detectado formato padrão');
          colCliente = 0; // Coluna A
          colNumero = 1;  // Coluna B
          colData = 2;    // Coluna C
          colValor = 3;   // Coluna D
        }
        
        // Deve ter colunas suficientes
        if (linha.length <= colValor) {
          console.log(`[Upload] Linha ${i + 1} ignorada (colunas insuficientes: ${linha.length})`);
          continue;
        }
        
        let clienteNome = linha[colCliente] ? String(linha[colCliente]).trim() : '';
        const numeroFatura = linha[colNumero] ? String(linha[colNumero]).trim() : '';
        const dataVecto = linha[colData] ? String(linha[colData]).trim() : '';
        const valor = linha[colValor] ? String(linha[colValor]).trim() : '';
        
        console.log(`[Upload] Dados extraídos - Cliente: "${clienteNome}", Número: "${numeroFatura}", Data: "${dataVecto}", Valor: "${valor}"`);
        
        // Se cliente está vazio, usar último cliente válido
        if (!clienteNome || clienteNome === '') {
          if (ultimoClienteNome) {
            clienteNome = ultimoClienteNome;
            console.log(`[Upload] Linha ${i + 1} sem cliente, usando último cliente válido: ${clienteNome}`);
          } else {
            console.log(`[Upload] Linha ${i + 1} sem cliente e sem último cliente válido, pulando...`);
          }
        }
        
        // Atualizar último cliente se não estiver vazio
        if (clienteNome && clienteNome !== '') {
          ultimoClienteNome = clienteNome;
        }
        
        // Adicionar à lista
        faturas.push({
          CLIENTE: clienteNome,
          'N° FATURA': numeroFatura,
          'DATA VECTO': dataVecto,
          VALOR: valor
        });
      }
    } else {
      // Processar CSV
      const conteudo = fs.readFileSync(req.file.path, 'utf8');
      const linhas = conteudo.split('\n').filter(l => l.trim() !== '');
      
      console.log('[Upload] Total de linhas:', linhas.length);
      console.log('[Upload] Primeira linha:', linhas[0]);
      
      // Pular primeira linha (cabeçalho)
      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim();
        if (!linha) continue;
        
        // Separar por ponto e vírgula
        const colunas = linha.split(';').map(c => c.trim());
        
        // Remover colunas vazias do final
        while (colunas.length > 0 && colunas[colunas.length - 1] === '') {
          colunas.pop();
        }
        
        // Deve ter pelo menos 4 colunas
        if (colunas.length < 4) {
          console.log(`[Upload] Linha ${i + 1} ignorada (colunas insuficientes: ${colunas.length})`);
          continue;
        }
        
        let clienteNome = colunas[0];
        const numeroFatura = colunas[1];
        const dataVecto = colunas[2];
        const valor = colunas[3];
        
        // Se cliente está vazio, usar último cliente válido
        if (!clienteNome || clienteNome === '') {
          if (ultimoClienteNome) {
            clienteNome = ultimoClienteNome;
            console.log(`[Upload] Linha ${i + 1} sem cliente, usando último cliente válido: ${clienteNome}`);
          } else {
            console.log(`[Upload] Linha ${i + 1} sem cliente e sem último cliente válido, pulando...`);
          }
        }
        
        // Atualizar último cliente se não estiver vazio
        if (clienteNome && clienteNome !== '') {
          ultimoClienteNome = clienteNome;
        }
        
        // Adicionar à lista
        faturas.push({
          CLIENTE: clienteNome,
          'N° FATURA': numeroFatura,
          'DATA VECTO': dataVecto,
          VALOR: valor
        });
      }
    }
    
    console.log('[Upload] CSV processado. Total de faturas:', faturas.length);
    console.log('[Upload] Primeira fatura:', faturas[0]);
    
    // Buscar todos os clientes para fazer o match
    db.all('SELECT id, nome, cpf_cnpj FROM clientes', (err, clientes) => {
      if (err) {
        console.error('[Upload] Erro ao buscar clientes:', err);
        return res.status(500).json({ erro: 'Erro ao buscar clientes' });
      }
      
      console.log('[Upload] Clientes encontrados:', clientes.length);

      const stmt = db.prepare('INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, arquivo_path, tipo_arquivo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      let importadas = 0;
      let clientesCriados = 0;

          // Processar cada fatura sequencialmente
          const processarFatura = (index) => {
            if (index >= faturas.length) {
              // Finalizar após processar todas
              stmt.finalize();

              let mensagem = `${importadas} faturas importadas com sucesso`;
              if (clientesCriados > 0) {
                mensagem += `. ${clientesCriados} clientes novos foram cadastrados automaticamente`;
              }

              if (erros.length > 0) {
                mensagem += `. ${erros.length} erros encontrados`;
                res.json({ 
                  mensagem: mensagem,
                  erros: erros,
                  clientesCriados: clientesCriados,
                  faturasImportadas: importadas
                });
              } else {
                res.json({ 
                  mensagem: mensagem,
                  clientesCriados: clientesCriados,
                  faturasImportadas: importadas
                });
              }
              return;
            }

            const fatura = faturas[index];
            
            console.log(`[Upload] Processando linha ${index + 1}:`, fatura);

            try {
              // Tentar encontrar cliente por nome ou usar cliente_id do CSV
              let clienteId = null;
              
              // Buscar nome do cliente (já normalizado no processamento)
              const nomeClienteRaw = fatura.CLIENTE || fatura.cliente || fatura['CLIENTE'];
              
              console.log(`[Upload] Nome do cliente encontrado: "${nomeClienteRaw}"`);
              
              if (!nomeClienteRaw || nomeClienteRaw.trim() === '') {
                erros.push(`Linha ${index + 2}: Cliente não especificado`);
                processarFatura(index + 1);
                return;
              }
              
              if (nomeClienteRaw && !isNaN(nomeClienteRaw)) {
                // Se for número, é cliente_id direto
                clienteId = nomeClienteRaw;
                processarDadosFatura(clienteId, fatura, index);
              } else if (nomeClienteRaw) {
                // Formato completo: buscar cliente pelo nome
                const nomeCliente = nomeClienteRaw.trim().toUpperCase();
                
                // Busca exata primeiro (nome completo)
                let clienteEncontrado = clientes.find(c => 
                  c.nome.toUpperCase() === nomeCliente
                );
                
                // Se não encontrar exato, busca parcial
                if (!clienteEncontrado) {
                  clienteEncontrado = clientes.find(c => 
                    c.nome.toUpperCase().includes(nomeCliente) || 
                    nomeCliente.includes(c.nome.toUpperCase())
                  );
                }
                
                if (clienteEncontrado) {
                  clienteId = clienteEncontrado.id;
                  console.log(`[Upload] Cliente encontrado: ${clienteEncontrado.nome} (ID: ${clienteId})`);
                  processarDadosFatura(clienteId, fatura, index);
                } else {
                  // Cliente não encontrado - criar novo cliente com CPF temporário (espaço + número)
                  const nomeClienteFinal = nomeClienteRaw.trim();
                  // CPF temporário: espaço seguido de número único para evitar conflito UNIQUE
                  const cpfTemporario = ` ${Date.now()}${index}`;

                  console.log(`[Upload] Criando novo cliente: ${nomeClienteFinal} (CPF temporário)`);

                  db.run(
                    'INSERT INTO clientes (nome, cpf_cnpj, email, telefone, endereco) VALUES (?, ?, NULL, NULL, NULL)',
                    [nomeClienteFinal, cpfTemporario],
                    function(errCliente) {
                      if (errCliente) {
                        console.error(`[Upload] Erro ao criar cliente:`, errCliente);
                        erros.push(`Linha ${index + 2}: Erro ao criar cliente "${nomeCliente}": ${errCliente.message}`);
                        processarFatura(index + 1);
                      } else {
                        clienteId = this.lastID;
                        clientesCriados++;
                        
                        console.log(`[Upload] Cliente criado com ID: ${clienteId}`);
                        
                        // Adicionar o novo cliente à lista para futuras buscas
                        clientes.push({
                          id: clienteId,
                          nome: nomeClienteFinal,
                          cpf_cnpj: cpfTemporario
                        });
                        
                        processarDadosFatura(clienteId, fatura, index);
                      }
                    }
                  );
                  return; // Aguardar callback do INSERT
                }
              } else {
                erros.push(`Linha ${index + 2}: Cliente não especificado`);
                processarFatura(index + 1);
                return;
              }

            } catch (error) {
              console.error(`[Upload] Erro na linha ${index + 2}:`, error);
              erros.push(`Linha ${index + 2}: ${error.message}`);
              processarFatura(index + 1);
            }
          };

          const processarDadosFatura = (clienteId, fatura, index) => {
            try {
              // Processar data de vencimento - aceita múltiplos formatos e nomes de coluna
              let dataVencimento = fatura.data_vencimento || 
                                   fatura.data_vecto || 
                                   fatura['DATA VECTO'] || 
                                   fatura['Data Vecto'] ||
                                   fatura['DATA DE VENCIMENTO'] ||
                                   fatura['Data de Vencimento'] ||
                                   fatura.vencimento;
              
              console.log(`[Upload] Data original: "${dataVencimento}", tipo: ${typeof dataVencimento}`);
              
              // Converter data do Excel (pode ser número serial ou string)
              if (dataVencimento) {
                // Se for número (data serial do Excel)
                if (typeof dataVencimento === 'number') {
                  // Converter número serial do Excel para data
                  const dataExcel = XLSX.SSF.parse_date_code(dataVencimento);
                  dataVencimento = `${dataExcel.y}-${String(dataExcel.m).padStart(2, '0')}-${String(dataExcel.d).padStart(2, '0')}`;
                } 
                // Se for string que parece número serial (apenas dígitos, 5 caracteres)
                else if (typeof dataVencimento === 'string' && /^\d{5}$/.test(dataVencimento.trim())) {
                  console.log('[Upload] String parece número serial do Excel, convertendo...');
                  const numeroSerial = parseInt(dataVencimento);
                  const dataExcel = XLSX.SSF.parse_date_code(numeroSerial);
                  dataVencimento = `${dataExcel.y}-${String(dataExcel.m).padStart(2, '0')}-${String(dataExcel.d).padStart(2, '0')}`;
                }
                // Se for string
                else if (typeof dataVencimento === 'string') {
                  dataVencimento = dataVencimento.trim();
                  
                  // Formato DD/MM/YYYY
                  if (dataVencimento.includes('/')) {
                    const partes = dataVencimento.split('/');
                    if (partes.length === 3) {
                      dataVencimento = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                    }
                  }
                  // Formato DD.MM.YYYY
                  else if (dataVencimento.includes('.')) {
                    const partes = dataVencimento.split('.');
                    if (partes.length === 3) {
                      dataVencimento = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                    }
                  }
                  // Formato DD-MM-YYYY
                  else if (dataVencimento.includes('-') && dataVencimento.indexOf('-') < 3) {
                    const partes = dataVencimento.split('-');
                    if (partes.length === 3 && partes[0].length <= 2) {
                      dataVencimento = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                    }
                  }
                }
              }
              
              console.log(`[Upload] Data processada: "${dataVencimento}"`);
              
              // Se a data ainda estiver vazia, usar data atual como fallback
              if (!dataVencimento || dataVencimento === 'undefined' || dataVencimento === 'null') {
                console.log('[Upload] AVISO: Data vazia, usando data atual');
                dataVencimento = formatarData(getDataBrasilia());
              }

              // Processar valor - aceita múltiplos formatos
              let valorFatura = fatura.valor || fatura.VALOR || fatura['VALOR TOTAL'] || fatura[' VALOR'];
              if (typeof valorFatura === 'string') {
                // Remove "R$" se houver
                valorFatura = valorFatura.replace('R$', '').trim();
                
                // Detectar formato: se tem vírgula, é formato brasileiro (1.500,00)
                // Se tem apenas ponto, é formato americano (1500.00)
                if (valorFatura.includes(',')) {
                  // Formato brasileiro: remove pontos de milhar e substitui vírgula por ponto
                  valorFatura = valorFatura.replace(/\./g, '').replace(',', '.');
                }
                // Se tem apenas ponto, mantém como está (formato americano)
              }
              // Converter para número
              valorFatura = parseFloat(valorFatura) || 0;
              
              console.log(`[Upload] Valor original: "${fatura.valor || fatura.VALOR}", processado: ${valorFatura}`);

              // Processar número da fatura - aceita múltiplas colunas (com trim para remover espaços)
              const numeroFatura = fatura.numero_fatura || 
                                   fatura['N° FATURA'] || 
                                   fatura[' N° FATURA'] || // Com espaço antes
                                   fatura['Nº FATURA'] ||
                                   fatura[' Nº FATURA'] || // Com espaço antes
                                   fatura['NUMERO FATURA'] ||
                                   fatura.nota_fiscal || 
                                   fatura['N° NOTA FISCAL'] ||
                                   fatura['Nº NOTA FISCAL'] ||
                                   fatura.numero_boleto || 
                                   fatura['N° BOLETO'] ||
                                   fatura['Nº BOLETO'] ||
                                   `FAT-${Date.now()}-${index}`;

              // Processar status/situação
              let status = 'pendente';
              const situacao = fatura.situacao || fatura.sit || fatura.SIT;
              if (situacao) {
                const sit = situacao.toString().toUpperCase();
                if (sit.includes('PAGO') || sit.includes('QUITADO')) {
                  status = 'pago';
                } else if (sit.includes('VENCIDO')) {
                  status = 'vencido';
                }
              }
              
              // Verificar se está vencida comparando com data atual de Brasília
              if (status === 'pendente' && dataVencimento) {
                const dataAtualBrasilia = formatarData(getDataBrasilia());
                
                // Comparar datas (formato YYYY-MM-DD permite comparação direta)
                if (dataVencimento < dataAtualBrasilia) {
                  status = 'vencido';
                  console.log(`[Upload] Fatura ${numeroFatura} está VENCIDA (vencimento: ${dataVencimento}, hoje: ${dataAtualBrasilia})`);
                }
              }

              console.log(`[Upload] Processando fatura ${index + 1}:`, {
                clienteId,
                numeroFatura,
                valorFatura,
                dataVencimento,
                status
              });
              
              // VALIDAÇÃO FINAL: Garantir que data_vencimento não seja undefined/null
              if (!dataVencimento) {
                console.error(`[Upload] ERRO: data_vencimento está vazia na fatura ${index + 1}!`);
                console.error(`[Upload] Objeto fatura completo:`, JSON.stringify(fatura, null, 2));
                erros.push(`Linha ${index + 2}: Data de vencimento inválida`);
                processarFatura(index + 1);
                return;
              }

              stmt.run([
                clienteId,
                empresa_id || null,
                numeroFatura,
                valorFatura,
                dataVencimento,
                req.file.filename,
                'csv',
                status
              ]);
              
              importadas++;
              processarFatura(index + 1);
            } catch (error) {
              console.error(`[Upload] Erro ao processar linha ${index + 2}:`, error);
              erros.push(`Linha ${index + 2}: ${error.message}`);
              processarFatura(index + 1);
            }
          };

          // Iniciar processamento
          processarFatura(0);
        });
  } else {
    // Salvar PDF
    db.run(
      'INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, arquivo_path, tipo_arquivo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, req.file.filename, 'pdf'],
      function(err) {
        if (err) {
          return res.status(400).json({ erro: 'Erro ao salvar fatura' });
        }
        res.json({ mensagem: 'Fatura enviada com sucesso', id: this.lastID });
      }
    );
  }
});

// Download de fatura
router.get('/download/:id', (req, res) => {
  db.get('SELECT * FROM faturas WHERE id = ?', [req.params.id], (err, fatura) => {
    if (err || !fatura || !fatura.arquivo_path) {
      return res.status(404).json({ erro: 'Fatura não encontrada' });
    }

    const filePath = resolveUploadPath(fatura.arquivo_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo da fatura não encontrado. Reenvie o anexo.' });
    }
    res.download(filePath);
  });
});

// Download boleto
router.get('/download/:id/boleto', (req, res) => {
  db.get('SELECT boleto_path FROM faturas WHERE id = ?', [req.params.id], (err, fatura) => {
    if (err || !fatura || !fatura.boleto_path) {
      return res.status(404).json({ erro: 'Boleto não encontrado para esta fatura' });
    }
    const filePath = resolveUploadPath(fatura.boleto_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo de boleto ausente. Reenvie o anexo.' });
    }
    res.download(filePath);
  });
});

// Download nota fiscal
router.get('/download/:id/nota', (req, res) => {
  db.get('SELECT nota_path FROM faturas WHERE id = ?', [req.params.id], (err, fatura) => {
    if (err || !fatura || !fatura.nota_path) {
      return res.status(404).json({ erro: 'Nota fiscal não encontrada para esta fatura' });
    }
    const filePath = resolveUploadPath(fatura.nota_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo de nota fiscal ausente. Reenvie o anexo.' });
    }
    res.download(filePath);
  });
});

// Upload de anexos (apenas admin) - boleto e nota fiscal
router.post('/:id/anexos', uploadAnexos.fields([
  { name: 'boleto', maxCount: 1 },
  { name: 'nota', maxCount: 1 }
]), (req, res) => {
  if (!req.usuario || !req.usuario.is_admin) {
    return res.status(403).json({ erro: 'Apenas administradores podem enviar anexos' });
  }

  const { id } = req.params;

  db.get('SELECT boleto_path, nota_path FROM faturas WHERE id = ?', [id], (err, fatura) => {
    if (err || !fatura) {
      return res.status(404).json({ erro: 'Fatura não encontrada' });
    }

    const novoBoleto = req.files?.boleto?.[0]?.filename || null;
    const novaNota = req.files?.nota?.[0]?.filename || null;

    // Apagar arquivos antigos se houver substituição
    const uploadDir = path.join(__dirname, '../../uploads');
    if (novoBoleto && fatura.boleto_path) {
      const antigo = path.join(uploadDir, fatura.boleto_path);
      if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
    }
    if (novaNota && fatura.nota_path) {
      const antigo = path.join(uploadDir, fatura.nota_path);
      if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
    }

    const boletoFinal = novoBoleto || fatura.boleto_path || null;
    const notaFinal = novaNota || fatura.nota_path || null;

    db.run(
      'UPDATE faturas SET boleto_path = ?, nota_path = ? WHERE id = ?',
      [boletoFinal, notaFinal, id],
      function(updateErr) {
        if (updateErr) {
          console.error('[Faturas] Erro ao salvar anexos:', updateErr);
          return res.status(400).json({ erro: 'Erro ao salvar anexos' });
        }
        res.json({
          mensagem: 'Anexos salvos com sucesso',
          boleto_path: boletoFinal,
          nota_path: notaFinal
        });
      }
    );
  });
});

// Atualizar status da fatura (com suporte a haver e vale)
router.put('/:id/status', (req, res) => {
  const { status, valorHaver, valorVale } = req.body;
  const { id } = req.params;

  // Se há haver sendo gerado (valor pago > valor a pagar)
  if (valorHaver && valorHaver > 0) {
    db.run(
      'UPDATE faturas SET status = ?, numero_fatura = ?, valor = ? WHERE id = ?',
      ['haver', 'HAVER', -Math.abs(valorHaver), id],
      function(err) {
        if (err) {
          return res.status(400).json({ erro: 'Erro ao atualizar status e gerar haver' });
        }
        res.json({ mensagem: 'Status atualizado e haver gerado com sucesso' });
      }
    );
  } 
  // Se há vale sendo gerado (valor pago < valor a pagar) - status permanece pendente
  else if (valorVale && valorVale > 0) {
    db.run(
      'UPDATE faturas SET status = ?, numero_fatura = ?, valor = ? WHERE id = ?',
      ['pendente', 'VALE', valorVale, id],
      function(err) {
        if (err) {
          return res.status(400).json({ erro: 'Erro ao atualizar status e gerar vale' });
        }
        res.json({ mensagem: 'Status atualizado e vale gerado com sucesso' });
      }
    );
  }
  else {
    // Atualização normal de status (pagamento total)
    db.run(
      'UPDATE faturas SET status = ? WHERE id = ?',
      [status, id],
      function(err) {
        if (err) {
          return res.status(400).json({ erro: 'Erro ao atualizar status' });
        }
        res.json({ mensagem: 'Status atualizado com sucesso' });
      }
    );
  }
});

// Atualizar fatura completa
router.put('/:id', (req, res) => {
  const { cliente_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao, empresa_id } = req.body;
  const { id } = req.params;

  db.run(
    `UPDATE faturas 
     SET cliente_id = ?, numero_fatura = ?, valor = ?, data_vencimento = ?, status = ?, 
         conta_financeira = ?, turno = ?, pdv = ?, observacao = ?, empresa_id = ?
     WHERE id = ?`,
    [cliente_id, numero_fatura, valor, data_vencimento, status, conta_financeira || null, turno || null, pdv || null, observacao || null, empresa_id || null, id],
    function(err) {
      if (err) {
        return res.status(400).json({ erro: 'Erro ao atualizar fatura' });
      }
      res.json({ mensagem: 'Fatura atualizada com sucesso' });
    }
  );
});

// Deletar fatura
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Primeiro busca o arquivo para deletar
  db.get('SELECT arquivo_path, boleto_path, nota_path FROM faturas WHERE id = ?', [id], (err, fatura) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao buscar fatura' });
    }

    // Deleta os arquivos se existir
    if (fatura && fatura.arquivo_path) {
      const filePath = resolveUploadPath(fatura.arquivo_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    if (fatura && fatura.boleto_path) {
      const filePath = resolveUploadPath(fatura.boleto_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    if (fatura && fatura.nota_path) {
      const filePath = resolveUploadPath(fatura.nota_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Deleta o registro do banco
    db.run('DELETE FROM faturas WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(400).json({ erro: 'Erro ao deletar fatura' });
      }
      res.json({ mensagem: 'Fatura deletada com sucesso' });
    });
  });
});

module.exports = router;
