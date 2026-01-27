# De onde vêm os dados do I-539

O preenchimento do I-539 usa o **agregador de aplicação** (`application-data-aggregator`), que junta:

1. **Documentos enviados + extração** (passport, I-94, I-20, etc.)
2. **Formulário da aplicação** (endereço, etc.)
3. **Perfil do usuário (Clerk)** (nome, e-mail)

---

## 1. Documentos enviados (upload + extração)

Quando o aplicante envia um documento, o sistema **extrai** os dados (via pipeline de extração) e guarda em `extracted_data`. O agregador lê isso e organiza por tipo:

| Campo I-539 | Fonte | Documento | Campo em `extracted_data` (ou similar) |
|-------------|-------|-----------|----------------------------------------|
| Family Name, Given Name, Middle Name | `documents.passport.name` ou `i94.name` ou `i20.studentName` | Passport, I-94, I-20 | `name`, `first_name`+`last_name`, `student_name` |
| Data de nascimento | `passport.dateOfBirth` ou `i20.dateOfBirth` | Passport, I-20 | `dateOfBirth`, `birthDate` |
| País de nascimento | `passport.placeOfBirth` | Passport | `placeOfBirth` |
| Nacionalidade / país de cidadania | `passport.nationality` | Passport | `nationality`, `countryOfCitizenship` |
| Gênero | `passport.gender` | Passport | `gender` |
| Nº do passaporte | `passport.passportNumber` | Passport | `passportNumber`, `document_number` |
| Validade do passaporte | `passport.expiryDate` | Passport | `expiryDate`, `expirationDate` |
| Nº do I-94 / Admission Number | `i94.admissionNumber` | I-94 | `admissionNumber`, `i_94_number` |
| Data da última chegada | `i94.dateOfAdmission` | I-94 | `dateOfAdmission`, `entry_date` |
| Classe de admissão (ex. F-1) | `i94.classOfAdmission` | I-94 | `classOfAdmission`, `current_visa_type` |
| Data em que o status expira | `i94.admitUntilDate` | I-94 | `admitUntilDate`, `i_94_expiry_date` |
| Nome da escola | `i20.schoolName` | I-20 | `schoolName`, `school_name` |
| SEVIS ID | `i20.sevisId` | I-20 | `sevisId`, `sevis_id` |
| Data de início do programa | `i20.startDate` | I-20 | `startDate`, `start_date` |
| Data de término do programa | `i20.endDate` | I-20 | `endDate`, `end_date` |

**Importante:**  
- Só há dado se o documento **foi enviado** e a **extração rodou** (status do documento e `extracted_data` preenchido).  
- O agregador usa o **primeiro** documento de cada tipo (ex.: primeiro passport, primeiro I-94, primeiro I-20).

---

## 2. Formulário da aplicação (`form_data`)

Dados que o aplicante preenche no **formulário da aplicação** (etapas do fluxo de aplicação):

| Campo I-539 | Fonte | Onde o usuário preenche |
|-------------|-------|--------------------------|
| Endereço (Street, City, State, ZIP) | `application.currentAddress` → `formData.currentAddress` | Formulário da aplicação (endereço atual / mailing) |

Se `currentAddress` não for preenchido, Street, City, State e ZIP ficam em branco no I-539.

---

## 3. Perfil do usuário (Clerk)

| Campo I-539 | Fonte | Origem |
|-------------|-------|--------|
| E-mail | `user.email` | Clerk (`user.emailAddresses[0].emailAddress`) |
| Nome (fallback) | `user.fullName` ou `[user.lastName, user.firstName]` | Clerk, quando não há nome em passport / I-94 / I-20 |

---

## 4. Outros

| Campo I-539 | Fonte | Observação |
|-------------|-------|------------|
| País (fallback para nascimento/cidadania) | `application.country` | País da aplicação |
| "In Care Of" | — | Deixado em branco (não há fonte no sistema) |
| A-Number, USCIS Online Account Number | — | Em branco (não extraídos de documentos) |
| Telefone (daytime, mobile) | — | Em branco (não coletados no formulário) |
| Data de assinatura | Data de hoje | Gerada no momento do preenchimento |

---

## Resumo do fluxo

```
Upload (Passport, I-94, I-20, etc.)
    → Extração (pipeline) → extracted_data no banco
    → application-data-aggregator lê documents + extracted_data
    → documents.passport, documents.i94, documents.i20

Formulário da aplicação (endereço, etc.)
    → form_data.currentAddress (e outros)
    → application.currentAddress

Clerk (perfil)
    → user.email, user.firstName, user.lastName, user.fullName

fill-i539 (fillI539FormAction)
    → aggregateApplicationData(applicationId)
    → parseFullName(data), addr, passport, i94, i20, country, user
    → applyAcroFormFill(flat, ctx) ou buildOverlays(ctx)
```

Para o I-539 sair o mais completo possível:

1. Enviar e processar **Passport, I-94 e I-20** (para a extração popular `extracted_data`).
2. Preencher o **endereço** no formulário da aplicação (`currentAddress`).
3. Manter **nome e e-mail** corretos no perfil (Clerk).
