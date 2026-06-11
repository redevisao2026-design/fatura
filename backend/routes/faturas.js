const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const XLSX = require('xlsx');
const { pool } = require('../database');
const { ensureUploadBaseDir } = require('../upload-path');
const {
  deleteSupabaseObject,
  fetchSupabaseObject,
  hasSupabaseStorageConfig,
  parseSupabaseRef,
  uploadBufferToSupabase,
} = require('../supabase-storage');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Diretório de uploads compatível com Vercel e execução local
const uploadBaseDir = ensureUploadBaseDir();
const useSupabaseStorage = hasSupabaseStorageConfig();

function resolveUploadPath(fileName) {
  if (!fileName) return null;
  const base = path.basename(fileName);
  const legacyUploadDir = path.join(__dirname, '../../uploads');
  const candidates = [
    path.join(uploadBaseDir, base),
    path.join(uploadBaseDir, fileName),
    path.join(legacyUploadDir, base),
    path.join(legacyUploadDir, fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const storage = useSupabaseStorage
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadBaseDir),
      filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
    });

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.csv', '.xlsx'].includes(ext)) cb(null, true);
    else cb(new Error('Apenas arquivos PDF, CSV e XLSX são permitidos'));
  }
});

const uploadAnexos = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') cb(null, true);
    else cb(new Error('Apenas arquivos PDF são permitidos para anexos'));
  }
});

function getUploadedFileBuffer(file) {
  if (useSupabaseStorage) {
    return file.buffer;
  }

  return fs.readFileSync(file.path);
}

async function persistUploadedFile(file, folder) {
  if (useSupabaseStorage) {
    return uploadBufferToSupabase({
      buffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      folder,
    });
  }

  return file.filename;
}

async function deleteStoredAsset(storedPath) {
  if (!storedPath) return;

  const parsed = parseSupabaseRef(storedPath);
  if (parsed) {
    await deleteSupabaseObject(storedPath);
    return;
  }

  const filePath = resolveUploadPath(storedPath);
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function sendStoredAsset(storedPath, res, fallbackName) {
  const parsed = parseSupabaseRef(storedPath);

  if (parsed) {
    const response = await fetchSupabaseObject(storedPath);
    if (!response) {
      throw new Error('Supabase Storage nao configurado');
    }

    if (!response.ok) {
      const responseText = await response.text();
      const error = new Error(`Erro ao baixar arquivo do Supabase: ${response.status} ${responseText}`);
      error.statusCode = response.status;
      throw error;
    }

    const downloadName = path.basename(parsed.objectPath) || fallbackName || 'arquivo';
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
      return true;
    }

    Readable.fromWeb(response.body).pipe(res);
    return true;
  }

  const filePath = resolveUploadPath(storedPath);
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  res.download(filePath, path.basename(filePath));
  return true;
}

function getDataBrasilia() {
  const agora = new Date();
  const brasiliaOffset = -3 * 60;
  const utcTime = agora.getTime() + (agora.getTimezoneOffset() * 60000);
  return new Date(utcTime + (brasiliaOffset * 60000));
}

