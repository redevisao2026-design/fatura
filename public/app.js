const API_URL = 'http://localhost:5000/api';
let token = localStorage.getItem('token');

// Funções do Menu Mobile - Definir globalmente
window.toggleMenu = function() {
  const navLinks = document.getElementById('nav-links');
  const overlay = document.getElementById('nav-overlay');
  if (navLinks && overlay) {
    navLinks.classList.toggle('active');
    overlay.classList.toggle('active');
  }
};

window.closeMenu = function() {
  const navLinks = document.getElementById('nav-links');
  const overlay = document.getElementById('nav-overlay');
  if (navLinks && overlay) {
    navLinks.classList.remove('active');
    overlay.classList.remove('active');
  }
};

// Event listeners para o menu mobile
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menu-toggle');
  const overlay = document.getElementById('nav-overlay');
  
  if (menuToggle) {
    menuToggle.addEventListener('click', window.toggleMenu);
  }
  
  if (overlay) {
    overlay.addEventListener('click', window.closeMenu);
  }
});

// Função para mostrar notificações
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Adicionar animações CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Auth
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = document.getElementById('login-usuario').value;
  const senha = document.getElementById('login-senha').value;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    const data = await res.json();
    
    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      showMainPage();
    } else {
      alert(data.erro);
    }
  } catch (error) {
    alert('Erro ao fazer login');
  }
});

document.getElementById('registro-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('reg-nome').value;
  const usuario = document.getElementById('reg-usuario').value;
  const email = document.getElementById('reg-email').value;
  const senha = document.getElementById('reg-senha').value;

  try {
    const res = await fetch(`${API_URL}/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, usuario, email, senha })
    });
    const data = await res.json();
    
    if (res.ok) {
      alert('Conta criada! Faça login.');
      showLogin();
    } else {
      alert(data.erro);
    }
  } catch (error) {
    alert('Erro ao criar conta');
  }
});

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('registro-page').classList.add('hidden');
}

function showRegistro() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('registro-page').classList.remove('hidden');
}

function showMainPage() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('registro-page').classList.add('hidden');
  document.getElementById('main-page').classList.remove('hidden');
  showDashboard();
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  location.reload();
}

// Navigation
function showDashboard() {
  hideAllSections();
  document.getElementById('dashboard-section').classList.remove('hidden');
  setActiveNav(0);
  loadDashboard();
}

function showClientes() {
  hideAllSections();
  document.getElementById('clientes-section').classList.remove('hidden');
  setActiveNav(1);
  loadClientes();
}

function showFaturas() {
  hideAllSections();
  document.getElementById('faturas-section').classList.remove('hidden');
  setActiveNav(2);
  loadFaturas();
  loadClientesSelect();
}

function hideAllSections() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
}

function setActiveNav(index) {
  document.querySelectorAll('.nav-links a').forEach((link, i) => {
    if (i === index) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// Dashboard
async function loadDashboard() {
  try {
    const [clientesRes, faturasRes] = await Promise.all([
      fetch(`${API_URL}/clientes`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/faturas`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const clientes = await clientesRes.json();
    const faturas = await faturasRes.json();

    document.getElementById('stat-clientes').textContent = clientes.length;
    document.getElementById('stat-faturas').textContent = faturas.length;
    document.getElementById('stat-pendentes').textContent = faturas.filter(f => f.status === 'pendente').length;
  } catch (error) {
    console.error('Erro ao carregar dashboard', error);
  }
}

// Clientes
async function loadClientes() {
  try {
    const res = await fetch(`${API_URL}/clientes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const clientes = await res.json();

    const tbody = document.querySelector('#clientes-table tbody');
    tbody.innerHTML = clientes.map(c => `
      <tr>
        <td><strong>${c.nome}</strong></td>
        <td>${c.cpf_cnpj}</td>
        <td>${c.email || '-'}</td>
        <td>${c.telefone || '-'}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-primary" onclick="editCliente(${c.id})">✏️ Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCliente(${c.id})">🗑️ Deletar</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    alert('Erro ao carregar clientes');
  }
}

document.getElementById('cliente-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cliente-id').value;
  const data = {
    nome: document.getElementById('cliente-nome').value,
    cpf_cnpj: document.getElementById('cliente-cpf').value,
    email: document.getElementById('cliente-email').value,
    telefone: document.getElementById('cliente-telefone').value,
    endereco: document.getElementById('cliente-endereco').value
  };

  try {
    const url = id ? `${API_URL}/clientes/${id}` : `${API_URL}/clientes`;
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert('Cliente salvo!');
      resetClienteForm();
      loadClientes();
    } else {
      const error = await res.json();
      alert(error.erro);
    }
  } catch (error) {
    alert('Erro ao salvar cliente');
  }
});

