const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../database');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// Diretório de uploads
const uploadBaseDir = (process.env.NODE_ENV === 'production' && fs.existsSync('/app/data'))
  ? '/app/data/uploads'
  : path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadBaseDir)) fs.mkdirSync(uploadBaseDir, { recursive: true });

function resolveUploadPath(fileName) {
  if (!fileName) return null;
  const base = path.basename(fileName);
  const candidates = [
    path.join(uploadBaseDir, base),
    path.join(uploadBaseDir, fileName),
    path.join(__dirname, '../../uploads', base),
    path.join(__dirname, '../../uploads', fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadBaseDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
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
      WHERE LOWER(f.status) != 'haver'
        AND LOWER(f.numero_fatura) != 'haver'
        AND f.valor >= 0
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
         OR f.valor < 0
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

    if (tipoArquivo === 'xlsx') {
      const workbook = XLSX.readFile(req.file.path);
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
      const linhas = fs.readFileSync(req.file.path, 'utf8').split('\n').filter(l => l.trim());
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
          [clienteId, empresa_id || null, numeroFatura, valorFatura, dataVencimento, req.file.filename, 'csv', status]
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
      const { rows } = await pool.query(
        'INSERT INTO faturas (cliente_id, empresa_id, numero_fatura, valor, data_vencimento, arquivo_path, tipo_arquivo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [cliente_id, empresa_id || null, numero_fatura, valor, data_vencimento, req.file.filename, 'pdf']
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
    const filePath = resolveUploadPath(fatura.arquivo_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo da fatura não encontrado. Reenvie o anexo.' });
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao baixar fatura' });
  }
});

// Download boleto
router.get('/download/:id/boleto', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT boleto_path FROM faturas WHERE id = $1', [req.params.id]);
    const fatura = rows[0];
    if (!fatura || !fatura.boleto_path) return res.status(404).json({ erro: 'Boleto não encontrado' });
    const filePath = resolveUploadPath(fatura.boleto_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo de boleto ausente. Reenvie o anexo.' });
    res.download(filePath);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao baixar boleto' });
  }
});

// Download nota fiscal
router.get('/download/:id/nota', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nota_path FROM faturas WHERE id = $1', [req.params.id]);
    const fatura = rows[0];
    if (!fatura || !fatura.nota_path) return res.status(404).json({ erro: 'Nota fiscal não encontrada' });
    const filePath = resolveUploadPath(fatura.nota_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo de nota fiscal ausente. Reenvie o anexo.' });
    res.download(filePath);
  } catch (err) {
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
    const novoBoleto = req.files?.boleto?.[0]?.filename || null;
    const novaNota = req.files?.nota?.[0]?.filename || null;

    if (novoBoleto && fatura.boleto_path) {
      const antigo = resolveUploadPath(fatura.boleto_path);
      if (antigo && fs.existsSync(antigo)) fs.unlinkSync(antigo);
    }
    if (novaNota && fatura.nota_path) {
      const antigo = resolveUploadPath(fatura.nota_path);
      if (antigo && fs.existsSync(antigo)) fs.unlinkSync(antigo);
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
      if (f) { const p = resolveUploadPath(f); if (p && fs.existsSync(p)) fs.unlinkSync(p); }
    }

    await pool.query('DELETE FROM faturas WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Fatura deletada com sucesso' });
  } catch (err) {
    res.status(400).json({ erro: 'Erro ao deletar fatura' });
  }
});

module.exports = router;