function formatarData(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

router.use(authMiddleware);

// Listar faturas
router.get('/', async (req, res) => {
  const dataAtual = formatarData(getDataBrasilia());
  try {
    await pool.query(
      `UPDATE faturas SET status = 'vencido' WHERE status = 'pendente' AND data_vencimento < $1`,
      [dataAtual]
    );
    const { rows } = await pool.query(`
      SELECT f.*, TO_CHAR(f.data_vencimento, 'YYYY-MM-DD') as data_vencimento, c.nome as cliente_nome
      FROM faturas f
      JOIN clientes c ON f.cliente_id = c.id
      WHERE NOT (
        LOWER(f.status) = 'haver'
        OR LOWER(f.numero_fatura) = 'haver'
        OR (f.valor < 0 AND LOWER(f.numero_fatura) <> 'vale')
      )
      ORDER BY f.data_vencimento DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Faturas] Erro ao listar:', err);
    res.status(500).json({ erro: 'Erro ao buscar faturas' });
  }
});

// Listar haver
router.get('/haver', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.*, TO_CHAR(f.data_vencimento, 'YYYY-MM-DD') as data_vencimento, c.nome as cliente_nome
      FROM faturas f
      JOIN clientes c ON f.cliente_id = c.id
      WHERE LOWER(f.status) = 'haver'
         OR LOWER(f.numero_fatura) = 'haver'
      ORDER BY f.data_vencimento DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar haver' });
  }
});

// Criar fatura
router.post('/', async (req, res) => {
  const { cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, status || 'pendente', conta_financeira || null, turno || null, pdv || null, observacao || null]
    );
    res.status(201).json({ mensagem: 'Fatura criada com sucesso', id: rows[0].id });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao criar fatura' });
  }
});

// Upload de arquivo (PDF, CSV ou XLSX)
router.post('/upload', upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

  const { cliente_id, empresa_id, numero_fatura, valor, data_vencimento } = req.body;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const tipoArquivo = ext === '.pdf' ? 'pdf' : (ext === '.xlsx' ? 'xlsx' : 'csv');

  if (tipoArquivo === 'csv' || tipoArquivo === 'xlsx') {
    const faturas = [];
    let ultimoClienteNome = '';
    const fileBuffer = getUploadedFileBuffer(req.file);

    if (tipoArquivo === 'xlsx') {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const dados = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });

      for (let i = 1; i < dados.length; i++) {
        const linha = dados[i];
        if (!linha || linha.every(c => !c)) continue;

        const colunaC = linha[2] ? String(linha[2]).trim() : '';
        const ehMarca = ['✓','✔','v','V'].includes(colunaC) || colunaC.length <= 2;
        const [colCliente, colNumero, colData, colValor] = ehMarca && linha.length >= 6
          ? [0, 3, 4, 5] : [0, 1, 2, 3];

        if (linha.length <= colValor) continue;

        let clienteNome = linha[colCliente] ? String(linha[colCliente]).trim() : '';
        if (!clienteNome && ultimoClienteNome) clienteNome = ultimoClienteNome;
        if (clienteNome) ultimoClienteNome = clienteNome;

        faturas.push({
          CLIENTE: clienteNome,
          'N° FATURA': linha[colNumero] ? String(linha[colNumero]).trim() : '',
          'DATA VECTO': linha[colData] ? String(linha[colData]).trim() : '',
          VALOR: linha[colValor] ? String(linha[colValor]).trim() : ''
        });
      }
    } else {
      const linhas = fileBuffer.toString('utf8').replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
      for (let i = 1; i < linhas.length; i++) {
        const colunas = linhas[i].trim().split(';').map(c => c.trim());
        while (colunas.length > 0 && !colunas[colunas.length - 1]) colunas.pop();
        if (colunas.length < 4) continue;

        let clienteNome = colunas[0];
        if (!clienteNome && ultimoClienteNome) clienteNome = ultimoClienteNome;
        if (clienteNome) ultimoClienteNome = clienteNome;

        faturas.push({ CLIENTE: clienteNome, 'N° FATURA': colunas[1], 'DATA VECTO': colunas[2], VALOR: colunas[3] });
      }
    }

    try {
      const arquivoPath = await persistUploadedFile(req.file, 'faturas/importacoes');
      const { rows: clientes } = await pool.query('SELECT id, nome, cpf_cnpj FROM clientes');
      let importadas = 0, clientesCriados = 0;
      const erros = [];

      for (let index = 0; index < faturas.length; index++) {
        const fatura = faturas[index];
        const nomeClienteRaw = fatura.CLIENTE;

        if (!nomeClienteRaw || !nomeClienteRaw.trim()) {
          erros.push(`Linha ${index + 2}: Cliente não especificado`);
          continue;
        }

        let clienteId = null;

        if (!isNaN(nomeClienteRaw)) {
          clienteId = parseInt(nomeClienteRaw);
        } else {
          const nomeUpper = nomeClienteRaw.trim().toUpperCase();
          let encontrado = clientes.find(c => c.nome.toUpperCase() === nomeUpper)
            || clientes.find(c => c.nome.toUpperCase().includes(nomeUpper) || nomeUpper.includes(c.nome.toUpperCase()));

          if (encontrado) {
            clienteId = encontrado.id;
          } else {
            const cpfTemp = ` ${Date.now()}${index}`;
            const { rows: novo } = await pool.query(
              'INSERT INTO clientes (nome, cpf_cnpj) VALUES ($1, $2) RETURNING id',
              [nomeClienteRaw.trim(), cpfTemp]
            );
            clienteId = novo[0].id;
            clientesCriados++;
            clientes.push({ id: clienteId, nome: nomeClienteRaw.trim(), cpf_cnpj: cpfTemp });
          }
        }

        // Processar data
        let dataVencimento = fatura['DATA VECTO'] || fatura.data_vencimento || fatura.vencimento;
        if (dataVencimento) {
          if (typeof dataVencimento === 'number') {
            const d = XLSX.SSF.parse_date_code(dataVencimento);
            dataVencimento = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          } else if (/^\d{5}$/.test(String(dataVencimento).trim())) {
            const d = XLSX.SSF.parse_date_code(parseInt(dataVencimento));
            dataVencimento = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
          } else {
            dataVencimento = String(dataVencimento).trim();
            if (dataVencimento.includes('/')) {
              const [d, m, y] = dataVencimento.split('/');
              dataVencimento = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
            } else if (dataVencimento.includes('.')) {
              const [d, m, y] = dataVencimento.split('.');
              dataVencimento = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
            } else if (dataVencimento.includes('-') && dataVencimento.indexOf('-') < 3) {
              const parts = dataVencimento.split('-');
              if (parts[0].length <= 2) dataVencimento = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            }
          }
        }
        if (!dataVencimento || dataVencimento === 'undefined') dataVencimento = formatarData(getDataBrasilia());

        // Processar valor
        let valorFatura = fatura.VALOR || fatura.valor || fatura['VALOR TOTAL'];
        if (typeof valorFatura === 'string') {
          valorFatura = valorFatura.replace('R$', '').trim();
          if (valorFatura.includes(',')) valorFatura = valorFatura.replace(/\./g, '').replace(',', '.');
        }
        valorFatura = parseFloat(valorFatura) || 0;

        // Processar número da fatura
        const numeroFatura = fatura['N° FATURA'] || fatura['Nº FATURA'] || fatura.numero_fatura || `FAT-${Date.now()}-${index}`;

        // Status
        let status = 'pendente';
        const sit = fatura.situacao || fatura.SIT;
        if (sit) {
          const s = sit.toString().toUpperCase();
          if (s.includes('PAGO') || s.includes('QUITADO')) status = 'pago';
          else if (s.includes('VENCIDO')) status = 'vencido';
        }
        if (status === 'pendente' && dataVencimento < formatarData(getDataBrasilia())) status = 'vencido';

        await pool.query(
          `INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, arquivo_path, tipo_arquivo, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [clienteId, empresa_id || null, numeroFatura, valorFatura, dataVencimento, arquivoPath, 'csv', status]
        );
        importadas++;
      }

      let mensagem = `${importadas} faturas importadas com sucesso`;
      if (clientesCriados > 0) mensagem += `. ${clientesCriados} clientes novos cadastrados automaticamente`;
      if (erros.length > 0) mensagem += `. ${erros.length} erros encontrados`;

      res.json({ mensagem, erros, clientesCriados, faturasImportadas: importadas });
    } catch (err) {
      console.error('[Upload] Erro:', err);
      res.status(500).json({ erro: 'Erro ao processar arquivo' });
    }
  } else {
    // PDF
    try {
      const arquivoPath = await persistUploadedFile(req.file, 'faturas/importacoes');
      const { rows } = await pool.query(
        'INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, arquivo_path, tipo_arquivo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, arquivoPath, 'pdf']
      );
      res.json({ mensagem: 'Fatura enviada com sucesso', id: rows[0].id });
    } catch (err) {
      res.status(400).json({ erro: 'Erro ao salvar fatura' });
    }
  }
});