function resetClienteForm() {
  document.getElementById('cliente-form').reset();
  document.getElementById('cliente-id').value = '';
}

async function editCliente(id) {
  try {
    const res = await fetch(`${API_URL}/clientes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const clientes = await res.json();
    const cliente = clientes.find(c => c.id === id);

    if (cliente) {
      document.getElementById('cliente-id').value = cliente.id;
      document.getElementById('cliente-nome').value = cliente.nome;
      document.getElementById('cliente-cpf').value = cliente.cpf_cnpj;
      document.getElementById('cliente-email').value = cliente.email || '';
      document.getElementById('cliente-telefone').value = cliente.telefone || '';
      document.getElementById('cliente-endereco').value = cliente.endereco || '';
    }
  } catch (error) {
    alert('Erro ao carregar cliente');
  }
}

async function deleteCliente(id) {
  if (!confirm('Deseja deletar este cliente?')) return;

  try {
    const res = await fetch(`${API_URL}/clientes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      loadClientes();
    } else {
      alert('Erro ao deletar cliente');
    }
  } catch (error) {
    alert('Erro ao deletar cliente');
  }
}

// Faturas
async function loadFaturas() {
  try {
    const res = await fetch(`${API_URL}/faturas`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const faturas = await res.json();

    const tbody = document.querySelector('#faturas-table tbody');
    tbody.innerHTML = faturas.map(f => `
      <tr>
        <td><strong>${f.numero_fatura}</strong></td>
        <td>${f.cliente_nome}</td>
        <td><strong>R$ ${parseFloat(f.valor).toFixed(2)}</strong></td>
        <td>${new Date(f.data_vencimento).toLocaleDateString('pt-BR')}</td>
        <td><span class="badge badge-${f.status === 'pago' ? 'success' : f.status === 'vencido' ? 'danger' : 'warning'}">${f.status}</span></td>
        <td class="table-actions">
          ${f.arquivo_path ? `<button class="btn btn-sm btn-primary" onclick="downloadFatura(${f.id})">⬇️ Baixar</button>` : '-'}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    alert('Erro ao carregar faturas');
  }
}

async function loadClientesSelect() {
  try {
    const res = await fetch(`${API_URL}/clientes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const clientes = await res.json();

    const selects = [
      document.getElementById('fatura-cliente'),
      document.getElementById('upload-cliente')
    ];

    selects.forEach(select => {
      select.innerHTML = '<option value="">Selecione um cliente</option>' +
        clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    });
  } catch (error) {
    console.error('Erro ao carregar clientes');
  }
}

document.getElementById('fatura-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    cliente_id: document.getElementById('fatura-cliente').value,
    numero_fatura: document.getElementById('fatura-numero').value,
    valor: document.getElementById('fatura-valor').value,
    data_vencimento: document.getElementById('fatura-vencimento').value,
    status: document.getElementById('fatura-status').value
  };

  try {
    const res = await fetch(`${API_URL}/faturas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert('Fatura criada!');
      document.getElementById('fatura-form').reset();
      loadFaturas();
    } else {
      alert('Erro ao criar fatura');
    }
  } catch (error) {
    alert('Erro ao criar fatura');
  }
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  const arquivo = document.getElementById('upload-arquivo').files[0];
  
  formData.append('arquivo', arquivo);
  formData.append('cliente_id', document.getElementById('upload-cliente').value);
  formData.append('numero_fatura', document.getElementById('upload-numero').value);
  formData.append('valor', document.getElementById('upload-valor').value);
  formData.append('data_vencimento', document.getElementById('upload-vencimento').value);

  try {
    const res = await fetch(`${API_URL}/faturas/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.mensagem);
      document.getElementById('upload-form').reset();
      loadFaturas();
    } else {
      alert(data.erro);
    }
  } catch (error) {
    alert('Erro ao fazer upload');
  }
});

