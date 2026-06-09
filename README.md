# 📊 Visão Faturas

Sistema de gerenciamento de faturas para Visão Combustíveis.

## 🚀 Funcionalidades

- ✅ Autenticação de usuários (login/registro)
- 📊 Dashboard com estatísticas (clientes, faturas, pendentes, vencidas)
- 🏢 Gerenciamento de empresas
- 👥 Gerenciamento de clientes
- 📄 Gerenciamento de faturas
- 📤 Upload de faturas via CSV, XLSX ou PDF
- 🔍 Filtros avançados de busca
- ⏰ Atualização automática de status de faturas vencidas
- 📱 Interface responsiva otimizada para 1024x768

## 🛠️ Tecnologias

### Backend
- Node.js
- Express
- PostgreSQL (Supabase)
- JWT para autenticação
- Bcrypt para hash de senhas
- Multer para upload de arquivos
- XLSX para processamento de planilhas

### Frontend
- HTML5
- CSS3 (com variáveis CSS)
- JavaScript Vanilla
- Design responsivo

## 📋 Pré-requisitos

- Node.js (v14 ou superior)
- npm ou yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/visao-faturas.git
cd visao-faturas
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
Crie um arquivo `.env` na raiz do projeto:
```env
PORT=5000
JWT_SECRET=sua_chave_secreta_aqui
DATABASE_URL=postgresql://postgres:senha@db.xxxx.supabase.co:5432/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui
SUPABASE_STORAGE_BUCKET=faturas
```

4. Inicie o servidor:
```bash
npm start
```

5. Acesse o sistema:
```
http://localhost:5000
```

## 📁 Estrutura do Projeto

```
visao-faturas/
├── backend/
│   ├── database.js          # Configuração do banco de dados
│   ├── server.js            # Servidor Express
│   ├── middleware/
│   │   └── auth.js          # Middleware de autenticação
│   └── routes/
│       ├── auth.js          # Rotas de autenticação
│       ├── clientes.js      # Rotas de clientes
│       ├── empresa.js       # Rotas de empresa
│       └── faturas.js       # Rotas de faturas
├── public/
│   ├── images/              # Imagens e logos
│   ├── js/
│   │   ├── modules/         # Módulos JavaScript
│   │   └── api.js           # Cliente API
│   ├── index.html           # Página principal
│   └── style.css            # Estilos
├── database/                # Banco de dados SQLite (não versionado)
├── uploads/                 # Arquivos enviados (não versionado)
├── .env                     # Variáveis de ambiente (não versionado)
├── .gitignore
├── package.json
└── README.md
```

## 📤 Upload de Faturas

O sistema suporta três formatos de arquivo:

### CSV
- Separador: ponto e vírgula (`;`)
- Colunas: CLIENTE, N° FATURA, DATA VECTO, VALOR
- Quando a coluna CLIENTE está vazia, usa o cliente da linha anterior

### XLSX (Excel)
- Mesmas colunas do CSV
- Suporta marcas de validação na coluna C
- Converte datas do formato Excel automaticamente

### PDF
- Upload direto do arquivo
- Armazenado no Supabase Storage para referência futura

## 🎨 Identidade Visual

- Cor primária: Verde #1B5E3E
- Cor secundária: Laranja #FF9800
- Fonte: Inter (Google Fonts)

## 🔐 Segurança

- Senhas criptografadas com bcrypt
- Autenticação via JWT
- Tokens com expiração de 24 horas
- Middleware de autenticação em rotas protegidas

## 📱 Responsividade

O sistema é otimizado para diferentes resoluções:
- Desktop: 1920x1080, 1366x768
- Tablets: 1024x768
- Mobile: 768px e 480px

## 🕐 Timezone

O sistema utiliza o timezone de Brasília (UTC-3) para todas as operações de data.

## 📝 Licença

Este projeto é proprietário da Visão Combustíveis.

## 👥 Autor

Desenvolvido para Visão Combustíveis

---

Para mais informações ou suporte, entre em contato com a equipe de desenvolvimento.
