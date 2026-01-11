# Fix: Invalid Clerk Publishable Key no Netlify

## Erro
```
Error: @clerk/clerk-react: The publishableKey passed to Clerk is invalid.
```

## Causas Comuns

### 1. Chave com Espaços Extras
A chave pode ter espaços no início ou fim quando copiada.

**Solução:**
- No Netlify, edite a variável `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Remova qualquer espaço antes ou depois da chave
- A chave deve começar imediatamente após o `=` sem espaços

### 2. Chave Incompleta
A chave pode ter sido cortada ao copiar.

**Verificação:**
- A chave deve começar com `pk_test_` ou `pk_live_`
- Deve ter aproximadamente 50-60 caracteres
- Não deve ter quebras de linha

### 3. Chave do Ambiente Errado
Usando chave de teste em produção ou vice-versa.

**Solução:**
- Para desenvolvimento/staging: use chave que começa com `pk_test_`
- Para produção: use chave que começa com `pk_live_`

### 4. Caracteres Especiais ou Encoding
Caracteres especiais podem ter sido corrompidos.

**Solução:**
- Copie a chave novamente do dashboard do Clerk
- Cole diretamente no Netlify sem passar por editores de texto intermediários

## Passos para Corrigir

1. **Acesse o Clerk Dashboard:**
   - https://dashboard.clerk.com/last-active?path=api-keys
   - Certifique-se de estar no ambiente correto (Development ou Production)

2. **Copie a Publishable Key:**
   - Clique no ícone de copiar ao lado da chave
   - Não edite ou modifique a chave

3. **No Netlify:**
   - Vá em **Site settings** > **Environment variables**
   - Encontre `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Clique em **Edit**
   - **Delete todo o conteúdo** do campo Value
   - **Cole a chave novamente** (sem espaços extras)
   - Clique em **Save**

4. **Verifique o Formato:**
   - A chave deve ser algo como: `pk_test_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890`
   - Não deve ter aspas (`"` ou `'`)
   - Não deve ter espaços
   - Não deve ter quebras de linha

5. **Redeploy:**
   - Vá em **Deploys**
   - Clique em **Trigger deploy** > **Deploy site**

## Validação da Chave

A chave válida deve:
- ✅ Começar com `pk_test_` ou `pk_live_`
- ✅ Ter entre 50-60 caracteres
- ✅ Não ter espaços
- ✅ Não ter aspas
- ✅ Não ter quebras de linha
- ✅ Ser da mesma instância do Clerk que você está usando

## Exemplo Correto vs Incorreto

### ❌ INCORRETO:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= pk_test_abc123  (espaço antes)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_abc123"  (aspas)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_abc123\n  (quebra de linha)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_abc  (incompleta)
```

### ✅ CORRETO:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

## Se Ainda Não Funcionar

1. **Verifique se a chave está no ambiente correto do Clerk:**
   - Development keys começam com `pk_test_`
   - Production keys começam com `pk_live_`

2. **Gere uma nova chave no Clerk:**
   - Dashboard > API Keys > Regenerate
   - Use a nova chave no Netlify

3. **Verifique se há outras variáveis do Clerk configuradas:**
   - Certifique-se de que `CLERK_SECRET_KEY` também está configurada (se necessário)
   - Ambas devem ser do mesmo ambiente (test ou live)

4. **Limpe o cache do Netlify:**
   - Deploys > Clear cache and retry deploy