// Download fatura
router.get('/download/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM faturas WHERE id = $1', [req.params.id]);
    const fatura = rows[0];
    if (!fatura || !fatura.arquivo_path) return res.status(404).json({ erro: 'Fatura não encontrada' });
    const sent = await sendStoredAsset(fatura.arquivo_path, res, `fatura-${req.params.id}`);
    if (!sent) return res.status(404).json({ erro: 'Arquivo da fatura não encontrado. Reenvie o anexo.' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ erro: 'Erro ao baixar fatura' });
    }
    res.status(500).json({ erro: 'Erro ao baixar fatura' });
  }
});

// Download boleto
router.get('/download/:id/boleto', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT boleto_path FROM faturas WHERE id = $1', [req.params.id]);
    const fatura = rows[0];
    if (!fatura || !fatura.boleto_path) return res.status(404).json({ erro: 'Boleto não encontrado' });
    const sent = await sendStoredAsset(fatura.boleto_path, res, `boleto-${req.params.id}`);
    if (!sent) return res.status(404).json({ erro: 'Arquivo de boleto ausente. Reenvie o anexo.' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ erro: 'Erro ao baixar boleto' });
    }
    res.status(500).json({ erro: 'Erro ao baixar boleto' });
  }
});

// Download nota fiscal
router.get('/download/:id/nota', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nota_path FROM faturas WHERE id = $1', [req.params.id]);
    const fatura = rows[0];
    if (!fatura || !fatura.nota_path) return res.status(404).json({ erro: 'Nota fiscal não encontrada' });
    const sent = await sendStoredAsset(fatura.nota_path, res, `nota-${req.params.id}`);
    if (!sent) return res.status(404).json({ erro: 'Arquivo de nota fiscal ausente. Reenvie o anexo.' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ erro: 'Erro ao baixar nota' });
    }
    res.status(500).json({ erro: 'Erro ao baixar nota' });
  }
});

