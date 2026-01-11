-- Create application_questions table to store dynamic questions
CREATE TABLE IF NOT EXISTS application_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 7),
  theme TEXT NOT NULL, -- Tema Principal
  question_text TEXT NOT NULL, -- Pergunta Focada
  question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'yes_no', 'text_short', 'text_long')),
  options JSONB NOT NULL, -- Array de opções: [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, ...]
  order_index INTEGER NOT NULL, -- Ordem dentro do step (para futuras expansões)
  is_required BOOLEAN DEFAULT true,
  category TEXT, -- Para agrupar perguntas relacionadas
  ai_prompt_context TEXT NOT NULL, -- Contexto específico para a IA entender como usar esta resposta
  help_text TEXT, -- Texto de ajuda para o usuário
  is_active BOOLEAN DEFAULT true, -- Para desativar sem deletar
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create application_question_answers table to store user responses
CREATE TABLE IF NOT EXISTS application_question_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  question_id UUID REFERENCES application_questions(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL, -- "A", "B", ou "C"
  answer_text TEXT NOT NULL, -- Texto completo da opção selecionada
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(application_id, question_id) -- Uma resposta por pergunta por aplicação
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_application_questions_step ON application_questions(step_number, order_index) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_application_questions_category ON application_questions(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_application_question_answers_application ON application_question_answers(application_id);
CREATE INDEX IF NOT EXISTS idx_application_question_answers_question ON application_question_answers(question_id);

-- Add triggers to update updated_at automatically
CREATE TRIGGER update_application_questions_updated_at 
  BEFORE UPDATE ON application_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_application_question_answers_updated_at 
  BEFORE UPDATE ON application_question_answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

