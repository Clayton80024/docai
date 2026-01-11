-- Add case_id column to applications table
ALTER TABLE applications 
ADD COLUMN IF NOT EXISTS case_id TEXT UNIQUE;

-- Create index for case_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_applications_case_id ON applications(case_id);

