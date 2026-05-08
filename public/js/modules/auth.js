// Auth Module
const Auth = {
  showTrialExpiredModal() {
    Utils.showNotification(
      'O período de teste expirou. Entre em contato com o administrador para realizar o pagamento.',
      'warning',
      { duration: 10000, maxWidth: '520px' }
    );
  },

  showTrialExpiredBlockingModal() {
    const modal = document.getElementById('trial-expired-modal');
    if (!modal) return;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  async login(event) {
    event.preventDefault();
    
    const usuario = document.getElementById('login-usuario').value;
    const senha = document.getElementById('login-senha').value;

    try {
      const data = await api.login(usuario, senha);
      api.setToken(data.token);
      
      // Salvar informação de admin
      localStorage.setItem('is_admin', String(data.usuario.is_admin || 0));
      localStorage.setItem('usuario_nome', data.usuario.nome);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      localStorage.setItem('usuario_id', data.usuario.id);
      localStorage.setItem('usuario_login', data.usuario.usuario);
      localStorage.setItem('usuario_email', data.usuario.email || '');
      
      this.showMainPage();
    } catch (error) {
      Utils.showNotification(error.message, 'error');
    }
  },

  async registro(event) {
    event.preventDefault();
    
    const nome = document.getElementById('reg-nome').value;
    const usuario = document.getElementById('reg-usuario').value;
    const email = document.getElementById('reg-email').value;
    const senha = document.getElementById('reg-senha').value;

    try {
      await api.registro(nome, usuario, email, senha);
      Utils.showNotification('Conta criada com sucesso! Faça login.');
      this.showLogin();
    } catch (error) {
      Utils.showNotification(error.message, 'error');
    }
  },

  showLogin() {
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('registro-page').classList.add('hidden');
  },

  showRegistro() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('registro-page').classList.remove('hidden');
  },

  showMainPage() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('registro-page').classList.add('hidden');
    document.getElementById('main-page').classList.remove('hidden');
    
    this.updateUserDisplay();
    
    router.init();
    this.showTrialExpiredBlockingModal();
  },

  updateUserDisplay() {
    let usuarioData = {};
    try {
      usuarioData = JSON.parse(localStorage.getItem('usuario')) || {};
    } catch (e) {
      usuarioData = {};
    }

    const primeiroNome = usuarioData.nome ? usuarioData.nome.split(' ')[0] : 'Usuário';
    
    const usuarioLogadoEl = document.getElementById('usuario-logado');
    if (usuarioLogadoEl) {
      usuarioLogadoEl.textContent = `👤 ${primeiroNome}`;
    }
    
    const usuarioLogadoMobileEl = document.getElementById('usuario-logado-mobile');
    if (usuarioLogadoMobileEl) {
      usuarioLogadoMobileEl.textContent = `👤 ${primeiroNome}`;
      usuarioLogadoMobileEl.classList.remove('hidden');
    }
    
    const navUsuarios = document.getElementById('nav-usuarios');
    if (navUsuarios) {
      if (String(usuarioData.is_admin) === '1') {
        navUsuarios.classList.remove('hidden');
      } else {
        navUsuarios.classList.add('hidden');
      }
    }
  },

  logout() {
    if (!Utils.confirm('Deseja realmente sair?')) return;
    
    api.clearToken();
    location.reload();
  },

  checkAuth() {
    // Reidratar dados mínimos do usuário a partir do token caso falte no storage
    if (api.token && !localStorage.getItem('usuario')) {
      try {
        const payload = JSON.parse(atob(api.token.split('.')[1]));
        localStorage.setItem('usuario', JSON.stringify({
          id: payload.id,
          usuario: payload.usuario,
          nome: localStorage.getItem('usuario_nome') || payload.usuario,
          email: localStorage.getItem('usuario_email') || null,
          is_admin: payload.is_admin || 0
        }));
        localStorage.setItem('is_admin', String(payload.is_admin || 0));
      } catch (e) {
        console.warn('Não foi possível decodificar token JWT', e);
      }
    }

    // Se tiver token, tentar validar fazendo uma requisição
    if (api.token) {
      // Tentar carregar dados para validar o token
      api.getClientes()
        .then(() => {
          this.showMainPage();
        })
        .catch(() => {
          // Token inválido, limpar e mostrar login
          api.clearToken();
          this.showLogin();
        });
    } else {
      this.showLogin();
    }
  }
};

