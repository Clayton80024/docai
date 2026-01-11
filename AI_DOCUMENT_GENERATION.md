# AI Document Generation System

This document describes the AI-powered document generation system for visa applications.

## Overview

The system uses OpenAI's GPT-4o-mini model to automatically generate professional visa application documents based on the applicant's form data and extracted document information.

## Generated Documents

1. **Cover Letter** - Formal introduction letter for the visa application
2. **Personal Statement** - Personal story, goals, and motivation
3. **Program Justification** - Why the applicant chose this specific program
4. **Ties to Home Country** - Comprehensive document demonstrating ties to home country
5. **Sponsor Letter** - Letter from sponsor confirming financial support (if applicable)
6. **Exhibit List** - Organized list of all submitted documents

## Architecture

### 1. Data Aggregation (`src/lib/application-data-aggregator.ts`)

Collects and structures all application data:
- User information from Clerk
- Application form data (address, ties to country, dependents, financial support)
- Extracted document data (passport, I-94, I-20, bank statements, assets, etc.)
- Document list for exhibit list generation

### 2. AI Generation Functions (`src/app/actions/generate-documents.ts`)

Server actions for generating each document type:
- `generateCoverLetter(applicationId)`
- `generatePersonalStatement(applicationId)`
- `generateProgramJustification(applicationId)`
- `generateTiesToCountry(applicationId)`
- `generateSponsorLetter(applicationId)`
- `generateExhibitList(applicationId)`
- `getGeneratedDocuments(applicationId)` - Get all generated documents
- `getGeneratedDocument(applicationId, documentType)` - Get specific document

### 3. Database Schema (`supabase/migrations/004_create_generated_documents.sql`)

The `generated_documents` table stores:
- `id` - UUID primary key
- `application_id` - Foreign key to applications
- `user_id` - User who owns the document
- `document_type` - Type of document (cover_letter, personal_statement, etc.)
- `content` - The generated document text
- `version` - Version number (increments on regeneration)
- `is_current` - Whether this is the current version
- `created_at` / `updated_at` - Timestamps

### 4. UI Component (`src/app/applications/[id]/documents/generate/page.tsx`)

User interface for:
- Viewing all available document types
- Generating new documents
- Regenerating existing documents
- Viewing document content
- Downloading documents as text files

## Usage

### For Users

1. Navigate to an application's documents page
2. Click "Generate Documents" button
3. For each document type:
   - Click "Generate" to create a new document
   - Click "Regenerate" to create a new version
   - Click "View" to see the document content
   - Click "Download" to save as a text file

### For Developers

```typescript
import { generateCoverLetter } from "@/app/actions/generate-documents";

const result = await generateCoverLetter(applicationId);
if (result.success) {
  console.log(result.content); // Generated document text
}
```

## Data Sources

Each document generator uses:

- **User Information**: Name, email from Clerk
- **Application Data**: Country, visa type, current address
- **Form Data**: Ties to country answers, dependents, financial support details
- **Extracted Documents**:
  - Passport: Name, DOB, nationality, passport number
  - I-94: Admission number, class, dates
  - I-20: School, program, SEVIS ID, dates
  - Bank Statements: Account holder, balances, currency
  - Assets: Asset type, value, ownership
  - Ties Documents: Property, employment information

## Requirements

- OpenAI API Key in `.env.local`:
  ```env
  OPENAI_API_KEY=sk-your-key-here
  ```

- Database migration must be run:
  ```sql
  -- Run: supabase/migrations/004_create_generated_documents.sql
  ```

## Features

- ✅ Automatic data aggregation from all sources
- ✅ Version control (each regeneration creates a new version)
- ✅ Document preview in UI
- ✅ Download functionality
- ✅ Error handling and user feedback
- ✅ Loading states during generation
- ✅ Professional, context-aware document generation

## Cost Considerations

- Uses `gpt-4o-mini` model (cost-effective)
- Each document generation: ~$0.001-0.003
- Consider rate limiting for production use

## Future Enhancements

- Document editing in UI
- Export to PDF/Word formats
- Template customization
- Multi-language support
- Document comparison (version diff)

