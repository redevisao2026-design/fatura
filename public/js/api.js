// API Service - Centraliza todas as chamadas à API
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_FRONTEND_DEV_PORTS = new Set(['3000', '4173', '5173']);
const isLocalFrontendDevServer =
  LOCAL_API_HOSTS.has(window.location.hostname) &&
  LOCAL_FRONTEND_DEV_PORTS.has(window.location.port);

const API_URL = isLocalFrontendDevServer
  ? 'http://localhost:5000/api'
  : `${window.location.origin}/api`;

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  getHeaders(includeContentType = true) {
    const headers = {
      'Authorization': `Bearer ${this.token}`
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  // Auth
  async login(usuario, senha) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    return this.handleResponse(response);
  }

  async registro(nome, usuario, email, senha) {
    const response = await fetch(`${API_URL}/auth/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, usuario, email, senha })
    });
    return this.handleResponse(response);
  }

  // Usuários (apenas para admins)
  async getUsuarios() {
    const response = await fetch(`${API_URL}/usuarios`, {
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async createUsuario(data) {
    const response = await fetch(`${API_URL}/auth/registro`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async updateUsuario(id, data) {
    const response = await fetch(`${API_URL}/usuarios/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async deleteUsuario(id) {
    const response = await fetch(`${API_URL}/usuarios/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  // Clientes
  async getClientes() {
    const response = await fetch(`${API_URL}/clientes`, {
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async createCliente(data) {
    const response = await fetch(`${API_URL}/clientes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async updateCliente(id, data) {
    const response = await fetch(`${API_URL}/clientes/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async deleteCliente(id) {
    const response = await fetch(`${API_URL}/clientes/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  // Faturas
  async getFaturas() {
    const response = await fetch(`${API_URL}/faturas`, {
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async getHaver() {
    const response = await fetch(`${API_URL}/faturas/haver`, {
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async createFatura(data) {
    const response = await fetch(`${API_URL}/faturas`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async updateFaturaStatus(id, status, valorHaver = 0, valorVale = 0) {
    const response = await fetch(`${API_URL}/faturas/${id}/status`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ status, valorHaver, valorVale })
    });
    return this.handleResponse(response);
  }

  async updateFatura(id, data) {
    const response = await fetch(`${API_URL}/faturas/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async deleteFatura(id) {
    const response = await fetch(`${API_URL}/faturas/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async uploadFatura(formData) {
    const response = await fetch(`${API_URL}/faturas/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    });
    return this.handleResponse(response);
  }

  async downloadFatura(id) {
    const response = await fetch(`${API_URL}/faturas/download/${id}`, {
      headers: this.getHeaders(false)
    });
    if (!response.ok) throw new Error('Erro ao baixar fatura');
    return response.blob();
  }

  async uploadAnexosFatura(id, formData) {
    const response = await fetch(`${API_URL}/faturas/${id}/anexos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    });
    return this.handleResponse(response);
  }

  async downloadBoleto(id) {
    const response = await fetch(`${API_URL}/faturas/download/${id}/boleto`, {
      headers: this.getHeaders(false)
    });
    if (!response.ok) throw new Error('Boleto não disponível');
    return response.blob();
  }

  async downloadNota(id) {
    const response = await fetch(`${API_URL}/faturas/download/${id}/nota`, {
      headers: this.getHeaders(false)
    });
    if (!response.ok) throw new Error('Nota fiscal não disponível');
    return response.blob();
  }

  // Empresa
  async getEmpresas() {
    console.log('API: Buscando todas as empresas...');
    try {
      const response = await fetch(`${API_URL}/empresa`, {
        headers: this.getHeaders(false)
      });
      const data = await this.handleResponse(response);
      console.log('API: Empresas recebidas:', data);
      return data;
    } catch (error) {
      console.error('API: Erro ao buscar empresas:', error);
      throw error;
    }
  }

  async getEmpresa(id) {
    console.log(`API: Buscando empresa ${id}...`);
    try {
      const response = await fetch(`${API_URL}/empresa/${id}`, {
        headers: this.getHeaders(false)
      });
      const data = await this.handleResponse(response);
      console.log('API: Empresa recebida:', data);
      return data;
    } catch (error) {
      console.error('API: Erro ao buscar empresa:', error);
      throw error;
    }
  }

  async createEmpresa(data) {
    console.log('API: Criando nova empresa:', data);
    try {
      const response = await fetch(`${API_URL}/empresa`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });
      const result = await this.handleResponse(response);
      console.log('API: Empresa criada com sucesso:', result);
      return result;
    } catch (error) {
      console.error('API: Erro ao criar empresa:', error);
      throw error;
    }
  }

  async updateEmpresa(id, data) {
    console.log(`API: Atualizando empresa ${id}:`, data);
    try {
      const response = await fetch(`${API_URL}/empresa/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });
      const result = await this.handleResponse(response);
      console.log('API: Empresa atualizada com sucesso:', result);
      return result;
    } catch (error) {
      console.error('API: Erro ao atualizar empresa:', error);
      throw error;
    }
  }

  async deleteEmpresa(id) {
    const response = await fetch(`${API_URL}/empresa/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(false)
    });
    return this.handleResponse(response);
  }

  async handleResponse(response) {
    // Se for 401 (não autorizado), fazer logout automático
    if (response.status === 401) {
      console.warn('Token expirado ou inválido. Redirecionando para login...');
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/';
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();
    let data = {};

    if (rawBody) {
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawBody);
        } catch (error) {
          data = { erro: rawBody };
        }
      } else {
        try {
          data = JSON.parse(rawBody);
        } catch (error) {
          data = { erro: rawBody };
        }
      }
    }

    if (!response.ok) {
      throw new Error(data.erro || data.message || 'Erro na requisição');
    }

    return data;
  }
}

const api = new ApiService();