// Event Listeners
document.getElementById('login-form')?.addEventListener('submit', (e) => Auth.login(e));
document.getElementById('registro-form')?.addEventListener('submit', (e) => Auth.registro(e));

  // Check auth on load
  Auth.checkAuth();

// --------- Perfil (modal de edição) ---------
function getUsuarioStorage() {
  try {
    return JSON.parse(localStorage.getItem('usuario')) || {};
  } catch (e) {
    return {};
  }
}

window.openPerfilModal = function() {
  const usuarioData = getUsuarioStorage();
  
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

  const isAdmin = String(usuarioData.is_admin) === '1';
  const camposBloqueados = ['perfil-nome', 'perfil-usuario', 'perfil-email'];
  camposBloqueados.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !isAdmin;
      el.classList.toggle('input-disabled', !isAdmin);
      el.title = !isAdmin ? 'Apenas administradores podem alterar estes dados' : '';
    }
  });

  const restricaoEl = document.getElementById('perfil-restricao');
  if (restricaoEl) {
    restricaoEl.textContent = isAdmin
      ? ''
      : 'Somente administradores podem alterar nome, usuário e e-mail. Você pode alterar apenas a sua senha.';
  }

  const modal = document.getElementById('perfil-modal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
};

window.closePerfilModal = function() {
  const modal = document.getElementById('perfil-modal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
  document.getElementById('form-perfil').reset();
};

window.submitPerfil = async function(event) {
  event.preventDefault();

  const usuarioData = getUsuarioStorage();
  if (!usuarioData || !usuarioData.id) {
    Utils.showNotification('Erro ao identificar usuário', 'error');
    return;
  }

  const isAdmin = String(usuarioData.is_admin) === '1';

  const nome = document.getElementById('perfil-nome').value;
  const usuario = document.getElementById('perfil-usuario').value;
  const email = document.getElementById('perfil-email').value;
  const senhaAtual = document.getElementById('perfil-senha-atual').value;
  const senhaNova = document.getElementById('perfil-senha-nova').value;
  const senhaConfirmar = document.getElementById('perfil-senha-confirmar').value;

  // Validação de senha quando há tentativa de troca
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

  // Usuário não admin: só pode alterar a própria senha
  if (!isAdmin) {
    if (!senhaAtual || !senhaNova) {
      Utils.showNotification('Você só pode alterar a sua senha.', 'error');
      return;
    }

    try {
      await api.updateUsuario(usuarioData.id, {
        senhaAtual,
        senhaNova
      });
      Utils.showNotification('Senha atualizada com sucesso!', 'success');
      closePerfilModal();
    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      Utils.showNotification(error.message || 'Erro ao atualizar senha', 'error');
    }
    return;
  }

  // Admin: pode alterar dados básicos e senha (opcional)
  if (!nome || !usuario) {
    Utils.showNotification('Nome e usuário são obrigatórios', 'error');
    return;
  }

  const payload = {
    nome,
    usuario,
    email: email || null
  };

  if (senhaAtual && senhaNova) {
    payload.senhaAtual = senhaAtual; // usado apenas para validação opcional
    payload.senhaNova = senhaNova;
  } else if (senhaNova) {
    payload.senhaNova = senhaNova;
  }

  try {
    await api.updateUsuario(usuarioData.id, payload);

    // Atualizar storage local
    const novoUsuario = { ...usuarioData, nome, usuario, email };
    localStorage.setItem('usuario', JSON.stringify(novoUsuario));
    localStorage.setItem('usuario_nome', nome);
    localStorage.setItem('usuario_login', usuario);
    localStorage.setItem('usuario_email', email || '');

    Auth.updateUserDisplay();
    Utils.showNotification('Perfil atualizado com sucesso!', 'success');
    closePerfilModal();
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    Utils.showNotification(error.message || 'Erro ao atualizar perfil', 'error');
  }
};
