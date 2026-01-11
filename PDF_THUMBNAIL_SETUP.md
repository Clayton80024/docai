# PDF Thumbnail Setup

## Implementação de Thumbnails de PDF

Foi implementada uma API route para gerar thumbnails reais de PDFs no servidor.

### Arquivos Criados/Modificados

1. **`src/app/api/files/thumbnail/route.ts`**
   - API route que gera thumbnails de PDFs
   - Valida acesso do usuário ao arquivo
   - Tenta renderizar no servidor se `canvas` estiver disponível
   - Fallback para client-side se canvas não estiver instalado

2. **`src/components/FileThumbnail.tsx`**
   - Atualizado para usar a API route
   - Mostra preview real do PDF quando disponível
   - Fallback para preview estilizado se thumbnail não carregar

3. **`src/app/files/page.tsx`**
   - Atualizado para passar `documentId` ao FileThumbnail

### Como Funciona

1. **Com Canvas Instalado (Recomendado):**
   - API route renderiza a primeira página do PDF como imagem PNG
   - Thumbnail é gerado no servidor e retornado como imagem
   - Cache de 24 horas para performance

2. **Sem Canvas (Fallback):**
   - API route retorna o fileUrl
   - Cliente pode usar pdf.js para renderizar (implementação futura)
   - Por enquanto, mostra preview estilizado

### Instalação do Canvas (Opcional mas Recomendado)

Para habilitar renderização server-side completa:

```bash
npm install canvas
```

**Nota:** Canvas requer dependências nativas. No macOS:
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
npm install canvas
```

### Uso

O `FileThumbnail` agora aceita um prop opcional `documentId`:

```tsx
<FileThumbnail
  fileUrl={file.file_url}
  mimeType={file.mime_type}
  fileName={file.name}
  documentId={file.id} // Opcional, mas recomendado para validação de acesso
  className="absolute inset-0"
/>
```

### API Endpoint

```
GET /api/files/thumbnail?fileUrl=...&documentId=...
```

**Parâmetros:**
- `fileUrl` (opcional): URL direta do arquivo PDF
- `documentId` (opcional): ID do documento no banco (valida acesso)

**Respostas:**
- `200 OK` com imagem PNG (se canvas disponível)
- `200 OK` com JSON `{ fileUrl, renderOnClient: true }` (fallback)
- `401 Unauthorized` se não autenticado
- `403 Forbidden` se não tem acesso ao documento
- `404 Not Found` se arquivo não encontrado
- `500 Internal Server Error` em caso de erro

### Melhorias Futuras

1. Cache de thumbnails no Supabase Storage
2. Geração assíncrona de thumbnails em background
3. Suporte para múltiplas páginas
4. Client-side rendering com pdf.js como fallback