async function downloadFatura(id) {
  try {
    const res = await fetch(`${API_URL}/faturas/download/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fatura-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    alert('Erro ao baixar fatura');
  }
}

// Check auth on load
if (token) {
  showMainPage();
}


// Faturar Notas a Prazo
let parcelasPreview = [];

function showFaturarPrazo() {
  hideAllSections();
  document.getElementById('faturar-prazo-section').classList.remove('hidden');
  setActiveNav(3);
  loadClientesSelect();
  
  const select = document.getElementById('prazo-cliente');
  fetch(`${API_URL}/clientes`, { headers: { Authorization: `Bearer ${token}` } })
    .then(res => res.json())
    .then(clientes => {
      select.innerHTML = '<option value="">Selecione um cliente</option>' +
        clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    });
}

document.getElementById('faturar-prazo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const clienteId = document.getElementById('prazo-cliente').value;
  const numero = document.getElementById('prazo-numero').value;
  const valorTotal = parseFloat(document.getElementById('prazo-valor-total').value);
  const numParcelas = parseInt(document.getElementById('prazo-parcelas').value);
  const primeiroVencimento = new Date(document.getElementById('prazo-primeiro-vencimento').value);
  const intervalo = parseInt(document.getElementById('prazo-intervalo').value);
  
  const valorParcela = valorTotal / numParcelas;
  parcelasPreview = [];
  
  for (let i = 0; i < numParcelas; i++) {
    const vencimento = new Date(primeiroVencimento);
    vencimento.setDate(vencimento.getDate() + (i * intervalo));
    
    parcelasPreview.push({
      cliente_id: clienteId,
      numero_fatura: `${numero}-${i + 1}/${numParcelas}`,
      valor: i === numParcelas - 1 ? (valorTotal - (valorParcela * (numParcelas - 1))).toFixed(2) : valorParcela.toFixed(2),
      data_vencimento: vencimento.toISOString().split('T')[0],
      status: 'pendente'
    });
  }
  
  const tbody = document.querySelector('#preview-table tbody');
  tbody.innerHTML = parcelasPreview.map((p, i) => `
    <tr>
      <td>${i + 1}/${numParcelas}</td>
      <td>${p.numero_fatura}</td>
      <td>R$ ${parseFloat(p.valor).toFixed(2)}</td>
      <td>${new Date(p.data_vencimento).toLocaleDateString('pt-BR')}</td>
    </tr>
  `).join('');
  
  document.getElementById('preview-parcelas').style.display = 'block';
});

async function confirmarParcelas() {
  try {
    for (const parcela of parcelasPreview) {
      await fetch(`${API_URL}/faturas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(parcela)
      });
    }
    
    showNotification(`${parcelasPreview.length} parcelas criadas com sucesso!`);
    document.getElementById('faturar-prazo-form').reset();
    document.getElementById('preview-parcelas').style.display = 'none';
    parcelasPreview = [];
  } catch (error) {
    showNotification('Erro ao criar parcelas', 'error');
  }
}

function cancelarParcelas() {
  document.getElementById('preview-parcelas').style.display = 'none';
  parcelasPreview = [];
}

// Consultar Notas a Prazo
function showConsultarPrazo() {
  hideAllSections();
  document.getElementById('consultar-prazo-section').classList.remove('hidden');
  setActiveNav(4);
  
  fetch(`${API_URL}/clientes`, { headers: { Authorization: `Bearer ${token}` } })
    .then(res => res.json())
    .then(clientes => {
      const select = document.getElementById('filtro-cliente');
      select.innerHTML = '<option value="">Todos</option>' +
        clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    });
  
  loadConsultarPrazo();
}