// Upload de anexos (boleto e nota fiscal) - apenas admin
router.post('/:id/anexos', uploadAnexos.fields([
  { name: 'boleto', maxCount: 1 },
  { name: 'nota', maxCount: 1 }
]), async (req, res) => {
  if (!req.usuario || !req.usuario.is_admin) return res.status(403).json({ erro: 'Apenas administradores podem enviar anexos' });

  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT boleto_path, nota_path FROM faturas WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Fatura não encontrada' });

    const fatura = rows[0];
    const novoBoletoArquivo = req.files?.boleto?.[0] || null;
    const novaNotaArquivo = req.files?.nota?.[0] || null;
    const novoBoleto = novoBoletoArquivo ? await persistUploadedFile(novoBoletoArquivo, `faturas/${id}/boleto`) : null;
    const novaNota = novaNotaArquivo ? await persistUploadedFile(novaNotaArquivo, `faturas/${id}/nota`) : null;

    if (novoBoleto && fatura.boleto_path) {
      await deleteStoredAsset(fatura.boleto_path);
    }
    if (novaNota && fatura.nota_path) {
      await deleteStoredAsset(fatura.nota_path);
    }

    await pool.query(
      'UPDATE faturas SET boleto_path = $1, nota_path = $2 WHERE id = $3',
      [novoBoleto || fatura.boleto_path, novaNota || fatura.nota_path, id]
    );
    res.json({ mensagem: 'Anexos salvos com sucesso' });
  } catch (err) {
    console.error('[Faturas] Erro ao salvar anexos:', err);
    res.status(400).json({ erro: 'Erro ao salvar anexos' });
  }
});

