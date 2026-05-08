// Utility Functions
const Utils = {
  // Notificações
  showNotification(message, type = 'success', options = {}) {
    const {
      duration = 3000,
      maxWidth = '400px'
    } = options;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--warning)'};
      color: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
      font-weight: 500;
      line-height: 1.4;
      max-width: ${maxWidth};
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  },

  // Formatação
  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  },

  formatDate(dateString) {
    if (!dateString) return '-';
    // Adicionar 'T00:00:00' para evitar problemas de timezone
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  },

  formatCPFCNPJ(value) {
    if (!value) return '-';
    
    // Se começar com espaço, é CPF temporário - mostrar como vazio
    if (value.trim() === '' || value.startsWith(' ')) {
      return '-';
    }
    
    value = value.replace(/\D/g, '');
    
    // Se não tiver dígitos suficientes, retornar como está
    if (value.length < 11) {
      return value || '-';
    }
    
    if (value.length <= 11) {
      return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
  },

  formatPhone(value) {
    if (!value) return '-';
    
    value = value.replace(/\D/g, '');
    
    // Se não tiver dígitos suficientes, retornar como está
    if (value.length < 10) {
      return value || '-';
    }
    
    if (value.length <= 10) {
      return value.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    } else {
      return value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
  },

  // Validações
  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  validateCPFCNPJ(value) {
    value = value.replace(/\D/g, '');
    return value.length === 11 || value.length === 14;
  },

  // Loading
  showLoading(element) {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.id = 'loading-spinner';
    element.appendChild(spinner);
  },

  hideLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.remove();
  },

  // Confirmação
  confirm(message) {
    return window.confirm(message);
  },

  // Download
  downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Debounce
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};


// Modal Functions
function openClientesModal() {
  const modal = document.getElementById('clientes-modal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeClientesModal() {
  const modal = document.getElementById('clientes-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

function openFaturasModal() {
  const modal = document.getElementById('faturas-modal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeFaturasModal() {
  const modal = document.getElementById('faturas-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Fechar menu móvel (referenciado no HTML)
function closeMenu() {
  const navLinks = document.getElementById('nav-links');
  const overlay = document.getElementById('nav-overlay');
  if (navLinks) navLinks.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

function openEmpresaModal() {
  const modal = document.getElementById('empresa-modal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function closeEmpresaModal() {
  const modal = document.getElementById('empresa-modal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
  }
}

// Fechar modal ao clicar fora
window.addEventListener('click', (event) => {
  const empresaModal = document.getElementById('empresa-modal');
  const clientesModal = document.getElementById('clientes-modal');
  const faturasModal = document.getElementById('faturas-modal');
  const perfilModal = document.getElementById('perfil-modal');
  const anexosModal = document.getElementById('anexos-fatura-modal');
  
  if (event.target === empresaModal) {
    closeEmpresaModal();
  }
  if (event.target === clientesModal) {
    closeClientesModal();
  }
  if (event.target === faturasModal) {
    closeFaturasModal();
  }
  if (event.target === perfilModal) {
    closePerfilModal();
  }
  if (event.target === anexosModal) {
    Faturas?.closeAnexos?.();
  }
});

// Fechar modal com ESC
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeEmpresaModal();
    closeClientesModal();
    closeFaturasModal();
    closePerfilModal();
    Faturas?.closeAnexos?.();
  }
});
