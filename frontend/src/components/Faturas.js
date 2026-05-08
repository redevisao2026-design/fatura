import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Faturas() {
  const [faturas, setFaturas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState({ cliente_id: '', numero_fatura: '', valor: '', data_vencimento: '', status: 'pendente' });
  const [arquivo, setArquivo] = useState(null);

  const token = localStorage.getItem('token');
  const config = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchFaturas();
    fetchClientes();
  }, []);

  const fetchFaturas = async () => {
    try {
      const response = await axios.get('/api/faturas', config);
      setFaturas(response.data);
    } catch (error) {
      alert('Erro ao buscar faturas');
    }
  };

  const fetchClientes = async () => {
    try {
      const response = await axios.get('/api/clientes', config);
      setClientes(response.data);
    } catch (error) {
      alert('Erro ao buscar clientes');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/faturas', form, config);
      alert('Fatura criada!');
      setForm({ cliente_id: '', numero_fatura: '', valor: '', data_vencimento: '', status: 'pendente' });
      fetchFaturas();
    } catch (error) {
      alert('Erro ao criar fatura');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!arquivo) {
      alert('Selecione um arquivo');
      return;
    }

    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('cliente_id', form.cliente_id);
    formData.append('numero_fatura', form.numero_fatura);
    formData.append('valor', form.valor);
    formData.append('data_vencimento', form.data_vencimento);

    try {
      const response = await axios.post('/api/faturas/upload', formData, {
        headers: { ...config.headers, 'Content-Type': 'multipart/form-data' }
      });
      alert(response.data.mensagem);
      setArquivo(null);
      setForm({ cliente_id: '', numero_fatura: '', valor: '', data_vencimento: '', status: 'pendente' });
      fetchFaturas();
    } catch (error) {
      alert(error.response?.data?.erro || 'Erro ao fazer upload');
    }
  };

  const handleDownload = async (id) => {
    try {
      const response = await axios.get(`/api/faturas/download/${id}`, {
        ...config,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fatura-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Erro ao baixar fatura');
    }
  };

  return (
    <div className="container">
      <h1>Faturas</h1>
      
      <div className="card">
        <h3>Nova Fatura</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Cliente</label>
            <select value={form.cliente_id} onChange={(e) => setForm({...form, cliente_id: e.target.value})} required>
              <option value="">Selecione um cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Número da Fatura</label>
            <input value={form.numero_fatura} onChange={(e) => setForm({...form, numero_fatura: e.target.value})} required />
          </div>
          <div className="form-group">
            <label>Valor</label>
            <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({...form, valor: e.target.value})} required />
          </div>
          <div className="form-group">
            <label>Data de Vencimento</label>
            <input type="date" value={form.data_vencimento} onChange={(e) => setForm({...form, data_vencimento: e.target.value})} required />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="nova gestão">Nova Gestão</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Criar Fatura</button>
        </form>
      </div>

      <div className="card">
        <h3>Upload de Arquivo (PDF ou CSV)</h3>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>Arquivo (PDF ou CSV)</label>
            <input type="file" accept=".pdf,.csv" onChange={(e) => setArquivo(e.target.files[0])} required />
          </div>
          <p style={{ fontSize: '12px', color: '#666' }}>
            CSV deve conter: cliente_id, numero_fatura, valor, data_vencimento
          </p>
          {arquivo?.type !== 'text/csv' && (
            <>
              <div className="form-group">
                <label>Cliente</label>
                <select value={form.cliente_id} onChange={(e) => setForm({...form, cliente_id: e.target.value})} required>
                  <option value="">Selecione um cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Número da Fatura</label>
                <input value={form.numero_fatura} onChange={(e) => setForm({...form, numero_fatura: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Valor</label>
                <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({...form, valor: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Data de Vencimento</label>
                <input type="date" value={form.data_vencimento} onChange={(e) => setForm({...form, data_vencimento: e.target.value})} required />
              </div>
            </>
          )}
          <button type="submit" className="btn btn-primary">Fazer Upload</button>
        </form>
      </div>

      <div className="card">
        <h3>Lista de Faturas</h3>
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map(fatura => (
              <tr key={fatura.id}>
                <td>{fatura.numero_fatura}</td>
                <td>{fatura.cliente_nome}</td>
                <td>R$ {parseFloat(fatura.valor).toFixed(2)}</td>
                <td>{new Date(fatura.data_vencimento).toLocaleDateString('pt-BR')}</td>
                <td>{fatura.status}</td>
                <td>
                  {fatura.arquivo_path && (
                    <button onClick={() => handleDownload(fatura.id)} className="btn btn-primary">
                      Baixar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Faturas;
