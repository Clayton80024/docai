-- Create generated_documents table for AI-generated application documents
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('cover_letter', 'personal_statement', 'program_justification', 'ties_to_country', 'sponsor_letter', 'exhibit_list')),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_documents_application_id ON generated_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_user_id ON generated_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_type ON generated_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_generated_documents_current ON generated_documents(application_id, document_type, is_current) WHERE is_current = true;

-- Add trigger to update updated_at automatically
CREATE TRIGGER update_generated_documents_updated_at BEFORE UPDATE ON generated_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS (using Clerk for authentication, filtering by user_id in application code)
ALTER TABLE generated_documents DISABLE ROW LEVEL SECURITY;

