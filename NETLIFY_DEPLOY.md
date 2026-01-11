# Guia de Deploy no Netlify

## Configuração de Variáveis de Ambiente

Para que o build funcione corretamente no Netlify, você precisa configurar as seguintes variáveis de ambiente:

### Variáveis Obrigatórias (NEXT_PUBLIC_*)

Essas variáveis são necessárias durante o build e devem ser configuradas no Netlify:

1. **NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY**
   - Obtida em: https://dashboard.clerk.com/last-active?path=api-keys
   - Formato: `pk_test_...` ou `pk_live_...`

2. **NEXT_PUBLIC_SUPABASE_URL**
   - Obtida no dashboard do Supabase: Settings > API > Project URL
   - Formato: `https://xxxxx.supabase.co`

3. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Obtida no dashboard do Supabase: Settings > API > Project API keys > anon public
   - Formato: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### Variáveis de Servidor (Opcionais para Build, mas necessárias em runtime)

Essas variáveis são usadas apenas em server-side e não são necessárias durante o build, mas devem ser configuradas para o funcionamento completo da aplicação:

- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`

## Como Configurar no Netlify

1. Acesse seu site no Netlify Dashboard
2. Vá em **Site settings** > **Environment variables**
3. Clique em **Add a variable**
4. Adicione cada variável uma por uma:
   - **Key**: Nome da variável (ex: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
   - **Value**: O valor da variável
   - **Scopes**: Deixe como "All scopes" ou selecione "Production" se quiser apenas para produção
5. Clique em **Save**
6. Repita para todas as variáveis obrigatórias

## Após Configurar as Variáveis

1. Vá em **Deploys** no menu do site
2. Clique em **Trigger deploy** > **Deploy site**
3. O build será executado novamente com as variáveis configuradas

## Verificação

Após o deploy, verifique se:
- O build completa com sucesso
- A página inicial carrega corretamente
- O login com Clerk funciona
- A conexão com Supabase está funcionando

## Troubleshooting

### Erro: "Missing publishableKey"
- Verifique se `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` está configurada
- Certifique-se de que o nome está exatamente correto (case-sensitive)

### Erro: "Supabase URL not found"
- Verifique se `NEXT_PUBLIC_SUPABASE_URL` está configurada
- Verifique se `NEXT_PUBLIC_SUPABASE_ANON_KEY` está configurada

### Build falha mas funciona localmente
- Certifique-se de que TODAS as variáveis `NEXT_PUBLIC_*` estão configuradas
- Variáveis sem o prefixo `NEXT_PUBLIC_` não são acessíveis durante o build
