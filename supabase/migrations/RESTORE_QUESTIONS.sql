-- ============================================
-- RESTAURAR TODAS AS PERGUNTAS DO BANCO DE DADOS
-- Execute este arquivo se você deletou as perguntas por acidente
-- ============================================

-- Primeiro, certifique-se de que as tabelas existem
-- Se não existirem, execute primeiro: 006_create_application_questions.sql e 008_add_followup_questions_support.sql

-- Limpar perguntas existentes (opcional - descomente se quiser limpar antes de inserir)
-- DELETE FROM application_question_answers;
-- DELETE FROM application_questions;

-- ============================================
-- PERGUNTAS PRINCIPAIS (7 STEPS)
-- ============================================

-- PASSO 1: Motivo Original da Visita
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index, 
  category, ai_prompt_context, is_required
) VALUES (
  1,
  'Motivo Original da Visita',
  'Qual era o seu objetivo principal e genuíno ao entrar no país inicialmente?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Meu objetivo era exclusivamente turístico, focado em conhecer os pontos históricos e a cultura local durante o período de férias."},
    {"label": "B", "text": "Vim para visitar familiares e amigos, aproveitando o tempo livre para explorar a região sem qualquer plano acadêmico."},
    {"label": "C", "text": "A intenção era realizar uma viagem de descanso e lazer, com roteiro totalmente voltado para atividades recreativas e turísticas."}
  ]'::jsonb,
  1,
  'original_intent',
  'CRÍTICO: Esta resposta demonstra que NÃO havia intenção prévia de estudar. Usar na seção "change_of_intent_after_entry" da cover letter. Enfatizar que o objetivo original era puramente turístico/recreativo, sem qualquer componente acadêmico. NUNCA sugerir que havia planejamento prévio de estudos.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 2: Evolução Natural da Decisão
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  2,
  'Evolução Natural da Decisão',
  'Em que momento a ideia de estudar começou a se formar de maneira orgânica?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Durante as interações culturais, percebi que o ambiente educacional local oferecia oportunidades que eu não havia considerado antes."},
    {"label": "B", "text": "A vivência no dia a dia me fez notar lacunas no meu conhecimento que poderiam ser preenchidas com a excelência do ensino deste país."},
    {"label": "C", "text": "Ao conversar com profissionais e residentes, entendi que uma especialização aqui elevaria significativamente meu patamar profissional."}
  ]'::jsonb,
  1,
  'decision_evolution',
  'Demonstrar que a decisão foi ORGÂNICA e NATURAL, surgindo DURANTE a estadia. Usar no Personal Statement para narrativa pessoal. Enfatizar que foi uma descoberta, não um plano prévio. Conectar com a experiência de estar no país.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 3: Surgimento do Interesse Acadêmico
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  3,
  'Surgimento do Interesse Acadêmico',
  'Por que o interesse em estudar surgiu especificamente durante esta estadia?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Fiquei impressionado com a infraestrutura das instituições que conheci casualmente, o que despertou minha curiosidade acadêmica."},
    {"label": "B", "text": "Identifiquei uma demanda específica no mercado de trabalho do meu país que este sistema de ensino atende de forma única."},
    {"label": "C", "text": "A imersão linguística e cultural me motivou a querer aprofundar meus conhecimentos de forma estruturada e acadêmica."}
  ]'::jsonb,
  1,
  'academic_interest',
  'Explicar o GATILHO específico que despertou o interesse. Usar na cover letter para demonstrar que foi uma descoberta durante a estadia. Conectar com aspectos objetivos (infraestrutura, qualidade do ensino, demanda de mercado). Evitar linguagem emocional.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 4: Escolha da Instituição e do Curso
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  4,
  'Escolha da Instituição e do Curso',
  'Como você selecionou a instituição e o curso após decidir que queria estudar?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Realizei uma pesquisa detalhada sobre o ranking e a reputação das faculdades locais, optando pela que melhor se alinha aos meus objetivos."},
    {"label": "B", "text": "Busquei uma instituição que oferecesse um currículo inovador e prático, complementando perfeitamente minha base teórica."},
    {"label": "C", "text": "Escolhi o curso baseado na excelência do corpo docente e nas parcerias que a instituição possui com o setor profissional."}
  ]'::jsonb,
  1,
  'institution_selection',
  'Demonstrar que a escolha foi criteriosa e baseada em fatores objetivos. Usar na seção "purpose_of_study" da cover letter. Mencionar nome da instituição e programa específico. Enfatizar alinhamento com objetivos acadêmicos e profissionais.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 5: Coerência com a Trajetória Profissional
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  5,
  'Coerência com a Trajetória Profissional',
  'De que maneira este curso se conecta com sua formação e experiência anterior?',
  'multiple_choice',
  '[
    {"label": "A", "text": "O curso é uma progressão lógica da minha graduação, permitindo uma especialização técnica necessária para minha carreira."},
    {"label": "B", "text": "Esta formação preenche uma necessidade de atualização tecnológica que é fundamental para as funções que desempenho."},
    {"label": "C", "text": "A grade curricular expande minhas competências atuais, permitindo que eu assuma cargos de maior responsabilidade no futuro."}
  ]'::jsonb,
  1,
  'professional_coherence',
  'CRÍTICO: Demonstrar relevância e propósito específico. Usar na seção "purpose_of_study" e "academic_development" da cover letter. Conectar com formação prévia e objetivos profissionais. Mostrar que não é um curso aleatório, mas uma escolha estratégica.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 6: Planejamento e Organização
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  6,
  'Planejamento e Organização',
  'Como você organizou o planejamento para esta nova etapa acadêmica?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Estruturei um cronograma de estudos e verifiquei todos os pré-requisitos necessários para garantir uma transição suave e organizada."},
    {"label": "B", "text": "Analisei cuidadosamente o impacto desta decisão na minha carreira a longo prazo, garantindo que cada passo fosse estratégico."},
    {"label": "C", "text": "Estabeleci metas claras de aprendizado e selecionei as disciplinas que trarão o maior retorno para minha trajetória profissional."}
  ]'::jsonb,
  1,
  'planning',
  'Demonstrar seriedade e preparação. Usar no Personal Statement para mostrar maturidade e planejamento. Pode ser mencionado brevemente na cover letter como evidência de compromisso acadêmico.',
  true
) ON CONFLICT DO NOTHING;

