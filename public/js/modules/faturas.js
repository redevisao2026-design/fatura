// Faturas Module
const Faturas = {
  versao: '20260328a',
  faturas: [],
  faturasListagem: [], // base principal sem haver; vale aparece como lançamento próprio de débito
  faturasHaver: [],
  clientes: [],
  empresas: [],
  faturasFiltradas: [],
  faturaAutocompleteInit: false,
  haverAutocompleteInit: false,

  normalizeStatus(status) {
    return (status || '')
      .toString()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  },

  getStatusLabel(status) {
    const normalized = this.normalizeStatus(status);

    switch (normalized) {
      case 'pendente':
        return 'Pendente';
      case 'pago':
        return 'Pago';
      case 'vencido':
        return 'Vencido';
      case 'nova gestao':
        return 'Nova Gestão';
      case 'advogado':
        return 'Advogado';
      case 'protestado':
        return 'Protestado';
      case 'descontado':
        return 'Descontado';
      case 'haver':
        return 'Haver';
      case 'vale':
        return 'Vale';
      default:
        return status || '';
    }
  },

  getStatusClass(status) {
    const normalized = this.normalizeStatus(status);

    switch (normalized) {
      case 'pago':
        return 'success';
      case 'vencido':
        return 'danger';
      case 'advogado':
        return 'advogado';
      case 'vale':
        return 'warning';
      case 'nova gestao':
        return 'nova-gestao';
      default:
        return 'warning';
    }
  },

  setStatusSelectValue(selectId, statusAtual, fallback = 'pendente') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const normalizedStatus = this.normalizeStatus(statusAtual);
    const option = Array.from(select.options).find(opt =>
      this.normalizeStatus(opt.value) === normalizedStatus
    );

    select.value = option ? option.value : fallback;
  },

  getCurrentUserAdmin() {
    const isAdminFlag = localStorage.getItem('is_admin');
    if (isAdminFlag === '1' || isAdminFlag === 'true') {
      return true;
    }

    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      const admin = usuario?.is_admin;
      return admin === 1 || admin === '1' || admin === true || admin === 'true';
    } catch {
      return false;
    }
  },

  /**
   * Identifica faturas de haver que não devem aparecer na lista principal.
   * Haver = saldo a favor do cliente (empresa deve ao cliente), então fica fora da lista principal.
   */
  isHaver(f) {
    const st = (f.status || '').toString().trim().toLowerCase();
    const numero = (f.numero_fatura || '').toString().trim().toLowerCase();
    const valor = parseFloat(f.valor) || 0;
    // Oculta apenas haveres; vales devem aparecer na listagem principal.
    if (st === 'haver') return true;
    if (numero === 'haver') return true;
    if (valor < 0 && numero !== 'vale') return true;
    return false;
  },

  async loadCadastrar() {
    try {
      document.getElementById('fatura-form')?.reset();
      const clienteHidden = document.getElementById('fatura-cliente');
      const clienteBusca = document.getElementById('fatura-cliente-busca');
      const clienteSugestoes = document.getElementById('fatura-cliente-sugestoes');
      if (clienteHidden) clienteHidden.value = '';
      if (clienteBusca) clienteBusca.value = '';
      if (clienteSugestoes) clienteSugestoes.classList.add('hidden');

      this.clientes = await api.getClientes();
      this.empresas = await this.loadEmpresas();
      this.isAdmin = this.getCurrentUserAdmin();
      this.loadEmpresasSelect();
      this.setupFaturaClienteBusca();
    } catch (error) {
      Utils.showNotification('Erro ao carregar dados', 'error');
      console.error(error);
    }
  },

  async loadListar() {
    console.log(`[Faturas] v${this.versao} - Carregando lista de faturas...`);
    try {
      const [todas, clientes, empresas] = await Promise.all([
        api.getFaturas(),
        api.getClientes(),
        this.loadEmpresas()
      ]);
      this.faturas = todas || [];
      // Base usada na página principal: remove apenas haver; vale segue como lançamento próprio
      this.faturasListagem = this.faturas.filter(f => !this.isHaver(f));
      this.clientes = clientes || [];
      this.empresas = empresas || [];
      this.isAdmin = this.getCurrentUserAdmin();
      console.log('[Faturas] Faturas carregadas (total):', this.faturas.length);
      console.log('[Faturas] Faturas para listagem (sem haver):', this.faturasListagem.length);
      console.log('[Faturas] Clientes carregados:', this.clientes);
      
      this.loadEmpresasFiltroSelect();
      this.restaurarFiltros();
      this.setupFiltroListeners();
      this.aplicarFiltros();
    } catch (error) {
      console.error('[Faturas] Erro ao carregar:', error);
      Utils.showNotification('Erro ao carregar faturas', 'error');
    }
  },

  renderHaver() {
    console.log('[Faturas] Renderizando lista de haver');
    const tbody = document.querySelector('#haver-table tbody');
    const countSpan = document.getElementById('haver-count');
    const totalSpan = document.getElementById('haver-total');
    if (!tbody) return;

    if (countSpan) countSpan.textContent = `(${this.faturasFiltradas.length})`;

    const total = this.faturasFiltradas.reduce((sum, f) => sum + Math.abs(parseFloat(f.valor) || 0), 0);
    if (totalSpan) totalSpan.textContent = Utils.formatCurrency(total);

    if (this.faturasFiltradas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">
            <p>Nenhum haver encontrado</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.faturasFiltradas.map(f => {
      const clienteNome = f.cliente_nome || (this.clientes.find(c => c.id === f.cliente_id)?.nome || '');
      return `
        <tr>
          <td>${clienteNome}</td>
          <td><strong>${f.numero_fatura}</strong></td>
          <td>${Utils.formatDate(f.data_vencimento)}</td>
          <td>${Utils.formatCurrency(f.valor)}</td>
          <td class="table-actions" style="gap:6px;">
            <button class="btn btn-sm btn-primary" onclick="Faturas.edit(${f.id})" title="Editar">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="Faturas.delete(${f.id})" title="Deletar">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async loadHaver() {
    console.log('[Faturas] Carregando lista de haver...');
    try {
      const [havers, clientes, empresas] = await Promise.all([
        api.getHaver(),
        api.getClientes(),
        this.loadEmpresas()
      ]);
      // Aqui faturas contém apenas haveres
      this.faturas = havers || [];
      this.faturasHaver = havers || [];
      this.clientes = clientes || [];
      this.empresas = empresas || [];
      this.isAdmin = this.getCurrentUserAdmin();
      this.faturasFiltradas = [...this.faturasHaver];
      this.setupHaverSearch();
      console.log('[Faturas] Haver encontrados:', this.faturasFiltradas.length);
      this.renderHaver();
    } catch (error) {
      console.error('[Faturas] Erro ao carregar haver:', error);
      Utils.showNotification('Erro ao carregar haver', 'error');
    }
  },

  async openHaverModal() {
    // garantir listas
    if (!this.clientes.length) this.clientes = await api.getClientes();
    if (!this.empresas.length) this.empresas = await this.loadEmpresas();

    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('haver-data').value = hoje;

    // popular empresa e preparar autocomplete do cliente
    const selEmp = document.getElementById('haver-empresa');
    if (selEmp) {
      selEmp.innerHTML = '<option value=\"\">Selecione</option>' + this.empresas.map(e => `<option value=\"${e.id}\">${e.nome}</option>`).join('');
    }
    const hiddenCli = document.getElementById('haver-cliente');
    const inputCli = document.getElementById('haver-cliente-busca');
    if (hiddenCli) hiddenCli.value = '';
    if (inputCli) inputCli.value = '';
    this.setupHaverClienteBusca();

    document.getElementById('haver-form').reset();
    document.getElementById('haver-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeHaverModal() {
    const modal = document.getElementById('haver-modal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('haver-form')?.reset();
  },

  async submitHaver(event) {
    event.preventDefault();
    const empresa_id = document.getElementById('haver-empresa').value;
    const cliente_id = document.getElementById('haver-cliente').value;
    const data = document.getElementById('haver-data').value;
    const valorRaw = parseFloat(document.getElementById('haver-valor').value);
    const conta_financeira = document.getElementById('haver-conta').value;
    const turno = document.getElementById('haver-turno').value;
    const pdv = document.getElementById('haver-pdv').value;
    const observacao = document.getElementById('haver-observacao').value;

    if (!empresa_id || !cliente_id || !data || !valorRaw || valorRaw <= 0) {
      Utils.showNotification('Preencha empresa, cliente, data e valor.', 'error');
      return;
    }

    const valor = -Math.abs(valorRaw); // armazenar haver como negativo
    const payload = {
      empresa_id,
      cliente_id,
      numero_fatura: 'HAVER',
      valor,
      data_vencimento: data,
      status: 'haver',
      conta_financeira,
      turno,
      pdv,
      observacao
    };

    try {
      await api.createFatura(payload);
      Utils.showNotification('Haver inserido com sucesso!', 'success');
      this.closeHaverModal();
      await this.loadHaver();
    } catch (error) {
      console.error('Erro ao inserir haver:', error);
      Utils.showNotification('Erro ao salvar haver', 'error');
    }
  },

  async loadUpload() {
    try {
      this.clientes = await api.getClientes();
      this.empresas = await this.loadEmpresas();
      this.loadClientesSelectUpload();
      this.loadEmpresasSelectUpload();
      this.setupUploadFileListener();
    } catch (error) {
      Utils.showNotification('Erro ao carregar dados', 'error');
      console.error(error);
    }
  },

  isPdfFile(file) {
    if (!file) return false;
    const nome = (file.name || '').toLowerCase();
    return file.type === 'application/pdf' || nome.endsWith('.pdf');
  },

  setupUploadFileListener() {
    const fileInput = document.getElementById('upload-arquivo');
    const pdfFields = document.getElementById('upload-fields-pdf');
    
    if (fileInput && pdfFields) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const isPDF = this.isPdfFile(file);
          const isXLSX = file.name.endsWith('.xlsx');
          const isCSV = file.name.endsWith('.csv');
          
          // Mostrar campos extras apenas para PDF
          pdfFields.style.display = isPDF ? 'block' : 'none';
          
          // Ajustar required dos campos
          const pdfInputs = pdfFields.querySelectorAll('input, select');
          pdfInputs.forEach(input => {
            input.required = isPDF;
          });
          
          // Mostrar mensagem informativa
          if (isXLSX || isCSV) {
            console.log(`Arquivo ${isXLSX ? 'Excel' : 'CSV'} selecionado. Processamento automático.`);
          }
        }
      });
    }
  },

  async loadEmpresas() {
    try {
      const empresas = await api.getEmpresas();
      return empresas || [];
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      return [];
    }
  },

  async load() {
    // Método legado - redireciona para listar
    router.navigate('faturas-listar');
  },

  render() {
    console.log('[Faturas] Renderizando lista de faturas');
    // Garante que haver/vale não apareçam mesmo se chegarem aqui por engano
    const linhas = this.faturasFiltradas.filter(f => !this.isHaver(f));
    console.log('[Faturas] Total de faturas (sem haver):', linhas.length);
    
    const tbody = document.querySelector('#faturas-table tbody');
    const countSpan = document.getElementById('faturas-count');
    const isAdmin = this.isAdmin;
    
    if (!tbody) {
      console.error('[Faturas] Elemento tbody não encontrado!');
      return;
    }

    // Atualizar contador (considerando ocultação de haver)
    if (countSpan) {
      const totalBase = this.faturasListagem && this.faturasListagem.length ? this.faturasListagem.length : this.faturas.length;
      countSpan.textContent = `(${linhas.length} de ${totalBase})`;
    }
    
    if (linhas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <p>Nenhuma fatura encontrada</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = linhas.map(f => {
      const statusClass = this.getStatusClass(f.status);
      const statusLabel = this.getStatusLabel(f.status);
      const normalizedStatus = this.normalizeStatus(f.status);
      const hasBoleto = !!f.boleto_path;
      const hasNota = !!f.nota_path;
      const boletoClass = hasBoleto ? 'btn-success' : 'btn-secondary';
      const notaClass = hasNota ? 'btn-success' : 'btn-secondary';
      const canManageAnexos = this.getCurrentUserAdmin();
      
      return `
        <tr>
          <td>${f.cliente_nome}</td>
          <td><strong>${f.numero_fatura}</strong></td>
          <td>${Utils.formatDate(f.data_vencimento)}</td>
          <td><strong>${Utils.formatCurrency(f.valor)}</strong></td>
          <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
          <td class="table-actions" style="gap:6px;">
            <button class="btn btn-sm ${boletoClass}" onclick="Faturas.handleBoletoClick(${f.id})" title="${hasBoleto ? 'Baixar boleto' : (isAdmin ? 'Enviar boleto' : 'Sem boleto')}" ${hasBoleto || isAdmin ? '' : 'disabled'}>🧾</button>
            <button class="btn btn-sm ${notaClass}" onclick="Faturas.handleNotaClick(${f.id})" title="${hasNota ? 'Baixar nota fiscal' : (isAdmin ? 'Enviar nota fiscal' : 'Sem nota fiscal')}" ${hasNota || isAdmin ? '' : 'disabled'}>📄</button>
            ${canManageAnexos ? `<button class="btn btn-sm btn-info btn-anexos" onclick="Faturas.openAnexos(${f.id})" title="Anexar PDFs (admin)">📎</button>` : ''}
            <button class="btn btn-sm btn-primary" onclick="Faturas.edit(${f.id})" title="Editar fatura">✏️</button>
            <button class="btn btn-sm btn-success" onclick="Faturas.toggleStatus(${f.id}, '${f.status}')" title="Alterar status">
              ${f.status === 'pago' || f.status === 'haver' ? '↩️' : '✓'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="Faturas.delete(${f.id})" title="Deletar">🗑️</button>
            <button class="btn btn-sm btn-warning" onclick="Faturas.openStatusModal(${f.id}, '${f.status}')" title="Alterar status rapidamente">🏷️</button>
          </td>
        </tr>
      `;
    }).join('');
    
    console.log('[Faturas] Lista renderizada com sucesso');
  },

  setupFiltroListeners() {
    const pesquisaInput = document.getElementById('filtro-fatura-pesquisa');
    const empresaSelect = document.getElementById('filtro-fatura-empresa');
    const statusSelect = document.getElementById('filtro-fatura-status');

    // Debounce para o campo de pesquisa (aguarda 300ms após parar de digitar)
    if (pesquisaInput) {
      pesquisaInput.addEventListener('input', Utils.debounce(() => {
        this.aplicarFiltros();
      }, 300));
    }

    // Filtro imediato para os selects
    if (empresaSelect) {
      empresaSelect.addEventListener('change', () => {
        this.aplicarFiltros();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        this.aplicarFiltros();
      });
    }
  },

  loadEmpresasFiltroSelect() {
    const select = document.getElementById('filtro-fatura-empresa');
    if (!select) return;

    const options = '<option value="">Todas as empresas</option>' +
      this.empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');

    select.innerHTML = options;
  },

  restaurarFiltros() {
    const empresaSelect = document.getElementById('filtro-fatura-empresa');
    const pesquisaInput = document.getElementById('filtro-fatura-pesquisa');
    const statusSelect = document.getElementById('filtro-fatura-status');

    const empSalvo = localStorage.getItem('filtro_faturas_empresa') || '';
    if (empresaSelect && empSalvo && this.empresas.some(e => String(e.id) === String(empSalvo))) {
      empresaSelect.value = empSalvo;
    }

    const pesquisaSalva = localStorage.getItem('filtro_faturas_pesquisa') || '';
    if (pesquisaInput && pesquisaSalva) {
      pesquisaInput.value = pesquisaSalva;
    }

    const statusSalvo = localStorage.getItem('filtro_faturas_status') || '';
    if (statusSelect) {
      this.setStatusSelectValue('filtro-fatura-status', statusSalvo, '');
    }
  },

  aplicarFiltros() {
    const pesquisa = document.getElementById('filtro-fatura-pesquisa')?.value.toLowerCase().trim() || '';
    const empresaId = document.getElementById('filtro-fatura-empresa')?.value || '';
    const status = document.getElementById('filtro-fatura-status')?.value || '';
    const base = this.faturasListagem && this.faturasListagem.length ? this.faturasListagem : this.faturas;

    // Persistir filtro de empresa
    localStorage.setItem('filtro_faturas_empresa', empresaId);
    localStorage.setItem('filtro_faturas_pesquisa', pesquisa);
    localStorage.setItem('filtro_faturas_status', status);

    this.faturasFiltradas = base.filter(f => {
      // Filtro por pesquisa (nome ou CPF/CNPJ do cliente)
      if (pesquisa) {
        const cliente = this.clientes.find(c => c.id === f.cliente_id);
        if (cliente) {
          const nomeCliente = cliente.nome.toLowerCase();
          const cpfCnpjCliente = cliente.cpf_cnpj.replace(/\D/g, '');
          const pesquisaLimpa = pesquisa.replace(/\D/g, '');
          
          // Verifica se o nome do cliente COMEÇA com a pesquisa OU contém a pesquisa como palavra completa
          const palavrasPesquisa = pesquisa.split(' ').filter(p => p.length > 0);
          const palavrasCliente = nomeCliente.split(' ');
          
          // Verifica se todas as palavras da pesquisa estão no início de alguma palavra do nome
          const nomeMatch = palavrasPesquisa.every(palavraPesquisa => 
            palavrasCliente.some(palavraCliente => palavraCliente.startsWith(palavraPesquisa))
          );
          
          // Verifica CPF/CNPJ
          const cpfCnpjMatch = pesquisaLimpa.length > 0 && cpfCnpjCliente.includes(pesquisaLimpa);
          
          if (!nomeMatch && !cpfCnpjMatch) return false;
        } else {
          return false;
        }
      }

      // Filtro por empresa
      if (empresaId && f.empresa_id != empresaId) {
        return false;
      }

      // Filtro por status
      if (status && this.normalizeStatus(f.status) !== this.normalizeStatus(status)) {
        return false;
      }

      return true;
    });

    this.render();
  },

  loadClientesSelect() {
    const select = document.getElementById('fatura-cliente');
    if (!select) return;

    const options = '<option value="">Selecione um cliente</option>' +
      this.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    select.innerHTML = options;
  },

  loadEmpresasSelect() {
    const select = document.getElementById('fatura-empresa');
    if (!select) return;

    const options = '<option value="">Selecione uma empresa</option>' +
      this.empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');

    select.innerHTML = options;
  },

  loadClientesSelectUpload() {
    const select = document.getElementById('upload-cliente');
    if (!select) return;

    const options = '<option value="">Selecione um cliente</option>' +
      this.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    select.innerHTML = options;
  },

  loadEmpresasSelectUpload() {
    const select = document.getElementById('upload-empresa');
    if (!select) return;

    const options = '<option value="">Selecione uma empresa</option>' +
      this.empresas.map(e => `<option value="${e.id}">${e.nome}</option>`).join('');

    select.innerHTML = options;
  },

  async create(event) {
    event.preventDefault();
    
    const empresaId = document.getElementById('fatura-empresa').value;
    const clienteId = document.getElementById('fatura-cliente').value;
    
    if (!empresaId) {
      Utils.showNotification('Selecione uma empresa', 'error');
      return;
    }

    if (!clienteId) {
      Utils.showNotification('Selecione um cliente da lista', 'error');
      return;
    }
    
    const data = {
      cliente_id: clienteId,
      empresa_id: empresaId,
      numero_fatura: document.getElementById('fatura-numero').value,
      valor: document.getElementById('fatura-valor').value,
      data_vencimento: document.getElementById('fatura-vencimento').value,
      status: document.getElementById('fatura-status').value
    };

    try {
      await api.createFatura(data);
      Utils.showNotification('Fatura criada com sucesso!');
      document.getElementById('fatura-form').reset();
      document.getElementById('fatura-cliente-sugestoes')?.classList.add('hidden');
      router.navigate('faturas-listar');
    } catch (error) {
      Utils.showNotification(error.message, 'error');
    }
  },

  async upload(event) {
    event.preventDefault();
    
    const arquivo = document.getElementById('upload-arquivo').files[0];
    
    if (!arquivo) {
      Utils.showNotification('Selecione um arquivo', 'error');
      return;
    }

    const empresaId = document.getElementById('upload-empresa')?.value;
    
    if (!empresaId) {
      Utils.showNotification('Selecione uma empresa', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('empresa_id', empresaId);

    // Apenas adicionar campos extras se for PDF
    if (this.isPdfFile(arquivo)) {
      const clienteId = document.getElementById('upload-cliente').value;
      const numeroFatura = document.getElementById('upload-numero').value;
      const valor = document.getElementById('upload-valor').value;
      const dataVencimento = document.getElementById('upload-vencimento').value;

      if (!clienteId || !numeroFatura || !valor || !dataVencimento) {
        Utils.showNotification('Preencha todos os campos para upload de PDF', 'error');
        return;
      }

      formData.append('cliente_id', clienteId);
      formData.append('numero_fatura', numeroFatura);
      formData.append('valor', valor);
      formData.append('data_vencimento', dataVencimento);
    }

    try {
      const result = await api.uploadFatura(formData);
      
      // Construir mensagem detalhada
      let mensagem = result.mensagem;
      
      if (result.clientesCriados > 0) {
        mensagem += `\n\n✅ ${result.clientesCriados} cliente(s) novo(s) cadastrado(s) automaticamente`;
      }
      
      // Mostrar mensagem com erros se houver
      if (result.erros && result.erros.length > 0) {
        const errosMsg = result.erros.slice(0, 5).join('\n');
        mensagem += '\n\n⚠️ Primeiros erros:\n' + errosMsg;
        Utils.showNotification(mensagem, 'warning');
      } else {
        Utils.showNotification(mensagem, 'success');
      }
      
      document.getElementById('upload-form').reset();
      document.getElementById('upload-fields-pdf').style.display = 'none';
      
      // Aguardar um pouco antes de navegar para dar tempo de ler a mensagem
      setTimeout(() => {
        router.navigate('faturas-listar');
      }, result.clientesCriados > 0 ? 3000 : 2000);
    } catch (error) {
      Utils.showNotification(error.message, 'error');
    }
  },

  async edit(id) {
    console.log('[Faturas] Editando fatura ID:', id);
    try {
      // Buscar dados da fatura
      let faturas = await api.getFaturas();
      console.log('[Faturas] Faturas carregadas:', faturas.length);
      let fatura = faturas.find(f => f.id === id);

      // Se não encontrar, tentar na lista de haver/vales
      if (!fatura) {
        const havers = await api.getHaver?.();
        if (havers && havers.length) {
          console.log('[Faturas] Buscando em haver, total:', havers.length);
          fatura = havers.find(f => f.id === id);
        }
      }

      console.log('[Faturas] Fatura encontrada:', fatura);
      
      if (!fatura) {
        Utils.showNotification('Fatura não encontrada', 'error');
        return;
      }

      // Buscar lista de clientes para o select
      const clientes = await api.getClientes();
      console.log('[Faturas] Clientes carregados:', clientes.length);
      const clienteSelect = document.getElementById('edit-cliente-id');
      clienteSelect.innerHTML = '<option value="">Selecione um cliente</option>' +
        clientes.map(c => `<option value="${c.id}" ${c.id === fatura.cliente_id ? 'selected' : ''}>${c.nome}</option>`).join('');

      // Preencher formulário
      document.getElementById('edit-fatura-id').value = fatura.id;
      document.getElementById('edit-numero-fatura').value = fatura.numero_fatura;
      document.getElementById('edit-valor').value = fatura.valor;
      document.getElementById('edit-data-vencimento').value = fatura.data_vencimento;
      this.setStatusSelectValue('edit-status', fatura.status);

      console.log('[Faturas] Abrindo modal de edição');
      // Abrir modal
      const modal = document.getElementById('editar-fatura-modal');
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    } catch (error) {
      console.error('[Faturas] Erro ao editar:', error);
      Utils.showNotification('Erro ao carregar fatura', 'error');
      console.error(error);
    }
  },

  closeEditModal() {
    const modal = document.getElementById('editar-fatura-modal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('form-editar-fatura').reset();
  },

  async submitEdit(event) {
    event.preventDefault();

    const id = document.getElementById('edit-fatura-id').value;
    const data = {
      cliente_id: document.getElementById('edit-cliente-id').value,
      numero_fatura: document.getElementById('edit-numero-fatura').value,
      valor: parseFloat(document.getElementById('edit-valor').value),
      data_vencimento: document.getElementById('edit-data-vencimento').value,
      status: document.getElementById('edit-status').value
    };

    try {
      await api.updateFatura(id, data);
      Utils.showNotification('Fatura atualizada com sucesso!', 'success');
      this.closeEditModal();
      await this.loadListar();
    } catch (error) {
      Utils.showNotification('Erro ao atualizar fatura', 'error');
      console.error(error);
    }
  },

  async toggleStatus(id, currentStatus) {
    console.log('[Faturas] toggleStatus chamado:', id, currentStatus);
    
    // Se está marcando como pago, abrir modal de pagamento
    if (this.normalizeStatus(currentStatus) !== 'pago') {
      console.log('[Faturas] Abrindo modal de pagamento...');
      try {
        await this.openPagamentoModal(id);
      } catch (err) {
        console.error('[Faturas] Erro ao abrir pagamento:', err);
        Utils.showNotification('Erro ao abrir pagamento', 'error');
      }
    } else {
      // Se está desmarcando como pago, voltar para pendente
      if (!Utils.confirm('Deseja reverter o pagamento desta fatura?')) return;
      
      try {
        await api.updateFaturaStatus(id, 'pendente');
        Utils.showNotification('Status alterado para pendente!', 'success');
        await this.loadListar();
      } catch (error) {
        Utils.showNotification('Erro ao alterar status', 'error');
        console.error(error);
      }
    }
  },

  async openPagamentoModal(id) {
    console.log('[Faturas] openPagamentoModal chamado:', id);
    
    // Garantir que achamos a fatura (filtrada ou base completa)
    let fatura = (this.faturasFiltradas || []).find(f => f.id === id)
              || (this.faturasListagem || []).find(f => f.id === id)
              || (this.faturas || []).find(f => f.id === id);
    if (!fatura) {
      console.error('[Faturas] Fatura não encontrada:', id);
      Utils.showNotification('Fatura não encontrada', 'error');
      return;
    }

    console.log('[Faturas] Fatura encontrada:', fatura);

    // Preencher dados da fatura
    document.getElementById('pag-fatura-id').value = fatura.id;
    document.getElementById('pag-valor-original').value = fatura.valor;
    document.getElementById('pag-cliente-nome').value = fatura.cliente_nome;
    document.getElementById('pag-numero-fatura').value = fatura.numero_fatura;
    
    // Definir data atual
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('pag-data').value = hoje;
    
    // Resetar valores - valor pago começa com o valor total
    document.getElementById('pag-valor-haver').value = 0;
    document.getElementById('pag-valor-pago').value = fatura.valor;
    document.getElementById('pag-acao').value = 'normal';
    
    // Preencher haver disponível (cliente+empresa) e ajustar valores
    await this.preencherHaverDisponivel(fatura);

    // Atualizar resumo
    this.calcularResumo();
    
    // Mostrar modal
    const modal = document.getElementById('pagamento-modal');
    if (!modal) {
      console.error('[Faturas] Modal não encontrado no DOM!');
      return;
    }
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closePagamentoModal() {
    const modal = document.getElementById('pagamento-modal');
    if (modal) {
      modal.classList.remove('show');
    }
    document.body.style.overflow = 'auto';
    document.getElementById('form-pagamento').reset();
  },

  calcularResumo() {
    const valorOriginal = parseFloat(document.getElementById('pag-valor-original').value) || 0;
    let valorHaver = parseFloat(document.getElementById('pag-valor-haver').value) || 0;
    const valorPago = parseFloat(document.getElementById('pag-valor-pago').value) || 0;
    const totalPago = valorPago + valorHaver;
    const botoesNormal = document.getElementById('pag-botoes-normal');
    const botoesDiff = document.getElementById('pag-botoes-diferenca');
    const botoesHaver = document.getElementById('pag-botoes-haver');
    // reset ação para normal ao recalcular
    document.getElementById('pag-acao').value = 'normal';
    
    // Se pagamento (dinheiro + haver) ultrapassa o valor original, gera novo haver (troco)
    if (totalPago > valorOriginal) {
      const haverGerado = totalPago - valorOriginal;
      document.getElementById('pag-diferenca').textContent = `-${haverGerado.toFixed(2).replace('.', ',')}`;
      if (botoesNormal) botoesNormal.style.display = 'none';
      if (botoesDiff) botoesDiff.style.display = 'none';
      if (botoesHaver) botoesHaver.style.display = 'flex';
    } 
    // Se total (dinheiro + haver) for menor, vira vale/diferença
    else if (totalPago < valorOriginal) {
      const diferenca = valorOriginal - totalPago;
      document.getElementById('pag-diferenca').textContent = diferenca.toFixed(2).replace('.', ',');
      if (botoesNormal) botoesNormal.style.display = 'none';
      if (botoesDiff) botoesDiff.style.display = 'flex';
      if (botoesHaver) botoesHaver.style.display = 'none';
    }
    // Se valor pago for igual ao valor a pagar, zerar tudo
    else {
      document.getElementById('pag-valor-haver').value = '0';
      document.getElementById('pag-diferenca').textContent = '0,00';
      valorHaver = 0;
      if (botoesNormal) botoesNormal.style.display = 'flex';
      if (botoesDiff) botoesDiff.style.display = 'none';
      if (botoesHaver) botoesHaver.style.display = 'none';
    }
    
    document.getElementById('pag-valor-pagar').textContent = Utils.formatCurrency(valorOriginal);
  },

  async submitPagamento(event) {
    event.preventDefault();
    
    const faturaId = document.getElementById('pag-fatura-id').value;
    const contaFinanceira = document.getElementById('pag-conta-financeira').value;
    const data = document.getElementById('pag-data').value;
    const valorHaver = parseFloat(document.getElementById('pag-valor-haver').value) || 0;
    const valorPago = parseFloat(document.getElementById('pag-valor-pago').value) || 0;
    const valorOriginal = parseFloat(document.getElementById('pag-valor-original').value) || 0;
    const acao = document.getElementById('pag-acao').value || 'normal';
    
    // Validar conta financeira
    if (!contaFinanceira) {
      Utils.showNotification('Selecione uma conta financeira', 'error');
      return;
    }
    
    // Validar se há valor pago
    if (valorPago <= 0) {
      Utils.showNotification('Informe o valor pago', 'error');
      return;
    }
    
    try {
      let mensagem = 'Pagamento registrado com sucesso!';
      
      if (valorPago + valorHaver > valorOriginal) {
        if (acao === 'juros') {
          // Trata excedente como juros: marca pago sem haver
          await api.updateFaturaStatus(faturaId, 'pago', 0, 0, contaFinanceira, data);
          mensagem += ` Juros registrado: ${Utils.formatCurrency((valorPago + valorHaver) - valorOriginal)}`;
        } else { // haver
          const haverGerado = (valorPago + valorHaver) - valorOriginal;
          await api.updateFaturaStatus(faturaId, 'pago', haverGerado, 0, contaFinanceira, data);
          mensagem += ` Haver gerado: ${Utils.formatCurrency(haverGerado)}`;
        }
      } else if (valorPago + valorHaver < valorOriginal) {
        const valorVale = valorOriginal - (valorPago + valorHaver);
        if (acao === 'desconto') {
          // Considera pago com desconto, sem gerar vale
          await api.updateFaturaStatus(faturaId, 'pago', 0, 0, contaFinanceira, data);
          mensagem += ` Desconto aplicado: ${Utils.formatCurrency(valorVale)}`;
        } else { // normal ou vale
          const resultado = await api.updateFaturaStatus(faturaId, 'pago', 0, valorVale, contaFinanceira, data);
          mensagem += ` Vale gerado: ${Utils.formatCurrency(valorVale)}`;
          if (resultado?.faturaRemovida) {
            mensagem += ' Fatura original removida.';
          }
        }
      } else {
        await api.updateFaturaStatus(faturaId, 'pago', 0, 0, contaFinanceira, data);
      }
      
      Utils.showNotification(mensagem, 'success');
      this.closePagamentoModal();
      await this.loadListar();
    } catch (error) {
      Utils.showNotification('Erro ao registrar pagamento', 'error');
      console.error(error);
    }
  },

  async delete(id) {
    if (!Utils.confirm('Deseja realmente deletar esta fatura?')) return;

    try {
      await api.deleteFatura(id);
      Utils.showNotification('Fatura deletada com sucesso!', 'success');
      const rotaAtual = (router?.currentRoute || window.location.hash.substring(1) || '').split('/')[0];
      if (rotaAtual === 'haver-listar') {
        await this.loadHaver();
      } else {
        await this.loadListar();
      }
    } catch (error) {
      Utils.showNotification('Erro ao deletar fatura', 'error');
      console.error(error);
    }
  },

  openAnexos(id) {
    if (!this.getCurrentUserAdmin()) {
      Utils.showNotification('Apenas administradores podem anexar PDFs.', 'error');
      return;
    }

    const fatura = this.faturas.find(f => f.id === id);
    if (!fatura) {
      Utils.showNotification('Fatura não encontrada', 'error');
      return;
    }
    document.getElementById('anexo-fatura-id').value = id;
    document.getElementById('anexo-numero').textContent = fatura.numero_fatura;
    document.getElementById('anexo-cliente').textContent = fatura.cliente_nome;
    document.getElementById('anexo-boleto').value = '';
    document.getElementById('anexo-nota').value = '';

    const btnBoleto = document.getElementById('anexo-download-boleto');
    const btnNota = document.getElementById('anexo-download-nf');
    if (btnBoleto) {
      btnBoleto.disabled = !fatura.boleto_path;
      btnBoleto.onclick = () => this.downloadBoleto(id);
    }
    if (btnNota) {
      btnNota.disabled = !fatura.nota_path;
      btnNota.onclick = () => this.downloadNota(id);
    }

    const modal = document.getElementById('anexos-fatura-modal');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeAnexos() {
    const modal = document.getElementById('anexos-fatura-modal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('anexos-form')?.reset();
  },

  async submitAnexos(event) {
    event.preventDefault();
    const id = document.getElementById('anexo-fatura-id').value;
    const boletoFile = document.getElementById('anexo-boleto').files[0];
    const notaFile = document.getElementById('anexo-nota').files[0];

    if (!boletoFile && !notaFile) {
      Utils.showNotification('Envie pelo menos um arquivo (boleto ou nota fiscal)', 'error');
      return;
    }

    const formData = new FormData();
    if (boletoFile) formData.append('boleto', boletoFile);
    if (notaFile) formData.append('nota', notaFile);

    try {
      await api.uploadAnexosFatura(id, formData);
      Utils.showNotification('Anexos enviados com sucesso!', 'success');
      this.closeAnexos();
      await this.loadListar();
    } catch (error) {
      console.error('Erro ao enviar anexos:', error);
      Utils.showNotification(error.message || 'Erro ao enviar anexos', 'error');
    }
  },

  async downloadBoleto(id) {
    try {
      const blob = await api.downloadBoleto(id);
      const fatura = this.faturas.find(f => f.id === id);
      const nome = fatura ? fatura.numero_fatura : id;
      Utils.downloadFile(blob, `boleto-${nome}.pdf`);
    } catch (error) {
      Utils.showNotification(error.message || 'Boleto não disponível', 'error');
    }
  },

  async downloadNota(id) {
    try {
      const blob = await api.downloadNota(id);
      const fatura = this.faturas.find(f => f.id === id);
      const nome = fatura ? fatura.numero_fatura : id;
      Utils.downloadFile(blob, `nota-${nome}.pdf`);
    } catch (error) {
      Utils.showNotification(error.message || 'Nota fiscal não disponível', 'error');
    }
  },

  setAcaoPagamento(acao, autoSubmit = false) {
    document.getElementById('pag-acao').value = acao || 'normal';
    if (autoSubmit) {
      document.getElementById('form-pagamento').requestSubmit();
    }
  },

  async preencherHaverDisponivel(fatura) {
    try {
      const havers = await api.getHaver();
      if (!havers || !havers.length) return;
      const disponivel = havers
        .filter(h => String(h.cliente_id) === String(fatura.cliente_id) && String(h.empresa_id) === String(fatura.empresa_id))
        .reduce((sum, h) => sum + Math.abs(parseFloat(h.valor) || 0), 0);
      const inputHaver = document.getElementById('pag-valor-haver');
      const inputPago = document.getElementById('pag-valor-pago');
      if (inputHaver) inputHaver.value = disponivel.toFixed(2);

      // Sugere valor pago já descontando haver disponível
      if (inputPago) {
        const valorOriginal = parseFloat(document.getElementById('pag-valor-original').value) || 0;
        const sugerido = Math.max(0, valorOriginal - disponivel);
        inputPago.value = sugerido.toFixed(2);
      }
    } catch (e) {
      console.error('Erro ao preencher haver disponível:', e);
    }
  },

  // Busca no haver por cliente/número/valor
  setupHaverSearch() {
    const searchInput = document.getElementById('haver-search');
    if (!searchInput) return;
    searchInput.removeEventListener?.('input', this._haverSearchHandler || (()=>{}));
    this._haverSearchHandler = Utils.debounce(() => this.aplicarFiltroHaverPesquisa(), 250);
    searchInput.addEventListener('input', this._haverSearchHandler);
  },

  aplicarFiltroHaverPesquisa() {
    const termo = (document.getElementById('haver-search')?.value || '').trim().toLowerCase();
    if (!termo) {
      this.faturasFiltradas = [...this.faturasHaver];
      this.renderHaver();
      return;
    }
    this.faturasFiltradas = this.faturasHaver.filter(f => {
      const nome = (f.cliente_nome || '').toLowerCase();
      const num = (f.numero_fatura || '').toLowerCase();
      const valorStr = String(f.valor || '').toLowerCase();
      return nome.includes(termo) || num.includes(termo) || valorStr.includes(termo);
    });
    this.renderHaver();
  },

  setupClienteAutocomplete({ inputId, hiddenId, listId, initFlag }) {
    if (this[initFlag]) return;
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const list = document.getElementById(listId);
    if (!input || !hidden || !list) return;

    const hideList = () => {
      list.classList.add('hidden');
      list.innerHTML = '';
    };

    const renderSugestoes = (termo) => {
      const q = (termo || '').toLowerCase().trim();
      if (!q) {
        hideList();
        return;
      }

      const qDoc = q.replace(/\D/g, '');
      const matches = (this.clientes || [])
        .filter(c => {
          const nome = (c.nome || '').toLowerCase();
          const doc = (c.cpf_cnpj || '').replace(/\D/g, '');
          return nome.includes(q) || (qDoc && doc.includes(qDoc));
        })
        .slice(0, 20);

      if (!matches.length) {
        hideList();
        return;
      }

      list.innerHTML = matches.map(c => `
        <div class="autocomplete-item" data-id="${c.id}" data-nome="${c.nome}">
          ${c.nome}
          <small>${c.cpf_cnpj || ''}</small>
        </div>
      `).join('');
      list.classList.remove('hidden');
    };

    input.addEventListener('input', (e) => {
      hidden.value = '';
      renderSugestoes(e.target.value);
    });

    input.addEventListener('focus', () => {
      renderSugestoes(input.value);
    });

    list.addEventListener('click', (ev) => {
      const item = ev.target.closest('.autocomplete-item');
      if (!item) return;
      hidden.value = item.getAttribute('data-id');
      input.value = item.getAttribute('data-nome');
      hideList();
    });

    document.addEventListener('click', (ev) => {
      if (!list.contains(ev.target) && ev.target !== input) {
        hideList();
      }
    });

    this[initFlag] = true;
  },

  // Autocomplete cliente no cadastro de fatura
  setupFaturaClienteBusca() {
    this.setupClienteAutocomplete({
      inputId: 'fatura-cliente-busca',
      hiddenId: 'fatura-cliente',
      listId: 'fatura-cliente-sugestoes',
      initFlag: 'faturaAutocompleteInit'
    });
  },

  // Autocomplete cliente no haver
  setupHaverClienteBusca() {
    this.setupClienteAutocomplete({
      inputId: 'haver-cliente-busca',
      hiddenId: 'haver-cliente',
      listId: 'haver-cliente-sugestoes',
      initFlag: 'haverAutocompleteInit'
    });
  },

  // Modal de status rápido
  openStatusModal(id, statusAtual) {
    document.getElementById('status-fatura-id').value = id;
    this.setStatusSelectValue('status-select', statusAtual);
    const modal = document.getElementById('status-modal');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeStatusModal() {
    const modal = document.getElementById('status-modal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('status-form')?.reset();
  },

  async submitStatus(event) {
    event.preventDefault();
    const id = document.getElementById('status-fatura-id').value;
    const status = document.getElementById('status-select').value;
    try {
      await api.updateFaturaStatus(id, status, 0, 0);
      Utils.showNotification('Status atualizado!', 'success');
      this.closeStatusModal();
      await this.loadListar();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      Utils.showNotification('Erro ao atualizar status', 'error');
    }
  },

  handleBoletoClick(id) {
    if (this.isAdmin) {
      this.openAnexos(id);
    } else {
      this.downloadBoleto(id);
    }
  },

  handleNotaClick(id) {
    if (this.isAdmin) {
      this.openAnexos(id);
    } else {
      this.downloadNota(id);
    }
  }
};

// Event Listeners
document.getElementById('fatura-form')?.addEventListener('submit', (e) => Faturas.create(e));
document.getElementById('upload-form')?.addEventListener('submit', (e) => Faturas.upload(e));
document.getElementById('anexos-form')?.addEventListener('submit', (e) => Faturas.submitAnexos(e));
document.getElementById('haver-form')?.addEventListener('submit', (e) => Faturas.submitHaver(e));
