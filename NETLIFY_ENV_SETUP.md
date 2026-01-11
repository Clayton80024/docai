# Como Configurar Variáveis de Ambiente no Netlify

## Opção 1: Importar Manualmente (Recomendado)

1. **Abra o arquivo `netlify.env.template`** neste projeto
2. **Preencha os valores** substituindo os placeholders pelos seus valores reais
3. **No Netlify Dashboard:**
   - Vá para seu site
   - Clique em **Site settings** > **Environment variables**
   - Para cada variável:
     - Clique em **Add a variable**
     - Cole o **nome** da variável (ex: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
     - Cole o **valor** da variável
     - Clique em **Save**

## Opção 2: Usar Netlify CLI

Se você tem o Netlify CLI instalado:

```bash
# 1. Preencha o arquivo netlify.env.template com seus valores reais
# 2. Renomeie para .env (temporariamente)
cp netlify.env.template .env

# 3. Importe as variáveis
netlify env:import .env

# 4. Remova o arquivo .env (não commite!)
rm .env
```

## Variáveis Obrigatórias para Build

Estas 3 variáveis **DEVEM** estar configuradas para o build funcionar:

- ✅ `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Variáveis para Funcionalidade Completa

Estas variáveis são necessárias para o funcionamento completo da aplicação:

- `CLERK_SECRET_KEY` - Autenticação completa
- `SUPABASE_SERVICE_ROLE_KEY` - Acesso completo ao banco de dados
- `OPENAI_API_KEY` - Geração de documentos com IA
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Processamento de documentos

## Verificação Rápida

Após configurar as variáveis:

1. Vá em **Deploys** > **Trigger deploy** > **Deploy site**
2. O build deve completar sem erros
3. Se ainda houver erro de "Missing publishableKey", verifique:
   - Nome da variável está exatamente correto (case-sensitive)
   - Valor não tem espaços extras no início/fim
   - Variável está marcada para "All scopes" ou "Production"

## Onde Obter Cada Chave

### Clerk Keys
- Dashboard: https://dashboard.clerk.com/last-active?path=api-keys
- Você precisa de:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pública, começa com `pk_test_` ou `pk_live_`)
  - `CLERK_SECRET_KEY` (secreta, começa com `sk_test_` ou `sk_live_`)

### Supabase Keys
- Dashboard: https://supabase.com/dashboard > Seu Projeto > Settings > API
- Você precisa de:
  - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon public key)
  - `SUPABASE_SERVICE_ROLE_KEY` (service_role key - cuidado, tem acesso total!)

### OpenAI Key
- Dashboard: https://platform.openai.com/api-keys
- Crie uma nova API key se não tiver

### Google Document AI
- Google Cloud Console: https://console.cloud.google.com
- IAM & Admin > Service Accounts > Criar conta de serviço
- Baixar JSON key file
- Converter para uma linha única (remover quebras de linha)

## Dica de Segurança

⚠️ **NUNCA** commite o arquivo `.env` ou `netlify.env.template` com valores reais!

O arquivo `netlify.env.template` contém apenas placeholders e pode ser commitado com segurança.
