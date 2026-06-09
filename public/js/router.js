// Router - Gerencia navegação entre páginas
class Router {
  constructor() {
    this.routes = {
      'dashboard': {
        element: 'dashboard-section',
        navIndex: 0,
        onLoad: () => Dashboard.load()
      },
      'empresa-cadastrar': {
        element: 'empresa-cadastrar-section',
        navIndex: 1,
        onLoad: () => Empresa.loadCadastrar()
      },
      'empresa-editar': {
        element: 'empresa-cadastrar-section',
        navIndex: 1,
        onLoad: () => Empresa.loadEditar()
      },
      'empresa-listar': {
        element: 'empresa-listar-section',
        navIndex: 1,
        onLoad: () => Empresa.loadListar()
      },
      'clientes-cadastrar': {
        element: 'clientes-cadastrar-section',
        navIndex: 2,
        onLoad: () => Clientes.loadCadastrar()
      },
      'clientes-listar': {
        element: 'clientes-listar-section',
        navIndex: 2,
        onLoad: () => Clientes.loadListar()
      },
      'faturas-cadastrar': {
        element: 'faturas-cadastrar-section',
        navIndex: 3,
        onLoad: () => Faturas.loadCadastrar()
      },
      'faturas-listar': {
        element: 'faturas-listar-section',
        navIndex: 3,
        onLoad: () => Faturas.loadListar()
      },
      'faturas-upload': {
        element: 'faturas-upload-section',
        navIndex: 3,
        onLoad: () => Faturas.loadUpload()
      },
      'haver-listar': {
        element: 'haver-section',
        navIndex: 3,
        onLoad: () => Faturas.loadHaver()
      },
      'relatorios': {
        element: 'relatorios-section',
        navIndex: 4,
        onLoad: () => Relatorios.load()
      },
      'usuarios': {
        element: 'usuarios-section',
        navIndex: 5,
        onLoad: () => Usuarios.load()
      }
    };
    this.currentRoute = null;
  }

  navigate(routeName) {
    console.log(`[Router] Navegando para: ${routeName}`);
    
    // Extrair rota base e parâmetros (ex: empresa-editar/5 -> empresa-editar)
    let routeBase = routeName;
    let routeParams = null;
    
    if (routeName.includes('/')) {
      const parts = routeName.split('/');
      routeBase = parts[0];
      routeParams = parts.slice(1);
    }
    
    const route = this.routes[routeBase];
    if (!route) {
      console.error(`[Router] Rota não encontrada: ${routeName}`);
      Utils.showNotification(`Página não encontrada: ${routeName}`, 'error');
      return;
    }

    // Verificar se é rota de usuários e se o usuário é admin
    if (routeBase === 'usuarios') {
      const isAdmin = localStorage.getItem('is_admin');
      if (isAdmin !== '1' && isAdmin !== 1) {
        console.warn('[Router] Acesso negado à página de usuários');
        Utils.showNotification('Acesso negado. Apenas administradores.', 'error');
        this.navigate('dashboard');
        return;
      }
    }

    // Salvar última rota no localStorage
    localStorage.setItem('lastRoute', routeName);
    
    // Atualizar URL com hash
    window.location.hash = routeName;

    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('fade-in');
    });
    
    // Remover active de todos os links
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.remove('active');
    });
    
    // Mostrar seção atual
    const element = document.getElementById(route.element);
    if (element) {
      console.log(`[Router] Mostrando seção: ${route.element}`);
      element.classList.remove('hidden');
      element.classList.add('fade-in');
    } else {
      console.error(`[Router] Elemento não encontrado: ${route.element}`);
      Utils.showNotification('Erro ao carregar página', 'error');
      return;
    }
    
    // Ativar link do menu
    const navLinks = document.querySelectorAll('.nav-links a');
    if (navLinks[route.navIndex]) {
      navLinks[route.navIndex].classList.add('active');
    }
    
    // Executar callback de carregamento
    if (route.onLoad) {
      try {
        route.onLoad(routeParams);
      } catch (error) {
        console.error(`[Router] Erro no onLoad:`, error);
        Utils.showNotification('Erro ao carregar conteúdo da página', 'error');
      }
    }
    
    this.currentRoute = routeName;
  }

  init() {
    console.log('Router.init() chamado');
    
    // Verificar se há hash na URL
    let hash = window.location.hash.substring(1); // Remove o #
    
    // Se não houver hash, tentar restaurar última rota do localStorage
    if (!hash) {
      const lastRoute = localStorage.getItem('lastRoute');
      if (lastRoute) {
        hash = lastRoute;
        console.log(`[Router] Restaurando última rota do localStorage: ${hash}`);
        // Definir o hash na URL para que fique visível
        window.location.hash = hash;
      }
    }
    
    if (hash) {
      // Extrair rota base para verificação
      const routeBase = hash.includes('/') ? hash.split('/')[0] : hash;
      
      if (this.routes[routeBase]) {
        console.log(`[Router] Restaurando rota: ${hash}`);
        this.navigate(hash);
      } else {
        console.log('[Router] Hash inválido, navegando para dashboard');
        this.navigate('dashboard');
      }
    } else {
      console.log('[Router] Nenhuma rota salva, navegando para dashboard');
      this.navigate('dashboard');
    }

    // Listener para mudanças no hash
    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.substring(1);
      if (newHash && newHash !== this.currentRoute) {
        const newRouteBase = newHash.includes('/') ? newHash.split('/')[0] : newHash;
        if (this.routes[newRouteBase]) {
          console.log(`[Router] Hash mudou para: ${newHash}`);
          this.navigate(newHash);
        }
      }
    });
  }
}

const router = new Router();