-- PASSO 7: Meios Financeiros e Suporte
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required
) VALUES (
  7,
  'Meios Financeiros e Suporte',
  'Como você assegurou que possui os recursos necessários para este investimento?',
  'multiple_choice',
  '[
    {"label": "A", "text": "Possuo reservas financeiras sólidas e planejadas, destinadas ao meu desenvolvimento pessoal e profissional sem comprometer minha estabilidade."},
    {"label": "B", "text": "Conto com suporte financeiro comprovado e recursos próprios que cobrem integralmente as mensalidades e o custo de vida."},
    {"label": "C", "text": "Demonstro capacidade financeira através de economias acumuladas, garantindo foco total nos estudos durante todo o período do curso."}
  ]'::jsonb,
  1,
  'financial_support',
  'CRÍTICO: Usar na seção "financial_ability_and_compliance" da cover letter. SEMPRE mencionar TUITION + LIVING EXPENSES. Se houver patrocinador, mencionar nome e o que cobre. Demonstrar que recursos ≥ total necessário. Referenciar documentos financeiros (Exhibit D).',
  true
) ON CONFLICT DO NOTHING;

-- ============================================
-- PERGUNTAS DE FOLLOW-UP - STEP 1
-- ============================================

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
  2,
  'original_intent_touristic',
  'Detalhes específicos mas não muito específicos sobre a experiência turística. Usar para enriquecer a narrativa de "change_of_intent_after_entry". Mencionar tipos de atividades (museus, paisagens, cultura) sem citar nomes específicos de lugares ou cidades. Nível intermediário de especificidade.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

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
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

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
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 1 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- ============================================
-- PERGUNTAS DE FOLLOW-UP - STEPS 2-7
-- ============================================

