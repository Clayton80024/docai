-- Seed application questions with the 7 steps structure
-- These questions can be easily edited via SQL without changing code

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
);

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
);

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
);

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
);

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
);

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
);

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
);

