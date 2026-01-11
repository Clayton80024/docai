-- Add form_data JSONB column to applications table to store all form responses
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS form_data JSONB;

-- Create index on form_data for better query performance
CREATE INDEX IF NOT EXISTS idx_applications_form_data ON applications USING GIN (form_data);