-- STEP 2: Follow-up para Opção A (Interações culturais)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  2,
  'Detalhes das Interações Culturais',
  'Que tipo de interações culturais despertaram seu interesse acadêmico?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Participei de eventos culturais e educacionais locais, onde tive contato com profissionais e estudantes que compartilharam suas experiências acadêmicas e profissionais."},
    {"label": "A2", "text": "Visitei instituições de ensino e centros culturais, observando a qualidade da infraestrutura educacional e os métodos de ensino utilizados."},
    {"label": "A3", "text": "Conversei com residentes e profissionais locais sobre oportunidades de desenvolvimento acadêmico, descobrindo programas que se alinhavam com meus interesses."}
  ]'::jsonb,
  2,
  'decision_evolution_cultural',
  'Detalhes sobre interações culturais que levaram ao interesse acadêmico. Enfatizar que foi uma descoberta durante a estadia, não um plano prévio. Mencionar tipos de interações (eventos, visitas, conversas) sem ser muito específico sobre locais exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 2: Follow-up para Opção B (Vivência no dia a dia)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  2,
  'Detalhes da Vivência Diária',
  'Que aspectos da sua vivência diária revelaram lacunas no seu conhecimento?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "Ao realizar atividades cotidianas e observar o funcionamento de diferentes setores, identifiquei áreas onde meu conhecimento poderia ser expandido para melhor compreensão do mercado local."},
    {"label": "B2", "text": "Através da observação de práticas profissionais e conversas informais, percebi que havia competências técnicas e metodologias que eu não havia encontrado anteriormente."},
    {"label": "B3", "text": "A experiência prática de estar imerso no ambiente local me mostrou a importância de atualizar e aprofundar meus conhecimentos em áreas específicas do meu campo de interesse."}
  ]'::jsonb,
  2,
  'decision_evolution_daily',
  'Detalhes sobre como a vivência diária revelou necessidade de conhecimento. Enfatizar descoberta orgânica durante a estadia. Mencionar tipos de observações e experiências sem ser muito específico.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 2: Follow-up para Opção C (Conversas com profissionais)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  2,
  'Detalhes das Conversas Profissionais',
  'Que tipo de conversas com profissionais despertaram seu interesse em especialização?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "Profissionais da minha área compartilharam informações sobre programas de especialização e certificações que são altamente valorizados no mercado de trabalho local e internacional."},
    {"label": "C2", "text": "Residentes e colegas profissionais discutiram como a educação local oferece oportunidades únicas de desenvolvimento que não estavam disponíveis no meu país de origem."},
    {"label": "C3", "text": "Através de networking e conversas informais, aprendi sobre programas acadêmicos que poderiam elevar significativamente minhas competências profissionais e abrir novas oportunidades de carreira."}
  ]'::jsonb,
  2,
  'decision_evolution_professional',
  'Detalhes sobre conversas profissionais que levaram ao interesse. Enfatizar que foi uma descoberta através de networking, não um plano prévio. Mencionar tipos de conversas e insights sem ser muito específico sobre pessoas ou empresas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 2 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 3: Follow-up para Opção A (Infraestrutura das instituições)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  3,
  'Detalhes sobre Infraestrutura',
  'Que aspectos da infraestrutura educacional mais impressionaram você?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Fiquei impressionado com os recursos tecnológicos e laboratórios disponíveis, que oferecem oportunidades práticas de aprendizado que eu não havia visto anteriormente."},
    {"label": "A2", "text": "A qualidade das bibliotecas e centros de pesquisa, com acesso a materiais e recursos acadêmicos de última geração, despertou minha curiosidade sobre o sistema educacional."},
    {"label": "A3", "text": "A estrutura física e os espaços de aprendizado colaborativo mostraram um ambiente acadêmico que valoriza a inovação e o desenvolvimento prático de competências."}
  ]'::jsonb,
  2,
  'academic_interest_infrastructure',
  'Detalhes sobre infraestrutura que despertou interesse. Enfatizar descoberta casual durante visitas. Mencionar tipos de recursos (tecnologia, bibliotecas, espaços) sem ser muito específico sobre instituições exatas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 3: Follow-up para Opção B (Demanda do mercado de trabalho)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  3,
  'Detalhes sobre Demanda de Mercado',
  'Como você identificou a demanda específica no mercado de trabalho?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "Através de observação do mercado local e conversas com profissionais, identifiquei que há uma demanda crescente por competências específicas que este sistema de ensino desenvolve de forma única."},
    {"label": "B2", "text": "Analisei as oportunidades de carreira disponíveis e percebi que programas de especialização locais preparam profissionais para funções que são altamente valorizadas tanto localmente quanto internacionalmente."},
    {"label": "B3", "text": "Descobri que o currículo educacional local está alinhado com as necessidades atuais do mercado, oferecendo formação que preenche lacunas específicas que identifiquei no meu campo profissional."}
  ]'::jsonb,
  2,
  'academic_interest_market',
  'Detalhes sobre como identificou demanda de mercado. Enfatizar descoberta através de observação e análise, não planejamento prévio. Mencionar tipos de análises sem ser muito específico sobre empresas ou posições.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 3: Follow-up para Opção C (Imersão linguística e cultural)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  3,
  'Detalhes sobre Imersão',
  'Como a imersão linguística e cultural motivou seu interesse acadêmico?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "A experiência de comunicação diária e interação com nativos me mostrou a importância de aprofundar meus conhecimentos de forma estruturada para melhor compreensão do contexto profissional local."},
    {"label": "C2", "text": "Ao me adaptar ao ambiente cultural, percebi que havia nuances e conhecimentos específicos que só poderiam ser adquiridos através de uma formação acadêmica formal no contexto local."},
    {"label": "C3", "text": "A imersão me permitiu entender como o sistema educacional local integra aspectos culturais e linguísticos de forma única, oferecendo uma perspectiva que enriqueceria significativamente minha formação."}
  ]'::jsonb,
  2,
  'academic_interest_immersion',
  'Detalhes sobre como imersão linguística/cultural motivou interesse. Enfatizar descoberta através da experiência, não planejamento. Mencionar tipos de experiências de imersão sem ser muito específico.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 3 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 4: Follow-up para Opção A (Pesquisa sobre ranking e reputação)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  4,
  'Detalhes da Pesquisa',
  'Que critérios foram mais importantes na sua pesquisa sobre instituições?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Priorizei instituições reconhecidas por sua excelência acadêmica e reputação no campo de estudo que me interessa, verificando rankings e avaliações de qualidade educacional."},
    {"label": "A2", "text": "Busquei informações sobre a qualidade do corpo docente, recursos disponíveis e histórico de sucesso dos graduados em programas similares ao que me interessa."},
    {"label": "A3", "text": "Analisei a reputação das instituições em rankings educacionais e avaliações de qualidade, focando naquelas que melhor se alinham com meus objetivos acadêmicos e profissionais."}
  ]'::jsonb,
  2,
  'institution_selection_research',
  'Detalhes sobre critérios de pesquisa. Enfatizar escolha criteriosa baseada em fatores objetivos. Mencionar tipos de critérios (ranking, qualidade, reputação) sem ser muito específico sobre rankings exatos ou nomes de instituições.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 4: Follow-up para Opção B (Currículo inovador e prático)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  4,
  'Detalhes sobre o Currículo',
  'Que aspectos do currículo mais atraíram você?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "O currículo oferece uma combinação equilibrada de teoria e prática, com projetos práticos e oportunidades de aplicação real dos conhecimentos adquiridos."},
    {"label": "B2", "text": "A estrutura do programa integra metodologias inovadoras de ensino com componentes práticos que permitem desenvolver competências aplicáveis diretamente no mercado de trabalho."},
    {"label": "B3", "text": "O currículo é projetado para complementar formação teórica prévia com experiências práticas e projetos que desenvolvem habilidades essenciais para minha área profissional."}
  ]'::jsonb,
  2,
  'institution_selection_curriculum',
  'Detalhes sobre aspectos do currículo que atraíram. Enfatizar escolha baseada em qualidade e relevância. Mencionar tipos de componentes (teoria, prática, projetos) sem ser muito específico sobre disciplinas exatas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 4: Follow-up para Opção C (Excelência do corpo docente e parcerias)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  4,
  'Detalhes sobre Docentes e Parcerias',
  'Que aspectos do corpo docente e das parcerias foram mais relevantes?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "O corpo docente possui experiência significativa e reconhecimento no campo, com professores que são referência em suas áreas de especialização e pesquisa."},
    {"label": "C2", "text": "A instituição mantém parcerias estratégicas com empresas e organizações do setor, oferecendo oportunidades de networking e experiência prática que são valiosas para o desenvolvimento profissional."},
    {"label": "C3", "text": "A combinação de um corpo docente qualificado com parcerias estabelecidas no setor profissional oferece uma experiência educacional que conecta teoria acadêmica com aplicação prática no mercado."}
  ]'::jsonb,
  2,
  'institution_selection_faculty',
  'Detalhes sobre corpo docente e parcerias. Enfatizar qualidade e relevância. Mencionar tipos de qualificações e parcerias sem ser muito específico sobre nomes de professores ou empresas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 4 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 5: Follow-up para Opção A (Progressão lógica da graduação)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  5,
  'Detalhes sobre Progressão Acadêmica',
  'Como este curso representa uma progressão natural da sua formação?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "O curso permite aprofundar conhecimentos fundamentais adquiridos na minha graduação, oferecendo especialização técnica que é uma evolução natural do meu percurso acadêmico."},
    {"label": "A2", "text": "Esta formação expande competências que já desenvolvi anteriormente, permitindo que eu avance para níveis mais especializados e aplicados do meu campo de estudo."},
    {"label": "A3", "text": "O programa representa o próximo passo lógico na minha trajetória educacional, construindo sobre a base sólida que estabeleci durante minha graduação."}
  ]'::jsonb,
  2,
  'professional_coherence_progression',
  'Detalhes sobre como curso representa progressão. Enfatizar continuidade e coerência acadêmica. Mencionar tipos de conhecimentos e competências sem ser muito específico sobre disciplinas exatas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 5: Follow-up para Opção B (Atualização tecnológica)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  5,
  'Detalhes sobre Atualização Tecnológica',
  'Que aspectos de atualização tecnológica são mais relevantes para suas funções?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "O curso oferece formação em tecnologias e metodologias emergentes que são essenciais para manter-me atualizado e competitivo nas funções que desempenho ou pretendo desempenhar."},
    {"label": "B2", "text": "Esta formação preenche uma necessidade crítica de atualização em ferramentas e processos tecnológicos que são fundamentais para o desenvolvimento profissional na minha área."},
    {"label": "B3", "text": "O programa integra conhecimentos tecnológicos atualizados que são diretamente aplicáveis às responsabilidades profissionais que tenho ou aspiro ter no futuro."}
  ]'::jsonb,
  2,
  'professional_coherence_technology',
  'Detalhes sobre atualização tecnológica. Enfatizar necessidade de manter-se atualizado. Mencionar tipos de tecnologias e metodologias sem ser muito específico sobre ferramentas ou softwares exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 5: Follow-up para Opção C (Expansão de competências)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  5,
  'Detalhes sobre Expansão de Competências',
  'Que competências específicas este curso expande para sua carreira?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "O curso desenvolve competências de liderança e gestão que são essenciais para assumir cargos de maior responsabilidade e impacto na minha trajetória profissional."},
    {"label": "C2", "text": "Esta formação expande minhas habilidades técnicas e analíticas, permitindo que eu me qualifique para posições que exigem um conjunto mais amplo de competências profissionais."},
    {"label": "C3", "text": "O programa oferece desenvolvimento de competências estratégicas e especializadas que me prepararão para assumir funções de maior complexidade e responsabilidade no futuro."}
  ]'::jsonb,
  2,
  'professional_coherence_skills',
  'Detalhes sobre competências que curso expande. Enfatizar desenvolvimento profissional e crescimento de carreira. Mencionar tipos de competências (liderança, técnicas, estratégicas) sem ser muito específico.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 5 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 6: Follow-up para Opção A (Cronograma de estudos)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  6,
  'Detalhes sobre Cronograma',
  'Como você estruturou seu cronograma de estudos?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Organizei um plano de estudos que equilibra as disciplinas do programa com tempo adequado para leitura, projetos práticos e preparação para avaliações."},
    {"label": "A2", "text": "Estruturei um cronograma que considera os pré-requisitos do programa e permite uma progressão gradual e organizada através do currículo acadêmico."},
    {"label": "A3", "text": "Desenvolvi um plano de estudos que integra as exigências acadêmicas com tempo para aprofundamento pessoal e desenvolvimento das competências necessárias para o sucesso no programa."}
  ]'::jsonb,
  2,
  'planning_schedule',
  'Detalhes sobre estruturação do cronograma. Demonstrar seriedade e organização. Mencionar tipos de atividades (leitura, projetos, avaliações) sem ser muito específico sobre horários exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 6: Follow-up para Opção B (Análise de impacto na carreira)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  6,
  'Detalhes sobre Análise de Carreira',
  'Como você analisou o impacto desta decisão na sua carreira?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "Avaliei como esta formação se alinha com minhas metas profissionais de longo prazo e como ela pode abrir portas para oportunidades de carreira mais avançadas."},
    {"label": "B2", "text": "Analisei o retorno profissional desta decisão, considerando como as competências desenvolvidas se traduzirão em crescimento de carreira e novas oportunidades no mercado."},
    {"label": "B3", "text": "Estruturei uma análise estratégica de como esta formação se conecta com minha trajetória profissional, identificando os benefícios de carreira que ela proporcionará."}
  ]'::jsonb,
  2,
  'planning_career',
  'Detalhes sobre análise de impacto na carreira. Demonstrar planejamento estratégico. Mencionar tipos de análises e considerações sem ser muito específico sobre empresas ou posições exatas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 6: Follow-up para Opção C (Metas de aprendizado)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  6,
  'Detalhes sobre Metas de Aprendizado',
  'Que metas específicas de aprendizado você estabeleceu?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "Estabeleci metas claras de desenvolvimento de competências técnicas específicas que são diretamente aplicáveis às funções profissionais que pretendo desempenhar."},
    {"label": "C2", "text": "Defini objetivos de aprendizado focados em áreas estratégicas do currículo que trarão o maior valor para minha trajetória profissional e crescimento de carreira."},
    {"label": "C3", "text": "Organizei metas de aprendizado que priorizam disciplinas e projetos que desenvolvem habilidades essenciais para avançar na minha área profissional."}
  ]'::jsonb,
  2,
  'planning_goals',
  'Detalhes sobre metas de aprendizado. Demonstrar foco e direcionamento. Mencionar tipos de competências e objetivos sem ser muito específico sobre disciplinas exatas.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 6 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 7: Follow-up para Opção A (Reservas financeiras sólidas)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  7,
  'Detalhes sobre Reservas Financeiras',
  'Como você planejou e organizou suas reservas financeiras?',
  'multiple_choice',
  '[
    {"label": "A1", "text": "Mantive reservas financeiras planejadas especificamente para investimento em desenvolvimento educacional, garantindo que tenho recursos suficientes para cobrir mensalidades e despesas de vida durante todo o programa."},
    {"label": "A2", "text": "Organizei minhas finanças de forma estratégica, destinando uma parcela significativa de minhas economias para este investimento em educação, sem comprometer minha estabilidade financeira."},
    {"label": "A3", "text": "Planejei cuidadosamente minhas reservas financeiras, assegurando que possuo fundos adequados para cobrir todos os custos do programa acadêmico e despesas de vida, com uma margem de segurança."}
  ]'::jsonb,
  2,
  'financial_support_savings',
  'CRÍTICO: Detalhes sobre planejamento financeiro. Usar na seção "financial_ability_and_compliance". Enfatizar que recursos cobrem TUITION + LIVING EXPENSES. Mencionar tipos de planejamento sem ser muito específico sobre valores exatos.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'A'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 7: Follow-up para Opção B (Suporte financeiro comprovado)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  7,
  'Detalhes sobre Suporte Financeiro',
  'Como você organizou o suporte financeiro comprovado?',
  'multiple_choice',
  '[
    {"label": "B1", "text": "Conto com uma combinação de recursos próprios e suporte financeiro documentado que cobre integralmente as mensalidades e todas as despesas de vida necessárias para o período do programa."},
    {"label": "B2", "text": "Organizei uma estrutura financeira que integra economias pessoais com suporte comprovado, garantindo cobertura completa de todos os custos educacionais e de manutenção."},
    {"label": "B3", "text": "Estabeleci uma base financeira sólida através da combinação de recursos próprios e suporte documentado, assegurando que todos os requisitos financeiros do programa sejam atendidos."}
  ]'::jsonb,
  2,
  'financial_support_combination',
  'CRÍTICO: Detalhes sobre suporte financeiro combinado. Usar na seção "financial_ability_and_compliance". SEMPRE mencionar TUITION + LIVING EXPENSES. Se houver patrocinador, mencionar o que cobre. Mencionar tipos de recursos sem ser muito específico sobre valores.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'B'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

