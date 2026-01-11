"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plane,
  Lightbulb,
  GraduationCap,
  Building2,
  Briefcase,
  Calendar,
  Wallet,
  Loader2,
  Sparkles,
  Trophy,
  Star,
} from "lucide-react";
import Link from "next/link";
import { 
  createDraftApplication,
  getQuestionsByStep, 
  saveQuestionAnswers, 
  getFollowUpQuestions,
  getApplicationCaseId 
} from "@/app/actions/application";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface Question {
  id: string;
  step_number: number;
  theme: string;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; text: string }>;
  order_index: number;
  is_required: boolean;
  category: string | null;
  ai_prompt_context: string;
  help_text: string | null;
  parent_question_id?: string | null;
  trigger_option?: string | null;
}

interface Answer {
  questionId: string;
  selectedOption: string;
  answerText: string;
}

// Ícones para cada step (estilo Duolingo)
const stepIcons = {
  1: Plane,
  2: Lightbulb,
  3: GraduationCap,
  4: Building2,
  5: Briefcase,
  6: Calendar,
  7: Wallet,
};

// Cores para cada step - seguindo o design system da plataforma
const stepColors = {
  1: "from-primary to-primary/90",
  2: "from-primary/90 to-primary/80",
  3: "from-primary/80 to-primary/70",
  4: "from-primary/70 to-primary/60",
  5: "from-primary/60 to-primary/50",
  6: "from-primary/50 to-primary/40",
  7: "from-primary/40 to-primary/30",
};

// Cores de borda e background para cada step
const stepBorderColors = {
  1: "border-primary",
  2: "border-primary/90",
  3: "border-primary/80",
  4: "border-primary/70",
  5: "border-primary/60",
  6: "border-primary/50",
  7: "border-primary/40",
};

const stepBgColors = {
  1: "bg-primary/10",
  2: "bg-primary/9",
  3: "bg-primary/8",
  4: "bg-primary/7",
  5: "bg-primary/6",
  6: "bg-primary/5",
  7: "bg-primary/4",
};

// Nomes dos steps em português
const stepNames = {
  1: "Motivo Original",
  2: "Evolução da Decisão",
  3: "Interesse Acadêmico",
  4: "Escolha da Instituição",
  5: "Coerência Profissional",
  6: "Planejamento",
  7: "Recursos Financeiros",
};

function NewApplicationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Try to get applicationId from URL or sessionStorage
  const applicationIdFromUrl = searchParams.get("app_id");
  
  // Use sessionStorage instead of localStorage to prevent cross-session issues
  const getStoredApplicationId = () => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem('draft_application_id');
    const timestamp = sessionStorage.getItem('draft_application_timestamp');
    // Only use stored ID if it's less than 5 minutes old
    if (stored && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < 5 * 60 * 1000) { // 5 minutes
        return stored;
      } else {
        // Clear old data
        sessionStorage.removeItem('draft_application_id');
        sessionStorage.removeItem('draft_application_timestamp');
      }
    }
    return null;
  };
  
  const applicationIdFromStorage = typeof window !== 'undefined' ? getStoredApplicationId() : null;
  const initialApplicationId = applicationIdFromUrl || applicationIdFromStorage;
  
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [processingNext, setProcessingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(initialApplicationId);
  const [creatingDraft, setCreatingDraft] = useState(!initialApplicationId);
  
  const loadedStepsRef = useRef<Set<number>>(new Set());

  // Questions and answers
  const [questions, setQuestions] = useState<Record<number, Question[]>>({});
  const [followUpQuestions, setFollowUpQuestions] = useState<Record<string, Question[]>>({}); // Key: parent_question_id
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingFollowUps, setLoadingFollowUps] = useState<Record<string, boolean>>({});

  const [caseId, setCaseId] = useState<string | null>(null);

  // Load questions for current step - FIXED: removed questions from dependencies to prevent infinite loop
  useEffect(() => {
    const loadQuestions = async () => {
      // Skip if already loaded for this step
      if (loadedStepsRef.current.has(currentStep)) {
        console.log(`[loadQuestions] Step ${currentStep} already loaded, skipping`);
        return;
      }

      setLoadingQuestions(true);
      try {
        console.log(`[loadQuestions] Loading questions for step ${currentStep}`);
        const result = await getQuestionsByStep(currentStep);
        if (result.success && result.questions) {
          console.log(`[loadQuestions] Loaded ${result.questions.length} questions for step ${currentStep}`);
          setQuestions((prev) => {
            // Only update if not already set
            if (prev[currentStep]?.length > 0) {
              console.log(`[loadQuestions] Questions for step ${currentStep} already exist, skipping update`);
              return prev;
            }
            return {
              ...prev,
              [currentStep]: result.questions || [],
            };
          });
          loadedStepsRef.current.add(currentStep);
        } else {
          console.error(`[loadQuestions] Failed to load questions for step ${currentStep}:`, result.error);
        }
      } catch (err) {
        console.error("Error loading questions:", err);
      } finally {
        setLoadingQuestions(false);
      }
    };

    loadQuestions();
    // Only depend on currentStep, not questions
  }, [currentStep]);

  // Create draft application on mount if needed
  useEffect(() => {
    // If we already have an applicationId from URL, skip creation
    if (applicationIdFromUrl) {
      setApplicationId(applicationIdFromUrl);
      setCreatingDraft(false);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('draft_application_id', applicationIdFromUrl);
        sessionStorage.setItem('draft_application_timestamp', Date.now().toString());
      }
      return;
    }
    
    // Check sessionStorage for existing draft
    if (typeof window !== 'undefined') {
      const storedId = getStoredApplicationId();
      if (storedId) {
        setApplicationId(storedId);
        const newUrl = `/applications/new?app_id=${storedId}`;
        window.history.replaceState({}, '', newUrl);
        setCreatingDraft(false);
        return;
      }
    }
    
    // If we already have an applicationId in state, skip creation
    if (applicationId) {
      setCreatingDraft(false);
      return;
    }
    
    // Create new draft application
    const createDraft = async () => {
      try {
        setCreatingDraft(true);
        const result = await createDraftApplication();
        
        if (result.success && result.application) {
          const newAppId = result.application.id;
          console.log("[createDraft] Application created successfully:", newAppId);
          
          // Save to sessionStorage
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('draft_application_id', newAppId);
            sessionStorage.setItem('draft_application_timestamp', Date.now().toString());
          }
          
          // Update URL
          const newUrl = `/applications/new?app_id=${newAppId}`;
          window.history.replaceState({}, '', newUrl);
          
          // Update state
          setApplicationId(newAppId);
          setCreatingDraft(false);
        } else {
          setError("Falha ao criar aplicação");
          setCreatingDraft(false);
        }
      } catch (err: any) {
        console.error("Error creating draft:", err);
        setError(err.message || "Falha ao criar aplicação");
        setCreatingDraft(false);
      }
    };

    createDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync applicationId from sessionStorage if not in state
  useEffect(() => {
    if (!applicationId && typeof window !== 'undefined') {
      const storedId = getStoredApplicationId();
      if (storedId) {
        setApplicationId(storedId);
        setCreatingDraft(false);
      }
    }
  }, [applicationId]);

  // Fetch case_id when application is loaded
  useEffect(() => {
    if (!applicationId || caseId) return;

    const fetchCaseId = async () => {
      try {
        const result = await getApplicationCaseId(applicationId);

        if (result.success && result.case_id) {
          setCaseId(result.case_id);
        }
      } catch (error) {
        console.error("Failed to fetch case_id:", error);
      }
    };

    fetchCaseId();
  }, [applicationId, caseId]);

  const handleAnswerSelect = async (questionId: string, option: { label: string; text: string }) => {
    const question = questions[currentStep]?.find((q) => q.id === questionId);
    const previousAnswer = answers[questionId];
    
    // If this is a main question and the answer changed, remove old follow-ups and their answers
    if (question && !question.parent_question_id && previousAnswer?.selectedOption !== option.label) {
      // Remove old follow-up questions
      const oldFollowUps = followUpQuestions[questionId] || [];
      setFollowUpQuestions((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
      
      // Remove answers from old follow-ups
      oldFollowUps.forEach((followUp) => {
        setAnswers((prev) => {
          const updated = { ...prev };
          delete updated[followUp.id];
          return updated;
        });
      });
    }

    // Save the answer
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        selectedOption: option.label,
        answerText: option.text,
      },
    }));

    // Check if this is a main question and has follow-up questions
    if (question && !question.parent_question_id) {
      // This is a main question, check for follow-ups
      setLoadingFollowUps((prev) => ({ ...prev, [questionId]: true }));
      
      try {
        const result = await getFollowUpQuestions(questionId, option.label);
        if (result.success && result.questions && result.questions.length > 0) {
          setFollowUpQuestions((prev) => ({
            ...prev,
            [questionId]: result.questions || [],
          }));
        }
      } catch (err) {
        console.error("Error loading follow-up questions:", err);
      } finally {
        setLoadingFollowUps((prev) => ({ ...prev, [questionId]: false }));
      }
    }
  };

  const validateStep = (step: Step): boolean => {
    const stepQuestions = questions[step] || [];
    const allQuestions = [...stepQuestions];
    
    // Add follow-up questions to validation
    stepQuestions.forEach((q) => {
      if (followUpQuestions[q.id]) {
        allQuestions.push(...followUpQuestions[q.id]);
      }
    });

    // If no questions loaded yet, don't validate (still loading)
    if (allQuestions.length === 0) {
      console.log(`[validateStep] Step ${step}: No questions loaded yet (questions[${step}] = ${questions[step]?.length || 0})`);
      return false;
    }

    // Check if all required questions are answered
    const requiredQuestions = allQuestions.filter((q) => q.is_required);
    const answeredRequired = requiredQuestions.filter((q) => {
      const hasAnswer = answers[q.id]?.selectedOption !== undefined;
      if (!hasAnswer) {
        console.log(`[validateStep] Question ${q.id} (${q.question_text.substring(0, 30)}...) is required but not answered`);
      }
      return hasAnswer;
    });
    
    const isValid = requiredQuestions.length === 0 || answeredRequired.length === requiredQuestions.length;

    // Debug log for all steps
    if (!isValid) {
      const unanswered = requiredQuestions.filter((q) => !answers[q.id]?.selectedOption);
      console.log(`[validateStep] Step ${step} validation failed.`, {
        totalQuestions: allQuestions.length,
        requiredQuestions: requiredQuestions.length,
        answeredRequired: answeredRequired.length,
        unanswered: unanswered.map(q => ({ 
          id: q.id, 
          text: q.question_text.substring(0, 50) + '...',
          hasFollowUps: !!followUpQuestions[q.id],
          followUpCount: followUpQuestions[q.id]?.length || 0,
        })),
        allAnswers: Object.keys(answers),
      });
    } else {
      console.log(`[validateStep] Step ${step} is valid.`, {
        totalQuestions: allQuestions.length,
        requiredQuestions: requiredQuestions.length,
        answeredRequired: answeredRequired.length,
      });
    }

    return isValid;
  };

  const handleNext = async () => {
    console.log("[handleNext] Called", { 
      currentStep, 
      applicationId, 
      creatingDraft, 
      isValid: validateStep(currentStep),
      answersCount: Object.keys(answers).length 
    });

    if (!validateStep(currentStep)) {
      setError("Por favor, selecione uma resposta para todas as perguntas obrigatórias");
      return;
    }

    // Prevent navigation while creating
    if (creatingDraft) {
      setError("Aguarde enquanto criamos sua aplicação...");
      return;
    }

    // Prevent multiple clicks
    if (processingNext) {
      return;
    }

    // Set processing state immediately for UI feedback
    setProcessingNext(true);
    setError(null);

    try {

    // Get applicationId from state or sessionStorage
    let currentApplicationId = applicationId;
    if (!currentApplicationId && typeof window !== 'undefined') {
      const storedId = getStoredApplicationId();
      if (storedId) {
        currentApplicationId = storedId;
        setApplicationId(storedId);
        setCreatingDraft(false);
      }
    }

    // Wait for application to be created if still creating
    if (!currentApplicationId && creatingDraft) {
      setError("Aguarde enquanto criamos sua aplicação...");
      
      // Wait up to 5 seconds
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts && !currentApplicationId) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (typeof window !== 'undefined') {
          const storedId = getStoredApplicationId();
          if (storedId) {
            currentApplicationId = storedId;
            setApplicationId(storedId);
            setCreatingDraft(false);
            break;
          }
        }
        attempts++;
      }
      
      if (!currentApplicationId) {
        setError("Não foi possível criar a aplicação. Por favor, recarregue a página e tente novamente.");
        setProcessingNext(false);
        return;
      }
    }

    // Save answers for current step (including follow-ups) - only if we have an applicationId
    if (currentApplicationId) {
      const stepQuestions = questions[currentStep] || [];
      const allStepQuestions = [...stepQuestions];
      
      // Add follow-up questions
      stepQuestions.forEach((q) => {
        if (followUpQuestions[q.id]) {
          allStepQuestions.push(...followUpQuestions[q.id]);
        }
      });

      const stepAnswers = allStepQuestions
        .filter((q) => answers[q.id])
        .map((q) => answers[q.id]);

      console.log("[handleNext] Step answers to save:", { 
        stepAnswersCount: stepAnswers.length, 
        allStepQuestionsCount: allStepQuestions.length 
      });

      // Try to save answers if we have any
      if (stepAnswers.length > 0) {
        try {
          const saveResult = await saveQuestionAnswers(currentApplicationId, stepAnswers);
          
          if (!saveResult.success) {
            console.error("Error saving answers:", saveResult.error);
            
            if (saveResult.error === "Application not found") {
              // Clear invalid ID and recreate
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('draft_application_id');
                sessionStorage.removeItem('draft_application_timestamp');
              }
              setApplicationId(null);
              setCreatingDraft(true);
              setError("Aplicação não encontrada. Recriando aplicação... Por favor, aguarde.");
              
              const result = await createDraftApplication();
              if (result.success && result.application) {
                const newAppId = result.application.id;
                setApplicationId(newAppId);
                setCreatingDraft(false);
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('draft_application_id', newAppId);
                  sessionStorage.setItem('draft_application_timestamp', Date.now().toString());
                }
                setError(null);
                currentApplicationId = newAppId;
                
                // Retry saving
                const retryResult = await saveQuestionAnswers(newAppId, stepAnswers);
                if (!retryResult.success) {
                  setError("Erro ao salvar respostas. Por favor, tente novamente.");
                  setProcessingNext(false);
                  return;
                }
              } else {
                setError("Não foi possível recriar a aplicação. Por favor, recarregue a página.");
                setProcessingNext(false);
                return;
              }
            } else if (saveResult.error === "Not authenticated") {
              setError("Sessão expirada. Por favor, faça login novamente.");
              setProcessingNext(false);
              return;
            } else {
              setError(saveResult.error || "Erro ao salvar respostas. Por favor, tente novamente.");
              setProcessingNext(false);
              return;
            }
          }
        } catch (err: any) {
          console.error("Error saving answers:", err);
          setError(err.message || "Erro ao salvar respostas. Por favor, tente novamente.");
          setProcessingNext(false);
          return;
        }
      } else {
        console.log("[handleNext] No answers to save, proceeding to next step");
      }
    } else {
      console.warn("[handleNext] No applicationId available, proceeding without saving");
    }

    // Navigate to next step
    if (currentStep < 7) {
      console.log("[handleNext] Moving to next step:", currentStep + 1);
      setCurrentStep((prev) => (prev + 1) as Step);
      setError(null);
    } else {
      // Final step - submit and redirect
      console.log("Step 7 completed, calling handleSubmit...");
      await handleSubmit();
    }
    } finally {
      setProcessingNext(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    console.log("handleSubmit called", { applicationId, answersCount: Object.keys(answers).length });
    
    if (!applicationId) {
      setError("Aplicação não inicializada. Por favor, aguarde um momento.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Collect all answers including follow-ups
      const allStepQuestions: Question[] = [];
      
      // Get all main questions from all steps
      Object.values(questions).forEach((stepQuestions) => {
        allStepQuestions.push(...stepQuestions);
      });
      
      // Add all follow-up questions
      Object.values(followUpQuestions).forEach((followUps) => {
        allStepQuestions.push(...followUps);
      });

      // Get all answers
      const allAnswers = allStepQuestions
        .filter((q) => answers[q.id])
        .map((q) => answers[q.id]);

      // Save all answers
      if (allAnswers.length > 0) {
        const saveResult = await saveQuestionAnswers(applicationId, allAnswers);
        if (!saveResult.success) {
          console.error("Error saving final answers:", saveResult.error);
          setError("Erro ao salvar respostas. Por favor, tente novamente.");
          setLoading(false);
          return;
        }
      }

      // Redirect to documents upload page
      await router.push(`/applications/${applicationId}/documents`);
      
      // Clear draft from sessionStorage after successful submission
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('draft_application_id');
        sessionStorage.removeItem('draft_application_timestamp');
      }
    } catch (err: any) {
      console.error("Error submitting application:", err);
      setError(err.message || "Ocorreu um erro ao finalizar. Por favor, tente novamente.");
      setLoading(false);
    }
  };

  const currentQuestions = questions[currentStep] || [];
  const currentStepIcon = stepIcons[currentStep];
  const currentStepColor = stepColors[currentStep];
  const currentStepBorderColor = stepBorderColors[currentStep];
  const currentStepBgColor = stepBgColors[currentStep];
  const completedSteps = Array.from({ length: 7 }, (_, i) => i + 1).filter(
    (step) => step < currentStep || (step === currentStep && validateStep(step as Step))
  ).length;

  // Compute if button should be disabled
  const isStepValid = validateStep(currentStep);
  const hasApplicationId = applicationId || (typeof window !== 'undefined' ? !!getStoredApplicationId() : false);
  const isButtonDisabled = loading || processingNext || !isStepValid || (creatingDraft && !hasApplicationId);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span className="hidden sm:inline">Voltar ao Dashboard</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
          {caseId && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
              <p className="text-xs font-mono font-semibold text-primary">{caseId}</p>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-6 sm:mb-8 text-center">
            <h1 className="text-2xl sm:text-4xl font-bold text-foreground">
              Complete sua Aplicação
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-lg text-muted-foreground">
              Responda as perguntas abaixo para gerarmos sua documentação
            </p>
          </div>

          {/* Progress Bar - Design System */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                Progresso: {completedSteps} de 7
              </span>
              <span className="text-xs sm:text-sm font-medium text-primary">
                {Math.round((completedSteps / 7) * 100)}%
              </span>
            </div>
            <div className="h-2 sm:h-3 w-full rounded-full bg-muted overflow-hidden border border-border/50">
              <div
                className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary/80 transition-all duration-500 ease-out shadow-sm"
                style={{ width: `${(completedSteps / 7) * 100}%` }}
              />
            </div>
          </div>

          {/* Progress Steps - Visual */}
          <div className="mb-8 flex items-center justify-between gap-0 sm:gap-1">
            {Array.from({ length: 7 }, (_, i) => i + 1).map((step) => {
              const Icon = stepIcons[step as Step];
              const isCompleted = step < currentStep;
              const isCurrent = step === currentStep;
              const isAnswered = questions[step]?.every((q) => 
                !q.is_required || answers[q.id]?.selectedOption !== undefined
              );

              return (
                <div key={step} className="flex items-center flex-1 min-w-0">
                  {/* Icon Circle */}
                  <div
                    className={`relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 transition-all duration-300 flex-shrink-0 z-10 ${
                      isCompleted
                        ? "border-primary bg-primary text-primary-foreground scale-110 shadow-md"
                        : isCurrent
                        ? `border-primary bg-gradient-to-br ${stepColors[step as Step]} text-primary-foreground scale-110 shadow-lg ring-2 ring-primary/20`
                        : isAnswered
                        ? `${stepBorderColors[step as Step]} ${stepBgColors[step as Step]} text-primary`
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                    ) : (
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </div>
                  {/* Connector Line - Only between steps, not after step 7 */}
                  {step < 7 && (
                    <div
                      className={`hidden sm:block h-1 flex-1 transition-all duration-300 ${
                        step < currentStep ? "bg-primary" : "bg-border"
                      }`}
                      style={{ marginLeft: '4px', marginRight: '4px' }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          {/* Question Card - Estilo Duolingo */}
          {loadingQuestions ? (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
            </div>
          ) : currentQuestions.length > 0 ? (
            <div className="space-y-4 sm:space-y-6">
              {currentQuestions.map((question) => {
                const selectedAnswer = answers[question.id];
                const Icon = currentStepIcon;
                const questionFollowUps = followUpQuestions[question.id] || [];
                const isLoadingFollowUps = loadingFollowUps[question.id];

                return (
                  <div key={question.id} className="space-y-4 sm:space-y-6">
                    {/* Main Question */}
                    <div
                      className={`rounded-xl sm:rounded-2xl border-2 ${currentStepBorderColor} bg-card p-4 sm:p-6 lg:p-8 shadow-lg sm:shadow-xl transition-all hover:shadow-2xl ${currentStepBgColor}`}
                    >
                      {/* Question Header */}
                      <div className="mb-4 sm:mb-6 flex items-start gap-3 sm:gap-4">
                        <div
                          className={`flex h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${currentStepColor} text-primary-foreground shadow-lg ring-2 ring-primary/10`}
                        >
                          <Icon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full ${currentStepBgColor} ${currentStepBorderColor} border px-2 sm:px-3 py-1 text-xs font-semibold text-primary whitespace-nowrap`}>
                              Passo {currentStep}
                            </span>
                            <span className="rounded-full bg-muted border border-border px-2 sm:px-3 py-1 text-xs font-medium text-muted-foreground truncate max-w-full">
                              {question.theme}
                            </span>
                          </div>
                          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground leading-tight">
                            {question.question_text}
                          </h2>
                          {question.help_text && (
                            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                              {question.help_text}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Options - Estilo Duolingo */}
                      <div className="space-y-2 sm:space-y-3">
                        {question.options.map((option) => {
                          const isSelected = selectedAnswer?.selectedOption === option.label;
                          return (
                            <button
                              key={option.label}
                              onClick={() => handleAnswerSelect(question.id, option)}
                              className={`group relative w-full rounded-lg sm:rounded-xl border-2 p-3 sm:p-4 lg:p-5 text-left transition-all duration-200 ${
                                isSelected
                                  ? `${currentStepBorderColor} bg-gradient-to-br ${currentStepColor} text-primary-foreground shadow-lg scale-[1.02] ring-2 ring-primary/20`
                                  : `border-border bg-background hover:${currentStepBorderColor} hover:${currentStepBgColor} hover:scale-[1.01] active:scale-[0.99]`
                              }`}
                            >
                              <div className="flex items-start gap-3 sm:gap-4">
                                <div
                                  className={`flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg font-bold text-base sm:text-lg transition-all ${
                                    isSelected
                                      ? "bg-primary-foreground/20 text-primary-foreground"
                                      : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                                  }`}
                                >
                                  {option.label}
                                </div>
                                <p
                                  className={`flex-1 text-sm sm:text-base font-medium leading-relaxed ${
                                    isSelected ? "text-primary-foreground" : "text-foreground"
                                  }`}
                                >
                                  {option.text}
                                </p>
                                {isSelected && (
                                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 text-primary-foreground" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Follow-up Questions - Aparecem quando uma opção é selecionada */}
                    {isLoadingFollowUps && (
                      <div className="flex items-center justify-center py-6 sm:py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}

                    {questionFollowUps.length > 0 && selectedAnswer && (
                      <div className={`space-y-4 sm:space-y-6 pl-4 sm:pl-6 border-l-2 ${currentStepBorderColor} animate-in slide-in-from-left duration-300`}>
                        {questionFollowUps.map((followUp) => {
                          const followUpAnswer = answers[followUp.id];
                          return (
                            <div
                              key={followUp.id}
                              className={`rounded-xl sm:rounded-2xl border-2 ${currentStepBorderColor} ${currentStepBgColor} p-4 sm:p-6 lg:p-8 shadow-md transition-all hover:shadow-lg`}
                            >
                              {/* Follow-up Question Header */}
                              <div className="mb-4 sm:mb-6 flex items-start gap-3 sm:gap-4">
                                <div className={`flex h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 flex-shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${currentStepBgColor} ${currentStepBorderColor} border text-primary`}>
                                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full ${currentStepBgColor} ${currentStepBorderColor} border px-2 sm:px-3 py-1 text-xs font-semibold text-primary whitespace-nowrap`}>
                                      Detalhamento
                                    </span>
                                    <span className="rounded-full bg-muted px-2 sm:px-3 py-1 text-xs font-medium text-muted-foreground truncate max-w-full">
                                      {followUp.theme}
                                    </span>
                                  </div>
                                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-foreground leading-tight">
                                    {followUp.question_text}
                                  </h3>
                                  {followUp.help_text && (
                                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                                      {followUp.help_text}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Follow-up Options */}
                              <div className="space-y-2 sm:space-y-3">
                                {followUp.options.map((option) => {
                                  const isSelected = followUpAnswer?.selectedOption === option.label;
                                  return (
                                    <button
                                      key={option.label}
                                      onClick={() => handleAnswerSelect(followUp.id, option)}
                                      className={`group relative w-full rounded-lg sm:rounded-xl border-2 p-3 sm:p-4 lg:p-5 text-left transition-all duration-200 ${
                                        isSelected
                                          ? `${currentStepBorderColor} bg-gradient-to-br ${currentStepColor} text-primary-foreground shadow-lg scale-[1.02] ring-2 ring-primary/20`
                                          : `${currentStepBorderColor} border-opacity-30 bg-background hover:border-opacity-50 hover:${currentStepBgColor} hover:scale-[1.01] active:scale-[0.99]`
                                      }`}
                                    >
                                      <div className="flex items-start gap-3 sm:gap-4">
                                        <div
                                          className={`flex h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-lg font-bold text-base sm:text-lg transition-all ${
                                            isSelected
                                              ? "bg-primary-foreground/20 text-primary-foreground"
                                              : `${currentStepBgColor} text-primary group-hover:bg-primary/20`
                                          }`}
                                        >
                                          {option.label}
                                        </div>
                                        <p
                                          className={`flex-1 text-sm sm:text-base font-medium leading-relaxed ${
                                            isSelected ? "text-primary-foreground" : "text-foreground"
                                          }`}
                                        >
                                          {option.text}
                                        </p>
                                        {isSelected && (
                                          <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 text-primary-foreground" />
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 sm:p-12 text-center">
              <Loader2 className="mx-auto mb-4 h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
              <p className="text-sm sm:text-base text-muted-foreground">Carregando perguntas...</p>
            </div>
          )}

          {/* Navigation Buttons - Estilo Duolingo */}
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className="group order-2 sm:order-1 flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl border-2 border-border bg-background px-4 sm:px-6 py-3 sm:py-4 font-bold text-sm sm:text-base text-foreground transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:border-border disabled:hover:bg-background"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:-translate-x-1" />
              <span>Anterior</span>
            </button>
            
            <button
              onClick={handleNext}
              disabled={isButtonDisabled}
              className={`group relative order-1 sm:order-3 flex items-center justify-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border-2 ${currentStepBorderColor} bg-gradient-to-r ${currentStepColor} px-6 sm:px-8 py-3 sm:py-4 font-bold text-sm sm:text-base text-primary-foreground shadow-xl transition-all duration-200 hover:scale-105 sm:hover:scale-110 hover:shadow-2xl hover:ring-2 hover:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-xl disabled:hover:ring-0 active:scale-95`}
            >
              {processingNext ? (
                <>
                  <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                  <span className="hidden sm:inline">Processando...</span>
                  <span className="sm:hidden">Processando...</span>
                </>
              ) : currentStep === 7 ? (
                <>
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="hidden sm:inline">Finalizar e Continuar</span>
                  <span className="sm:hidden">Finalizar</span>
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:rotate-12" />
                </>
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:translate-x-2" />
                </>
              )}
              {!loading && !processingNext && validateStep(currentStep) && (
                <div className="absolute -right-1 -top-1 sm:-right-2 sm:-top-2 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-lg ring-2 ring-primary/20">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>
              )}
            </button>
          </div>

          {/* Completion Celebration */}
          {completedSteps === 7 && currentStep === 7 && (
            <div className={`mt-6 sm:mt-8 rounded-xl border-2 ${currentStepBorderColor} ${currentStepBgColor} p-4 sm:p-6 text-center shadow-lg`}>
              <div className="mb-2 sm:mb-3 flex justify-center">
                <div className={`rounded-full bg-gradient-to-br ${currentStepColor} p-2 sm:p-3 shadow-lg ring-2 ring-primary/20`}>
                  <Star className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
                </div>
              </div>
              <h3 className="mb-1 sm:mb-2 text-lg sm:text-xl font-bold text-foreground">
                Parabéns! Você completou todas as perguntas! 🎉
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Clique em "Finalizar" para continuar com o upload de documentos
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function NewApplicationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    }>
      <NewApplicationPageContent />
    </Suspense>
  );
}
