const Relatorios = {
  faturas: [],
  empresas: [],
  _debounce: null,
  _modalLista: [],
  _reportLogoDataUrl: null,
  _reportLogoPromise: null,

  async load() {
    try {
      [this.faturas, this.empresas] = await Promise.all([
        api.getFaturas(),
        api.getEmpresas()
      ]);
      this._preencherEmpresas();
      this._calcular();
      this._setupListeners();
    } catch (e) {
      Utils.showNotification('Erro ao carregar relatorios', 'error');
    }
  },

  _preencherEmpresas() {
    const sel = document.getElementById('rel-filtro-empresa');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas</option>' +
      this.empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
  },

  _setupListeners() {
    const inputCliente = document.getElementById('rel-filtro-cliente');
    const selEmpresa   = document.getElementById('rel-filtro-empresa');
    if (inputCliente) {
      inputCliente.addEventListener('input', () => {
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => this._calcular(), 300);
      });
    }
    if (selEmpresa) selEmpresa.addEventListener('change', () => this._calcular());
  },

  _getFiltradas() {
    const busca   = (document.getElementById('rel-filtro-cliente')?.value || '').toLowerCase().trim();
    const empresa = document.getElementById('rel-filtro-empresa')?.value || '';
    return this.faturas.filter(f => {
      if (busca   && !(f.cliente_nome || '').toLowerCase().includes(busca)) return false;
      if (empresa && String(f.empresa_id) !== String(empresa)) return false;
      return true;
    });
  },

  _calcular() {
    const faturas  = this._getFiltradas();
    const vencidas = faturas.filter(f => f.status === 'vencido');
    const receber  = faturas.filter(f => f.status === 'pendente');
    const quitadas = faturas.filter(f => f.status === 'pago');
    const soma     = arr => arr.reduce((s, f) => s + parseFloat(f.valor || 0), 0);

    document.getElementById('rel-total-todas').textContent    = Utils.formatCurrency(soma(faturas));
    document.getElementById('rel-qtd-todas').textContent      = `${faturas.length} fatura${faturas.length !== 1 ? 's' : ''}`;
    document.getElementById('rel-total-vencidas').textContent = Utils.formatCurrency(soma(vencidas));
    document.getElementById('rel-qtd-vencidas').textContent   = `${vencidas.length} fatura${vencidas.length !== 1 ? 's' : ''}`;
    document.getElementById('rel-total-receber').textContent  = Utils.formatCurrency(soma(receber));
    document.getElementById('rel-qtd-receber').textContent    = `${receber.length} fatura${receber.length !== 1 ? 's' : ''}`;
    document.getElementById('rel-total-quitadas').textContent = Utils.formatCurrency(soma(quitadas));
    document.getElementById('rel-qtd-quitadas').textContent   = `${quitadas.length} fatura${quitadas.length !== 1 ? 's' : ''}`;
  },

  abrirModal(tipo) {
    const faturas   = this._getFiltradas();
    const titulos   = { todas: '📋 Todas as Faturas', vencidas: '🔴 Faturas Vencidas', receber: '🟡 Faturas a Receber', quitadas: '🟢 Faturas Quitadas' };
    const statusMap = { todas: null, vencidas: 'vencido', receber: 'pendente', quitadas: 'pago' };
    const cores     = { todas: '#4f46e5', vencidas: '#e74c3c', receber: '#f39c12', quitadas: '#27ae60' };

    this._modalTipo    = tipo;
    this._modalCorBase = cores[tipo];
    this._modalBase    = (statusMap[tipo] ? faturas.filter(f => f.status === statusMap[tipo]) : faturas)
      .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

    // Preencher select de empresa do modal
    const sel = document.getElementById('rel-modal-empresa');
    if (sel) {
      const empresasNoModal = [...new Map(
        this._modalBase.filter(f => f.empresa_id).map(f => {
          const emp = this.empresas.find(e => e.id == f.empresa_id);
          return [f.empresa_id, emp?.nome || 'Empresa ' + f.empresa_id];
        })
      )];
      sel.innerHTML = '<option value="">Todas</option>' +
        empresasNoModal.map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('');
    }

    document.getElementById('relatorio-modal-titulo').textContent = titulos[tipo];
    document.getElementById('relatorio-modal-total').style.color  = cores[tipo];

    this._renderModalLista();
    document.getElementById('relatorio-modal').style.display = 'flex';
  },

  filtrarModal() {
    this._renderModalLista();
  },

  _renderModalLista() {
    const empresaFiltro = document.getElementById('rel-modal-empresa')?.value || '';
    const lista = empresaFiltro
      ? this._modalBase.filter(f => String(f.empresa_id) === String(empresaFiltro))
      : this._modalBase;

    const total = lista.reduce((s, f) => s + parseFloat(f.valor || 0), 0);
    document.getElementById('relatorio-modal-total').textContent = Utils.formatCurrency(total);
    document.getElementById('relatorio-modal-qtd').textContent   = `${lista.length} fatura${lista.length !== 1 ? 's' : ''}`;

    this._modalLista = lista;

    const tbody = document.querySelector('#relatorio-modal-table tbody');
    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><p>Nenhuma fatura encontrada</p></td></tr>`;
    } else {
      tbody.innerHTML = lista.map((f, i) => `
        <tr style="cursor:pointer;" onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''" onclick="Relatorios.abrirDetalhe(${i})">
          <td>${f.cliente_nome || '-'}</td>
          <td>${f.numero_fatura || '-'}</td>
          <td>${Utils.formatDate(f.data_vencimento)}</td>
          <td><strong>${Utils.formatCurrency(parseFloat(f.valor))}</strong></td>
          <td><span class="status-badge status-${(f.status||'').replace(' ','-')}">${f.status}</span></td>
        </tr>
      `).join('');
    }
  },

  abrirDetalhe(index) {
    const f = this._modalLista[index];
    if (!f) return;

    const statusConfig = {
      vencido:  { cor: '#e74c3c', bg: '#fef2f2', label: 'Vencido',  icon: '⚠️' },
      pendente: { cor: '#f39c12', bg: '#fffbeb', label: 'Pendente', icon: '⏳' },
      pago:     { cor: '#27ae60', bg: '#f0fdf4', label: 'Quitado',  icon: '✅' }
    };
    const cfg = statusConfig[f.status] || { cor: '#6b7280', bg: '#f9fafb', label: f.status, icon: '📄' };

    const empresaNome = f.empresa_id
      ? (this.empresas.find(e => e.id == f.empresa_id)?.nome || null)
      : null;

    const linha = (icon, label, valor, destaque) => valor ? `
      <div style="display:flex; align-items:center; gap:12px; padding:13px 0; border-bottom:1px solid #f3f4f6;">
        <span style="font-size:16px; width:22px; text-align:center; flex-shrink:0;">${icon}</span>
        <span style="flex:1; font-size:13px; color:#6b7280;">${label}</span>
        <span style="${destaque ? 'font-weight:700; font-size:15px; color:' + cfg.cor : 'font-weight:500; font-size:14px; color:#111827'};">${valor}</span>
      </div>` : '';

    document.getElementById('rel-detalhe-body').innerHTML = `
      <!-- Hero -->
      <div style="background:${cfg.bg}; border-radius:12px; padding:20px 20px 16px; margin-bottom:20px; border-left:4px solid ${cfg.cor};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="flex:1; min-width:0;">
            <div style="font-size:10px; font-weight:700; color:${cfg.cor}; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Cliente</div>
            <div style="font-size:18px; font-weight:800; color:#111827; line-height:1.3; word-break:break-word;">${f.cliente_nome || '-'}</div>
          </div>
          <div style="flex-shrink:0; text-align:center; background:white; border:2px solid ${cfg.cor}; border-radius:12px; padding:8px 14px; min-width:90px;">
            <div style="font-size:18px;">${cfg.icon}</div>
            <div style="font-size:12px; font-weight:700; color:${cfg.cor}; margin-top:2px;">${cfg.label}</div>
          </div>
        </div>
      </div>

      <!-- Campos -->
      <div style="padding:0 4px;">
        ${linha('🔢', 'Número da Fatura', f.numero_fatura)}
        ${linha('📅', 'Data de Vencimento', Utils.formatDate(f.data_vencimento))}
        ${linha('💰', 'Valor', Utils.formatCurrency(parseFloat(f.valor)), true)}
        ${linha('🏢', 'Empresa', empresaNome)}
        ${linha('🏦', 'Conta Financeira', f.conta_financeira)}
        ${linha('🔄', 'Turno', f.turno)}
        ${linha('🖥️', 'PDV', f.pdv)}
        ${linha('📝', 'Observação', f.observacao)}
        ${linha('🕐', 'Criado em', f.criado_em ? new Date(f.criado_em).toLocaleString('pt-BR') : null)}
      </div>
    `;

    document.getElementById('rel-detalhe-modal').style.display = 'flex';
  },

  fecharModal() {
    document.getElementById('relatorio-modal').style.display = 'none';
    document.getElementById('rel-export-menu').style.display = 'none';
  },

  toggleExportMenu() {
    const menu = document.getElementById('rel-export-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!document.getElementById('rel-export-menu-wrap').contains(e.target)) {
          document.getElementById('rel-export-menu').style.display = 'none';
          document.removeEventListener('click', handler);
        }
      });
    }, 10);
  },

  async exportar(formato) {
    document.getElementById('rel-export-menu').style.display = 'none';
    const titulo = document.getElementById('relatorio-modal-titulo').textContent;
    const tituloExport = this._tituloExportacao(titulo);
    const total  = document.getElementById('relatorio-modal-total').textContent;
    const qtd    = document.getElementById('relatorio-modal-qtd').textContent;

    const rows = [];
    document.querySelectorAll('#relatorio-modal-table tbody tr').forEach(tr => {
      const cols = tr.querySelectorAll('td');
      if (cols.length >= 4) {
        rows.push([
          cols[0].textContent.trim(),
          cols[1].textContent.trim(),
          cols[2].textContent.trim(),
          cols[3].textContent.trim(),
          cols[4] ? cols[4].textContent.trim() : ''
        ]);
      }
    });

    const headers = ['Cliente', 'Numero', 'Vencimento', 'Valor', 'Status'];

    if (formato === 'pdf')   await this._exportPDF(tituloExport, total, qtd, headers, rows);
    if (formato === 'excel') this._exportExcel(titulo, headers, rows);
    if (formato === 'docx')  this._exportDOCX(tituloExport, total, qtd, headers, rows);
  },

  async _exportPDF(titulo, total, qtd, headers, rows) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const generatedAt = new Date().toLocaleString('pt-BR');
    const logoDataUrl = await this._getReportLogoDataUrl();
    const reportTitle = String(titulo || '').trim() || 'Relatório';

    const drawHeader = (pageNumber) => {
      const logoSize = 32;
      const brandingX = 10;
      const brandingY = 10;
      const brandingTextX = brandingX + logoSize + 10;

      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 8, 'F');

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', brandingX, brandingY, logoSize, logoSize);
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(18);
      doc.text('Visão Faturas', brandingTextX, 21);

      doc.setTextColor(79, 70, 229);
      doc.setFontSize(13);
      doc.text(reportTitle, brandingTextX, 29);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(9);
      doc.text(`Total: ${total}   |   ${qtd}`, brandingTextX, 36);
      doc.text(`Gerado em: ${generatedAt}`, brandingTextX, 42);

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.line(marginX, 46, pageWidth - marginX, 46);

      const footerLineY = pageHeight - 12;
      const footerTextY = pageHeight - 5;

      doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.text('Gerado automaticamente pelo sistema', marginX, footerTextY);
      doc.setTextColor(79, 70, 229);
      doc.text(`Página ${pageNumber}`, pageWidth - marginX, footerTextY, { align: 'right' });
    };

    doc.setProperties({
      title: reportTitle,
      subject: 'Relatório de Faturas',
      author: 'Visão Faturas',
    });

    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 52,
      margin: { top: 52, left: marginX, right: marginX, bottom: 20 },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      didDrawPage: (data) => {
        drawHeader(data.pageNumber);
      }
    });

    doc.save(this._nomeArquivoExportacao(reportTitle) + '.pdf');
  },

  async _getReportLogoDataUrl() {
    if (this._reportLogoDataUrl) return this._reportLogoDataUrl;

    if (!this._reportLogoPromise) {
      this._reportLogoPromise = fetch('/images/logo-visao.png')
        .then(response => {
          if (!response.ok) {
            throw new Error(`Logo indisponível (${response.status})`);
          }
          return response.blob();
        })
        .then(blob => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }))
        .then(dataUrl => {
          this._reportLogoDataUrl = dataUrl;
          return dataUrl;
        })
        .catch(error => {
          console.warn('Não foi possível carregar a logo do relatório:', error);
          return null;
        });
    }

    return this._reportLogoPromise;
  },

  _exportExcel(titulo, headers, rows) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
    XLSX.writeFile(wb, this._nomeArquivoExportacao(titulo) + '.xlsx');
  },

  async _exportDOCX(titulo, total, qtd, headers, rows) {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } = docx;

    const headerCells = headers.map(h => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20 })], alignment: AlignmentType.CENTER })],
      shading: { fill: '4F46E5' },
      margins: { top: 80, bottom: 80, left: 120, right: 120 }
    }));

    const dataRows = rows.map((row, i) => new TableRow({
      children: row.map(cell => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18 })] })],
        shading: { fill: i % 2 === 0 ? 'FFFFFF' : 'F8F9FA' },
        margins: { top: 60, bottom: 60, left: 120, right: 120 }
      }))
    }));

    const doc2 = new Document({
      sections: [{
        children: [
          new Paragraph({ text: titulo, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: 'Total: ' + total + '   |   ' + qtd, size: 22 })] }),
          new Paragraph({ children: [new TextRun({ text: 'Gerado em: ' + new Date().toLocaleString('pt-BR'), size: 18, color: '888888' })] }),
          new Paragraph({ text: '' }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: headerCells }), ...dataRows] })
        ]
      }]
    });

    const blob = await Packer.toBlob(doc2);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this._nomeArquivoExportacao(titulo) + '.docx';
    a.click();
    URL.revokeObjectURL(url);
  },

  _tituloExportacao(titulo) {
    return String(titulo || '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  _nomeArquivoExportacao(titulo) {
    return String(titulo || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
  }
};