-- STEP 7: Follow-up para Opção C (Economias acumuladas)
INSERT INTO application_questions (
  step_number, theme, question_text, question_type, options, order_index,
  category, ai_prompt_context, is_required, parent_question_id, trigger_option
)
SELECT 
  7,
  'Detalhes sobre Economias',
  'Como você demonstra capacidade financeira através de economias?',
  'multiple_choice',
  '[
    {"label": "C1", "text": "Possuo economias acumuladas ao longo do tempo que foram planejadas especificamente para investimento em educação, cobrindo mensalidades e despesas de vida com margem adequada."},
    {"label": "C2", "text": "Mantive uma estratégia de poupança focada em desenvolvimento educacional, resultando em reservas que garantem foco total nos estudos sem preocupações financeiras durante todo o programa."},
    {"label": "C3", "text": "Desenvolvi uma base financeira sólida através de economias planejadas, assegurando que tenho recursos suficientes para cobrir todos os custos do programa e manter-me focado exclusivamente nos estudos."}
  ]'::jsonb,
  2,
  'financial_support_accumulated',
  'CRÍTICO: Detalhes sobre economias acumuladas. Usar na seção "financial_ability_and_compliance". SEMPRE mencionar TUITION + LIVING EXPENSES. Demonstrar que recursos ≥ total necessário. Mencionar tipos de planejamento sem ser muito específico sobre valores.',
  true,
  (SELECT id FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL LIMIT 1),
  'C'
WHERE EXISTS (SELECT 1 FROM application_questions WHERE step_number = 7 AND order_index = 1 AND parent_question_id IS NULL)
ON CONFLICT DO NOTHING;

