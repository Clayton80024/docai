-- Seed follow-up questions for Step 1
-- These questions appear after the user selects an option in the main question
-- They provide more specific details without being too generic or too specific

-- First, we need to get the ID of the main question for Step 1
-- This will be done by finding the question with step_number = 1 and order_index = 1

-- Follow-up para Opção A (Turístico)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  1,
  'Detalhes da Visita Turística',
  'Qual foi o foco principal da sua experiência turística?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Explorei principalmente cidades históricas e monumentos, interessado em aprender sobre a cultura e história local através de visitas a museus e pontos turísticos tradicionais."},
    {"label": "A2", "text": "Dediquei-me a conhecer diferentes regiões e paisagens naturais, realizando passeios e atividades ao ar livre para vivenciar a diversidade geográfica do país."},
    {"label": "A3", "text": "Foquei em experiências culturais e gastronômicas, participando de eventos locais e conhecendo tradições regionais através de interações com a comunidade."}
  ]'::jsonb,
  2, -- Order 2 (aparece depois da principal)
  'original_intent_touristic',
  'Detalhes específicos mas não muito específicos sobre a experiência turística. Usar para enriquecer a narrativa de "change_of_intent_after_entry". Mencionar tipos de atividades (museus, paisagens, cultura) sem citar nomes específicos de lugares ou cidades. Nível intermediário de especificidade.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL);

-- Follow-up para Opção B (Visitar familiares)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  1,
  'Detalhes da Visita Familiar',
  'Como você aproveitou o tempo durante sua visita?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "Passei a maior parte do tempo com familiares, realizando atividades cotidianas e reencontrando pessoas próximas, aproveitando também para conhecer a região onde eles residem."},
    {"label": "B2", "text": "Combinei momentos em família com exploração da cidade, visitando pontos de interesse próximos e participando de atividades recreativas na região."},
    {"label": "B3", "text": "Aproveitei a estadia para conhecer melhor o estilo de vida local através da convivência familiar, enquanto explorava ocasionalmente atrações e eventos da região."}
  ]'::jsonb,
  2,
  'original_intent_family',
  'Detalhes sobre a experiência familiar. Enfatizar que foi uma visita pessoal/familiar, não acadêmica. Usar para demonstrar que não havia intenção prévia de estudar. Mencionar tipos de atividades sem ser muito específico sobre locais exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL);

-- Follow-up para Opção C (Descanso e lazer)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  1,
  'Detalhes do Descanso e Lazer',
  'Que tipo de atividades recreativas você realizou?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "Dediquei-me a atividades de relaxamento e bem-estar, frequentando parques, praias e espaços naturais para descanso e contemplação."},
    {"label": "C2", "text": "Participei de atividades de entretenimento e lazer, como shows, eventos esportivos e atrações turísticas voltadas para diversão e entretenimento."},
    {"label": "C3", "text": "Optei por uma rotina tranquila de descanso, combinando momentos de relaxamento com passeios casuais pela cidade, sem qualquer agenda ou compromisso específico."}
  ]'::jsonb,
  2,
  'original_intent_leisure',
  'Detalhes sobre atividades recreativas. Enfatizar natureza recreativa e de descanso, sem componente acadêmico ou profissional. Mencionar tipos de atividades (parques, shows, passeios) sem ser muito específico sobre locais exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL);