async function loadConsultarPrazo(filtros = {}) {
  try {
    const res = await fetch(`${API_URL}/faturas`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    let faturas = await res.json();
    
    // Aplicar filtros
    if (filtros.cliente) {
      faturas = faturas.filter(f => f.cliente_id == filtros.cliente);
    }
    
    if (filtros.status) {
      faturas = faturas.filter(f => f.status === filtros.status);
    }
    
    if (filtros.periodo) {
      const hoje = new Date();
      if (filtros.periodo === 'vencendo') {
        const seteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
        faturas = faturas.filter(f => {
          const venc = new Date(f.data_vencimento);
          return venc >= hoje && venc <= seteDias && f.status === 'pendente';
        });
      } else if (filtros.periodo === 'mes') {
        faturas = faturas.filter(f => {
          const venc = new Date(f.data_vencimento);
          return venc.getMonth() === hoje.getMonth() && venc.getFullYear() === hoje.getFullYear();
        });
      } else if (filtros.periodo === 'vencidas') {
        faturas = faturas.filter(f => {
          const venc = new Date(f.data_vencimento);
          return venc < hoje && f.status === 'pendente';
        });
      }
    }
    
    // Calcular totais
    const totalPrazo = faturas.reduce((sum, f) => sum + parseFloat(f.valor), 0);
    const totalPendente = faturas.filter(f => f.status === 'pendente').reduce((sum, f) => sum + parseFloat(f.valor), 0);
    const totalPago = faturas.filter(f => f.status === 'pago').reduce((sum, f) => sum + parseFloat(f.valor), 0);
    
    document.getElementById('total-prazo').textContent = totalPrazo.toFixed(2);
    document.getElementById('total-pendente').textContent = totalPendente.toFixed(2);
    document.getElementById('total-pago').textContent = totalPago.toFixed(2);
    
    const tbody = document.querySelector('#consultar-prazo-table tbody');
    tbody.innerHTML = faturas.map(f => {
      const vencimento = new Date(f.data_vencimento);
      const hoje = new Date();
      const statusClass = f.status === 'pago' ? 'success' : (vencimento < hoje ? 'danger' : 'warning');
      
      return `
        <tr>
          <td>${f.numero_fatura.split('-')[0]}</td>
          <td>${f.numero_fatura.includes('/') ? f.numero_fatura.split('-')[1] : '1/1'}</td>
          <td>${f.cliente_nome}</td>
          <td>R$ ${parseFloat(f.valor).toFixed(2)}</td>
          <td>${vencimento.toLocaleDateString('pt-BR')}</td>
          <td><span class="badge badge-${statusClass}">${f.status}</span></td>
          <td>
            ${f.status === 'pendente' ? `<button class="btn btn-primary" onclick="marcarComoPago(${f.id})">Marcar Pago</button>` : ''}
            ${f.arquivo_path ? `<button class="btn btn-primary" onclick="downloadFatura(${f.id})">Baixar</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    showNotification('Erro ao carregar faturas', 'error');
  }
}

function aplicarFiltros() {
  const filtros = {
    cliente: document.getElementById('filtro-cliente').value,
    status: document.getElementById('filtro-status').value,
    periodo: document.getElementById('filtro-periodo').value
  };
  loadConsultarPrazo(filtros);
}

async function marcarComoPago(id) {
  if (!confirm('Marcar esta fatura como paga?')) return;
  
  try {
    const res = await fetch(`${API_URL}/faturas/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'pago' })
    });
    
    if (res.ok) {
      showNotification('Fatura marcada como paga!');
      loadConsultarPrazo();
    }
  } catch (error) {
    showNotification('Erro ao atualizar status', 'error');
  }
}

// Arquivo Remessa Boletos
function showRemessaBoletos() {
  hideAllSections();
  document.getElementById('remessa-boletos-section').classList.remove('hidden');
  setActiveNav(5);
  loadFaturasRemessa();
}

async function loadFaturasRemessa() {
  try {
    const res = await fetch(`${API_URL}/faturas`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const faturas = await res.json();
    const pendentes = faturas.filter(f => f.status === 'pendente');
    
    const tbody = document.querySelector('#remessa-table tbody');
    tbody.innerHTML = pendentes.map(f => `
      <tr>
        <td><input type="checkbox" class="remessa-check" value="${f.id}" data-fatura='${JSON.stringify(f)}'></td>
        <td>${f.numero_fatura}</td>
        <td>${f.cliente_nome}</td>
        <td>R$ ${parseFloat(f.valor).toFixed(2)}</td>
        <td>${new Date(f.data_vencimento).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('');
  } catch (error) {
    showNotification('Erro ao carregar faturas', 'error');
  }
}

function toggleAllRemessa() {
  const checked = document.getElementById('select-all-remessa').checked;
  document.querySelectorAll('.remessa-check').forEach(cb => cb.checked = checked);
}

function gerarArquivoRemessa() {
  const banco = document.getElementById('banco-codigo').value;
  const agencia = document.getElementById('banco-agencia').value;
  const conta = document.getElementById('banco-conta').value;
  const carteira = document.getElementById('banco-carteira').value;
  const convenio = document.getElementById('banco-convenio').value;
  
  if (!banco || !agencia || !conta || !carteira || !convenio) {
    showNotification('Preencha todos os dados bancários', 'error');
    return;
  }
  
  const selecionadas = Array.from(document.querySelectorAll('.remessa-check:checked'))
    .map(cb => JSON.parse(cb.dataset.fatura));
  
  if (selecionadas.length === 0) {
    showNotification('Selecione pelo menos uma fatura', 'error');
    return;
  }
  
  // Gerar arquivo CNAB 240 simplificado
  let conteudo = `${banco.padStart(3, '0')}0000         ${convenio.padEnd(20, ' ')}${agencia.padStart(5, '0')}${conta.padEnd(12, ' ')}\n`;
  
  selecionadas.forEach((fatura, index) => {
    const linha = `${banco.padStart(3, '0')}${(index + 1).toString().padStart(5, '0')}` +
                  `${fatura.numero_fatura.padEnd(25, ' ')}` +
                  `${(parseFloat(fatura.valor) * 100).toFixed(0).padStart(15, '0')}` +
                  `${fatura.data_vencimento.replace(/-/g, '')}` +
                  `${carteira.padStart(3, '0')}\n`;
    conteudo += linha;
  });
  
  // Download do arquivo
  const blob = new Blob([conteudo], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remessa_${banco}_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  
  showNotification(`Arquivo de remessa gerado com ${selecionadas.length} boletos!`);
}

// Funções de Perfil do Usuário
window.openPerfilModal = async function() {
  try {
    // Buscar dados do usuário atual
    const usuarioData = JSON.parse(localStorage.getItem('usuario'));
    
    if (!usuarioData || !usuarioData.id) {
      Utils.showNotification('Erro ao carregar dados do usuário', 'error');
      return;
    }
    
    // Preencher formulário
    document.getElementById('perfil-usuario-id').value = usuarioData.id;
    document.getElementById('perfil-nome').value = usuarioData.nome || '';
    document.getElementById('perfil-usuario').value = usuarioData.usuario || '';
    document.getElementById('perfil-email').value = usuarioData.email || '';
    
    // Limpar campos de senha
    document.getElementById('perfil-senha-atual').value = '';
    document.getElementById('perfil-senha-nova').value = '';
    document.getElementById('perfil-senha-confirmar').value = '';
    
    // Abrir modal
    const modal = document.getElementById('perfil-modal');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('Erro ao abrir modal de perfil:', error);
    Utils.showNotification('Erro ao carregar perfil', 'error');
  }
};

window.closePerfilModal = function() {
  const modal = document.getElementById('perfil-modal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
  document.getElementById('form-perfil').reset();
};

window.submitPerfil = async function(event) {
  event.preventDefault();
  
  const usuarioId = document.getElementById('perfil-usuario-id').value;
  const nome = document.getElementById('perfil-nome').value;
  const usuario = document.getElementById('perfil-usuario').value;
  const email = document.getElementById('perfil-email').value;
  const senhaAtual = document.getElementById('perfil-senha-atual').value;
  const senhaNova = document.getElementById('perfil-senha-nova').value;
  const senhaConfirmar = document.getElementById('perfil-senha-confirmar').value;
  
  // Validar alteração de senha
  if (senhaAtual || senhaNova || senhaConfirmar) {
    if (!senhaAtual) {
      Utils.showNotification('Informe a senha atual para alterar a senha', 'error');
      return;
    }
    if (!senhaNova) {
      Utils.showNotification('Informe a nova senha', 'error');
      return;
    }
    if (senhaNova !== senhaConfirmar) {
      Utils.showNotification('As senhas não coincidem', 'error');
      return;
    }
    if (senhaNova.length < 6) {
      Utils.showNotification('A nova senha deve ter no mínimo 6 caracteres', 'error');
      return;
    }
  }
  
  try {
    const data = {
      nome,
      usuario,
      email: email || null
    };
    
    // Se está alterando senha, incluir no payload
    if (senhaAtual && senhaNova) {
      data.senhaAtual = senhaAtual;
      data.senhaNova = senhaNova;
    }
    
    const response = await api.updateUsuario(usuarioId, data);
    
    // Atualizar dados no localStorage
    const usuarioData = JSON.parse(localStorage.getItem('usuario'));
    usuarioData.nome = nome;
    usuarioData.usuario = usuario;
    usuarioData.email = email;
    localStorage.setItem('usuario', JSON.stringify(usuarioData));
    
    // Atualizar nome exibido na interface
    Auth.updateUserDisplay();
    
    Utils.showNotification('Perfil atualizado com sucesso!', 'success');
    closePerfilModal();
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    Utils.showNotification(error.message || 'Erro ao atualizar perfil', 'error');
  }
};
