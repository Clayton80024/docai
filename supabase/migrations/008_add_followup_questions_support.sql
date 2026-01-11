-- Add support for follow-up questions (sub-groups)
-- This allows questions to appear conditionally based on previous answers

ALTER TABLE application_questions 
ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES application_questions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS trigger_option TEXT; -- Opção que dispara esta pergunta (ex: "A", "B", "C")

-- Index for faster follow-up question lookups
CREATE INDEX IF NOT EXISTS idx_application_questions_parent 
ON application_questions(parent_question_id, trigger_option) 
WHERE parent_question_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN application_questions.parent_question_id IS 'ID da pergunta pai. Se NULL, é uma pergunta principal. Se preenchido, é uma pergunta de follow-up.';
COMMENT ON COLUMN application_questions.trigger_option IS 'Opção da pergunta pai que dispara esta pergunta de follow-up (ex: "A", "B", "C").';