// Atualizar apenas o status da fatura
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const {
    status,
    valorHaver = 0,
    valorVale = 0,
    conta_financeira: contaFinanceira = null,
    data_pagamento: dataPagamento = null,
  } = req.body;
  const novoStatus = String(status || '').trim();
  const contaFinanceiraNormalizada = String(contaFinanceira || '').trim() || null;
  const dataPagamentoNormalizada = String(dataPagamento || '').trim() || null;
  const valorHaverNum = Math.abs(Number(valorHaver) || 0);
  const valorValeNum = Math.abs(Number(valorVale) || 0);
  const valorCredito = valorHaverNum > 0 ? valorHaverNum : valorValeNum;
  const tipoCredito = valorHaverNum > 0 ? 'HAVER' : (valorValeNum > 0 ? 'VALE' : null);
  const statusCredito = valorHaverNum > 0 ? 'haver' : (valorValeNum > 0 ? 'vale' : null);

  if (!novoStatus) {
    return res.status(400).json({ erro: 'Status inválido' });
  }

  try {
    const client = await pool.connect();
    const anexosParaExcluir = [];

    try {
      await client.query('BEGIN');

      const { rows: faturaRows } = await client.query(
        'SELECT * FROM faturas WHERE id = $1 FOR UPDATE',
        [id]
      );

      const faturaAtual = faturaRows[0];
      if (!faturaAtual) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Fatura não encontrada' });
      }

      anexosParaExcluir.push(
        ...(faturaAtual.arquivo_path ? [faturaAtual.arquivo_path] : []),
        ...(faturaAtual.boleto_path ? [faturaAtual.boleto_path] : []),
        ...(faturaAtual.nota_path ? [faturaAtual.nota_path] : [])
      );

      let creditoGerado = null;
      let respostaId = Number(id);
      let respostaStatus = novoStatus;
      let faturaRemovida = false;

      if (novoStatus === 'pago' && valorCredito > 0 && tipoCredito) {
        const dataCredito = dataPagamentoNormalizada || formatarData(getDataBrasilia());
        const observacaoBase = faturaAtual.observacao ? `${faturaAtual.observacao} | ` : '';
        const observacaoCredito = `${observacaoBase}${tipoCredito.toLowerCase()} gerado da fatura ${faturaAtual.numero_fatura} (ID ${faturaAtual.id})`;

        const { rows: creditoRows } = await client.query(
          `INSERT INTO faturas (
            cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status,
            conta_financeira, turno, pdv, observacao
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id, numero_fatura, valor, status`,
          [
            faturaAtual.cliente_id,
            faturaAtual.empresa_id,
            tipoCredito,
            -valorCredito,
            dataCredito,
            statusCredito,
            contaFinanceiraNormalizada || faturaAtual.conta_financeira || null,
            faturaAtual.turno || null,
            faturaAtual.pdv || null,
            observacaoCredito
          ]
        );

        creditoGerado = creditoRows[0];

        if (valorValeNum > 0) {
          await client.query('DELETE FROM faturas WHERE id = $1', [id]);
          faturaRemovida = true;
          respostaId = creditoGerado.id;
          respostaStatus = creditoGerado.status;
        } else {
          const { rows: rowsAtualizadas } = await client.query(
            'UPDATE faturas SET status = $1, conta_financeira = COALESCE($3, conta_financeira) WHERE id = $2 RETURNING id, status',
            [novoStatus, id, contaFinanceiraNormalizada]
          );
          respostaId = rowsAtualizadas[0].id;
          respostaStatus = rowsAtualizadas[0].status;
        }
      } else {
        const { rows: rowsAtualizadas } = await client.query(
          'UPDATE faturas SET status = $1, conta_financeira = COALESCE($3, conta_financeira) WHERE id = $2 RETURNING id, status',
          [novoStatus, id, contaFinanceiraNormalizada]
        );
        respostaId = rowsAtualizadas[0].id;
        respostaStatus = rowsAtualizadas[0].status;
      }

      await client.query('COMMIT');

      if (faturaRemovida) {
        for (const asset of anexosParaExcluir) {
          try {
            await deleteStoredAsset(asset);
          } catch (assetErr) {
            console.warn('[Faturas] Erro ao remover anexo da fatura original:', assetErr.message);
          }
        }
      }

      res.json({
        mensagem: faturaRemovida
          ? 'Vale gerado e fatura original removida'
          : 'Status atualizado com sucesso',
        id: respostaId,
        status: respostaStatus,
        creditoGerado,
        faturaRemovida
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Faturas] Erro ao atualizar status:', err);
    res.status(400).json({ erro: 'Erro ao atualizar status da fatura' });
  }
});

// Atualizar fatura
router.put('/:id', async (req, res) => {
  const { cliente_id, empresa_id, numero_fatura, valor, data_vencimento, status, conta_financeira, turno, pdv, observacao } = req.body;
  try {
    const { rowCount } = await pool.query(
      `UPDATE faturas SET cliente_id=$1, empresa_id=$2, numero_fatura=$3, valor=$4, data_vencimento=$5,
       status=$6, conta_financeira=$7, turno=$8, pdv=$9, observacao=$10 WHERE id=$11`,
      [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, status, conta_financeira || null, turno || null, pdv || null, observacao || null, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ erro: 'Fatura não encontrada' });
    res.json({ mensagem: 'Fatura atualizada com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao atualizar fatura' });
  }
});

// Deletar fatura
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT arquivo_path, boleto_path, nota_path FROM faturas WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Fatura não encontrada' });

    const { arquivo_path, boleto_path, nota_path } = rows[0];
    for (const f of [arquivo_path, boleto_path, nota_path]) {
      if (f) {
        await deleteStoredAsset(f);
      }
    }

    await pool.query('DELETE FROM faturas WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Fatura deletada com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao deletar fatura' });
  }
});

module.exports = router;
