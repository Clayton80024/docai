# I-539 – Formulário

## Preenchimento automático (Opção C)

Para o **Baixar I-539 Preenchido** funcionar de forma automática, coloque aqui um I-539 em **AcroForm**:

- **Arquivo:** `i-539-acroform.pdf`
- **Caminho:** `public/i-539/i-539-acroform.pdf`

### Como obter o AcroForm

O I-539 oficial da USCIS (uscis.gov/i-539) é **XFA**, que este sistema não consegue preencher. É preciso converter para **AcroForm** uma vez:

1. **Adobe Acrobat Pro**  
   Abra o I-539, salve como “PDF otimizado” ou use a opção que gera AcroForm em vez de XFA. Salve como `i-539-acroform.pdf`.

2. **pdfRest (API)**  
   Use a ferramenta [XFA to Acroforms](https://pdfrest.com/apitools/xfa-to-acroforms/) (plano Pro). Baixe o resultado e salve como `i-539-acroform.pdf`.

3. **Foxit PDF Editor**  
   Abra o I-539 e use a opção de conversão/exportação para AcroForm. Salve como `i-539-acroform.pdf`.

### Se `i-539-acroform.pdf` não existir

O sistema usa, na ordem:

1. `i-539-acroform.pdf` (se existir) → **preenchimento automático**  
2. **AcroForm remoto** — URL (ex.: Supabase, I-539 convertido por pdfRest). Override: `I539_ACROFORM_URL`.
3. **pdfRest API** — se `PDFREST_API_KEY`: converte XFA→AcroForm em tempo real.
4. `i-539.pdf` → overlay ou em branco (XFA)
5. PDF da USCIS → overlay ou em branco  

Sem o AcroForm, o botão “Baixar I-539” pode devolver o formulário em branco. Nesse caso, use o **Guia de preenchimento** para preencher à mão em [uscis.gov/i-539](https://www.uscis.gov/i-539).

### De onde vêm os dados

Os dados vêm da **documentação extraída** (Passport, I-94, I-20 no upload), do **formulário da aplicação** (endereço) e do **perfil (Clerk)** (e-mail, nome). Detalhes: [FONTES-DADOS-I539.md](./FONTES-DADOS-I539.md).

---

- `i-539.pdf`: cópia local do I-539 (opcional; pode ser o original XFA).
- `i-539-acroform.pdf`: opcional se usar `PDFREST_API_KEY`.
