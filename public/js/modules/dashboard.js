// Dashboard Module
const Dashboard = {
  charts: {},
  empresaFiltro: '',

  normalizeStatus(status) {
    return (status || '')
      .toString()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  },
  
  async load() {
    try {
      // Carregar empresas para o filtro
      await this.loadEmpresaFilter();
      
      // Carregar dados e renderizar
      await this.loadData();
      
      // Event listener para filtro de empresa
      document.getElementById('dashboard-empresa-filter').addEventListener('change', (e) => {
        this.empresaFiltro = e.target.value;
        this.loadData();
      });
    } catch (error) {
      Utils.showNotification('Erro ao carregar dashboard', 'error');
      console.error(error);
    }
  },
  
  async loadEmpresaFilter() {
    try {
      const empresas = await api.getEmpresas();
      const select = document.getElementById('dashboard-empresa-filter');
      
      select.innerHTML = '<option value="">Todas as Empresas</option>';
      empresas.forEach(empresa => {
        const option = document.createElement('option');
        option.value = empresa.id;
        option.textContent = empresa.nome;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  },
  
  async loadData() {
    try {
      const [clientes, todasFaturas, empresas] = await Promise.all([
        api.getClientes(),
        api.getFaturas(),
        api.getEmpresas()
      ]);
      
      // Filtrar faturas por empresa se selecionada
      const faturas = this.empresaFiltro 
        ? todasFaturas.filter(f => f.empresa_id == this.empresaFiltro)
        : todasFaturas;

      const stats = {
        clientes: clientes.length,
        faturas: faturas.length,
        pendentes: faturas.filter(f => f.status === 'pendente').length,
        vencidas: faturas.filter(f => f.status === 'vencido').length
      };

      this.render(stats);
      this.renderCharts(faturas, clientes, empresas);
    } catch (error) {
      Utils.showNotification('Erro ao carregar dados', 'error');
      console.error(error);
    }
  },

  render(stats) {
    document.getElementById('stat-clientes').textContent = stats.clientes;
    document.getElementById('stat-faturas').textContent = stats.faturas;
    document.getElementById('stat-pendentes').textContent = stats.pendentes;
    document.getElementById('stat-vencidas').textContent = stats.vencidas;
  },
  
  renderCharts(faturas, clientes, empresas) {
    this.renderStatusChart(faturas);
    this.renderPostosVencidasChart(faturas, empresas);
    this.renderMesChart(faturas);
    this.renderValorPostoChart(faturas, empresas);
  },
  
  renderStatusChart(faturas) {
    const ctx = document.getElementById('chart-status');
    if (!ctx) return;
    
    const statusCount = {
      'pendente': faturas.filter(f => this.normalizeStatus(f.status) === 'pendente').length,
      'pago': faturas.filter(f => this.normalizeStatus(f.status) === 'pago').length,
      'vencido': faturas.filter(f => this.normalizeStatus(f.status) === 'vencido').length,
      'novaGestao': faturas.filter(f => this.normalizeStatus(f.status) === 'nova gestao').length
    };
    
    if (this.charts.status) {
      this.charts.status.destroy();
    }
    
    this.charts.status = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Pendente', 'Pago', 'Vencido', 'Nova Gestão'],
        datasets: [{
          data: [statusCount.pendente, statusCount.pago, statusCount.vencido, statusCount.novaGestao],
          backgroundColor: ['#FF9800', '#10b981', '#ef4444', '#0ea5e9'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  },
  
  renderPostosVencidasChart(faturas, empresas) {
    const ctx = document.getElementById('chart-postos-vencidas');
    if (!ctx) return;
    
    // Contar faturas vencidas por posto
    const postoVencidas = {};
    const faturasVencidas = faturas.filter(f => f.status === 'vencido');
    
    faturasVencidas.forEach(f => {
      const empresa = empresas.find(e => e.id === f.empresa_id);
      if (empresa) {
        const nome = empresa.nome;
        if (!postoVencidas[nome]) {
          postoVencidas[nome] = { count: 0, valor: 0 };
        }
        postoVencidas[nome].count++;
        postoVencidas[nome].valor += parseFloat(f.valor || 0);
      }
    });
    
    // Ordenar por quantidade
    const postosOrdenados = Object.entries(postoVencidas)
      .sort((a, b) => b[1].count - a[1].count);
    
    if (this.charts.postosVencidas) {
      this.charts.postosVencidas.destroy();
    }
    
    this.charts.postosVencidas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: postosOrdenados.map(([nome]) => nome.length > 15 ? nome.substring(0, 15) + '...' : nome),
        datasets: [{
          label: 'Faturas Vencidas',
          data: postosOrdenados.map(([, data]) => data.count),
          backgroundColor: '#ef4444'
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              afterLabel: function(context) {
                const posto = postosOrdenados[context.dataIndex];
                return 'Valor: R$ ' + posto[1].valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  },
  
  renderMesChart(faturas) {
    const ctx = document.getElementById('chart-mes');
    if (!ctx) return;
    
    // Agrupar por mês e status
    const meses = {};
    faturas.forEach(f => {
      const data = new Date(f.data_vencimento);
      const mesAno = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
      
      if (!meses[mesAno]) {
        meses[mesAno] = { pendente: 0, pago: 0, vencido: 0, novaGestao: 0 };
      }

      const normalizedStatus = this.normalizeStatus(f.status);
      if (normalizedStatus === 'pendente') {
        meses[mesAno].pendente++;
      } else if (normalizedStatus === 'pago') {
        meses[mesAno].pago++;
      } else if (normalizedStatus === 'vencido') {
        meses[mesAno].vencido++;
      } else if (normalizedStatus === 'nova gestao') {
        meses[mesAno].novaGestao++;
      }
    });
    
    // Ordenar por data
    const mesesOrdenados = Object.keys(meses).sort((a, b) => {
      const [mesA, anoA] = a.split('/');
      const [mesB, anoB] = b.split('/');
      return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    });
    
    // Pegar últimos 6 meses
    const ultimos6Meses = mesesOrdenados.slice(-6);
    
    if (this.charts.mes) {
      this.charts.mes.destroy();
    }
    
    this.charts.mes = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ultimos6Meses,
        datasets: [
          {
            label: 'Pago',
            data: ultimos6Meses.map(m => meses[m].pago),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Pendente',
            data: ultimos6Meses.map(m => meses[m].pendente),
            borderColor: '#FF9800',
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Vencido',
            data: ultimos6Meses.map(m => meses[m].vencido),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Nova Gestão',
            data: ultimos6Meses.map(m => meses[m].novaGestao),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  },
  
  renderValorPostoChart(faturas, empresas) {
    const ctx = document.getElementById('chart-valor-posto');
    if (!ctx) return;
    
    // Calcular valor total por posto
    const postoValor = {};
    faturas.forEach(f => {
      const empresa = empresas.find(e => e.id === f.empresa_id);
      if (empresa) {
        const nome = empresa.nome;
        postoValor[nome] = (postoValor[nome] || 0) + parseFloat(f.valor || 0);
      }
    });
    
    // Ordenar por valor
    const postosOrdenados = Object.entries(postoValor)
      .sort((a, b) => b[1] - a[1]);
    
    if (this.charts.valorPosto) {
      this.charts.valorPosto.destroy();
    }
    
    this.charts.valorPosto = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: postosOrdenados.map(([nome]) => nome.length > 15 ? nome.substring(0, 15) + '...' : nome),
        datasets: [{
          label: 'Valor Total (R$)',
          data: postosOrdenados.map(([, valor]) => valor),
          backgroundColor: '#1B5E3E'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return 'R$ ' + context.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toLocaleString('pt-BR');
              }
            }
          }
        }
      }
    });
  }
};
