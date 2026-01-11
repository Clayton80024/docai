# USCIS Writing Engine

Sistema determinístico e auditável de geração de cover letters USCIS usando templates Markdown canônicos.

## Estrutura

```
uscis-writing-engine/
├── templates/
│   └── uscis/
│       └── i539/
│           └── cover_letter/
│               ├── 00_header_re.md
│               ├── 10_case_background.md
│               ├── 20_legal_basis.md
│               ├── 30_maintenance_of_status.md
│               ├── 40_nonimmigrant_intent.md
│               ├── 50_strong_ties_home_country.md
│               ├── 60_financial_capacity.md
│               ├── 90_conclusion_request_for_approval.md
│               └── 99_signature_block.md
├── engine/
│   ├── assembler.ts       # Monta templates em ordem
│   ├── renderTemplate.ts  # Substitui variáveis {{var}}
│   └── rules.ts           # Validações e regras de negócio
├── pdf/
│   └── generateUSCISPdf.ts # Gera PDF estilo USCIS
└── contracts/
    ├── i539.schema.json   # Schema JSON das variáveis
    ├── types.ts           # Interfaces TypeScript
    └── mapper.ts          # Converte dados agregados para schema
```

## Como Funciona

### 1. Templates Canônicos

Os templates são arquivos Markdown numerados que contêm o texto canônico da cover letter. Cada template usa variáveis no formato `{{variable_name}}` que são substituídas durante a montagem.

**Ordem de Processamento:**
- Templates são carregados em ordem numérica estrita
- Cada template é renderizado com os dados do schema
- Templates são concatenados com quebras de linha duplas

### 2. Schema de Dados

O schema `i539.schema.json` define todas as variáveis necessárias para preencher os templates. O mapper converte `AggregatedApplicationData` (dados agregados da aplicação) para `I539SchemaData` (formato do schema).

**Variáveis Principais:**
- `entry_date`: Data de entrada nos EUA
- `current_status`: Status atual (B-2, B-1, etc.)
- `requested_status`: Status solicitado (F-1)
- `home_country`: País de origem
- `personal_funds_usd`: Fundos pessoais formatados
- `signatory_name`: Nome do signatário

### 3. Engine

**assembler.ts**
- Lê templates do sistema de arquivos
- Processa em ordem numérica
- Chama `renderTemplate` para cada template
- Retorna texto completo concatenado

**renderTemplate.ts**
- Substitui todas as ocorrências de `{{var}}` por valores
- Mantém `{{var}}` se valor não encontrado (não quebra)

**rules.ts**
- Valida dados obrigatórios
- Verifica regras de negócio (datas, status, valores)
- Retorna erros e warnings

### 4. Geração de PDF

**generateUSCISPdf.ts**
- Recebe texto completo da cover letter
- Gera PDF estilo USCIS:
  - Formato: US Letter (8.5" x 11")
  - Fonte: TimesRoman, tamanho 12
  - Margens: 1 inch (72 points)
  - Quebra de página automática
- Retorna `Uint8Array` com bytes do PDF

## Uso

### Gerar Cover Letter

```typescript
import { assemble } from "@/lib/uscis-writing-engine/engine/assembler";
import { mapToI539Schema } from "@/lib/uscis-writing-engine/contracts/mapper";
import { validateI539Data } from "@/lib/uscis-writing-engine/engine/rules";

// 1. Obter dados agregados
const data = await aggregateApplicationData(applicationId);

// 2. Mapear para schema
const schemaData = mapToI539Schema(data);

// 3. Validar
const validation = validateI539Data(schemaData);
if (!validation.valid) {
  throw new Error(validation.errors.join(", "));
}

// 4. Montar cover letter
const coverLetterText = await assemble(schemaData);
```

### Gerar PDF

```typescript
import { generateUSCISPdf } from "@/lib/uscis-writing-engine/pdf/generateUSCISPdf";

const pdfBytes = await generateUSCISPdf(coverLetterText);
```

## Modificando Templates

### Regras Importantes

1. **NÃO modifique conteúdo legal**: Referências INA/CFR devem ser preservadas exatamente
2. **NÃO adicione lógica**: Templates são puro texto com variáveis
3. **Mantenha ordem numérica**: Nomes de arquivo determinam ordem de processamento
4. **Use variáveis consistentes**: Use nomes do schema para variáveis

### Adicionar Nova Variável

1. Adicione ao `i539.schema.json`:
```json
{
  "properties": {
    "nova_variavel": {
      "type": "string",
      "description": "Descrição da variável"
    }
  }
}
```

2. Adicione ao `types.ts`:
```typescript
export interface I539SchemaData {
  nova_variavel: string;
  // ...
}
```

3. Mapeie no `mapper.ts`:
```typescript
return {
  nova_variavel: data.documents.passport?.campo || "",
  // ...
};
```

4. Use no template:
```markdown
Texto com {{nova_variavel}} aqui.
```

## Validações

O sistema valida:
- Campos obrigatórios presentes
- Datas válidas e formatadas
- Status compatível com B-2/B-1
- Valores monetários formatados corretamente
- Referências CFR/INA corretas

## Preservação de Conteúdo

- Templates canônicos **NÃO** são modificados pelo código
- Apenas substituição de variáveis `{{var}}`
- Texto legal preservado exatamente como especificado
- Referências INA/CFR mantidas intactas
- Sistema determinístico e auditável

## Integração

O sistema está integrado em `src/app/actions/generate-documents.ts`:
- `generateCoverLetter()` usa templates
- `generateCoverLetterPdfAction()` gera PDF dos templates

O sistema antigo baseado em AI foi substituído por este sistema determinístico.

