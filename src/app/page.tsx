import { currentUser } from "@clerk/nextjs/server";
import { UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import { syncClerkUserToProfile } from "@/lib/supabase/helpers";
import {
  FileText,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Brain,
  FileCheck,
  ArrowRight,
  Shield,
  Globe,
  GraduationCap,
} from "lucide-react";

export default async function Home() {
  const user = await currentUser();

  // If user is authenticated, redirect to dashboard
  if (user) {
    // Sync profile before redirecting
    try {
      await syncClerkUserToProfile(user.id, {
        emailAddresses: user.emailAddresses,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumbers: user.phoneNumbers,
        imageUrl: user.imageUrl,
      });
    } catch (error) {
      // Silently fail - don't block redirect
      console.error("Error syncing profile on home page:", error);
    }
    // Redirect authenticated users to dashboard
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-zinc-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">DocAI</h1>
          </div>
          {user ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <div className="flex gap-3">
              <SignInButton mode="modal">
                <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
                  Entrar
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  Começar Agora
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              Gere sua documentação de visto estudantil com IA em minutos
            </span>
          </div>
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Pare de Perder Tempo com
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Documentação de Visto
            </span>
          </h1>
          <p className="mb-4 text-xl text-muted-foreground sm:text-2xl">
            <strong className="text-foreground">Gere automaticamente</strong> sua Cover Letter, Personal Statement e toda documentação necessária para mudança de status (B-1/B-2 → F-1) com <strong className="text-foreground">Inteligência Artificial</strong>.
          </p>
          <p className="mb-8 text-lg text-muted-foreground">
            ✅ Processamento automático de documentos • ✅ Validação completa • ✅ PDF pronto para envio ao USCIS
          </p>
          {!user && (
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <SignUpButton mode="modal">
                <button className="group flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg">
                  Começar Agora - Grátis
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </SignUpButton>
              <Link
                href="#how-it-works"
                className="rounded-lg border border-border px-8 py-4 text-lg font-semibold transition-colors hover:bg-accent"
              >
                Como Funciona
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Problem Section */}
      <section className="border-y border-border bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-4 text-center text-3xl font-bold text-foreground sm:text-4xl">
              Você Já Perdeu Muito Tempo com Isso
            </h2>
            <p className="mb-12 text-center text-lg text-muted-foreground">
              O processo de mudança de status de visto é complexo, demorado e um erro pode custar sua aprovação
            </p>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                  <Clock className="h-6 w-6 text-destructive" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Horas e Horas de Trabalho</h3>
                <p className="text-muted-foreground">
                  Dias escrevendo Cover Letter, Personal Statement, organizando documentos... Um erro pode atrasar sua aprovação por semanas ou meses.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Risco de Rejeição</h3>
                <p className="text-muted-foreground">
                  Documentos faltando, informações incorretas, formatação errada... Cada rejeição do USCIS custa tempo, dinheiro e ansiedade.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                  <FileText className="h-6 w-6 text-destructive" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Processo Extremamente Complexo</h3>
                <p className="text-muted-foreground">
                  Regras do USCIS, citações legais, organização de exhibits, validação de documentos... É fácil se perder e cometer erros críticos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Mockup Section */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                Como o DocAI Resolve Isso
              </h2>
              <p className="text-xl text-muted-foreground">
                Três passos simples para sua documentação estar pronta
              </p>
            </div>

            <div className="space-y-24">
              {/* Step 1 */}
              <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      1
                    </span>
                    Envie Seus Documentos
                  </div>
                  <h3 className="mb-4 text-3xl font-bold text-foreground">
                    Faça Upload dos Seus Documentos
                  </h3>
                  <p className="mb-6 text-lg text-muted-foreground">
                    Envie seu passaporte, I-94, I-20, extratos bancários e outros documentos necessários. Nossa IA reconhece e categoriza tudo automaticamente.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Suporta PDF, JPG, PNG e mais formatos
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Detecção automática do tipo de documento
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Armazenamento seguro na nuvem
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="relative">
                  <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-lg border-2 border-dashed border-border bg-muted/50 p-12 text-center">
                        <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                        <p className="font-semibold text-foreground">
                          Arraste arquivos aqui ou clique para enviar
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Passaporte, I-94, I-20, Extratos Bancários...
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">passaporte.pdf</p>
                            <p className="text-xs text-muted-foreground">
                              Detectado: Documento de Passaporte
                            </p>
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              i20.pdf
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Detectado: Form I-20
                            </p>
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                <div className="order-2 lg:order-1">
                  <div className="relative">
                    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
                      <div className="mb-4 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      </div>
                      <div className="space-y-4">
                        <div className="rounded-lg border border-border bg-background p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="font-semibold text-foreground">
                              Processamento com IA
                            </h4>
                            <Brain className="h-5 w-5 animate-pulse text-primary" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-muted-foreground">
                                Extraindo informações pessoais...
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-muted-foreground">
                                Validando autenticidade dos documentos...
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-muted-foreground">
                                Verificando completude...
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/50 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Status dos Documentos
                            </span>
                            <span className="text-sm text-green-600 dark:text-green-400">
                              3/3 Completo
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-full bg-green-500"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      2
                    </span>
                    Processamento com IA
                  </div>
                  <h3 className="mb-4 text-3xl font-bold text-foreground">
                    Análise Inteligente de Documentos
                  </h3>
                  <p className="mb-6 text-lg text-muted-foreground">
                    Nossa IA avançada extrai informações automaticamente, valida documentos conforme requisitos do USCIS e identifica qualquer informação faltante ou incorreta antes do envio.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Extração automática de dados de todos os tipos de documentos
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Validação em tempo real conforme requisitos do USCIS
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Detecção instantânea de erros e sugestões de correção
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Step 3 */}
              <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      3
                    </span>
                    Pronto para Enviar
                  </div>
                  <h3 className="mb-4 text-3xl font-bold text-foreground">
                    Documentação Completa e Organizada
                  </h3>
                  <p className="mb-6 text-lg text-muted-foreground">
                    Receba um pacote completo com Cover Letter, Personal Statement, Exhibit List e todos os documentos organizados, formatados e validados, pronto para envio ao USCIS.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Cover Letter e Personal Statement gerados automaticamente com IA
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Exhibit List organizado automaticamente
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-muted-foreground">
                        Download de PDF combinado com um clique
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="relative">
                  <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-lg border border-border bg-background p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-semibold text-foreground">
                            Pacote de Documentação
                          </h4>
                          <FileCheck className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="mb-3 space-y-2">
                          <div className="flex items-center justify-between rounded bg-muted/50 px-3 py-2">
                            <span className="text-sm">Cover Letter</span>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </div>
                          <div className="flex items-center justify-between rounded bg-muted/50 px-3 py-2">
                            <span className="text-sm">Personal Statement</span>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </div>
                          <div className="flex items-center justify-between rounded bg-muted/50 px-3 py-2">
                            <span className="text-sm">Exhibit List + Documentos</span>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </div>
                        </div>
                        <button className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                          Baixar Pacote Completo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-y border-border bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                Por Que Escolher o DocAI?
              </h2>
              <p className="text-xl text-muted-foreground">
                Desenvolvido especificamente para mudança de status B-1/B-2 → F-1
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Rápido e Eficiente</h3>
                <p className="text-muted-foreground">
                  Gere toda sua documentação em minutos, não em dias. Economize horas de trabalho manual escrevendo Cover Letter e Personal Statement.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Seguro e Privado</h3>
                <p className="text-muted-foreground">
                  Criptografia de nível bancário protege seus documentos sensíveis. Seus dados nunca são compartilhados ou vendidos.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <FileCheck className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Conforme Padrões USCIS</h3>
                <p className="text-muted-foreground">
                  Documentos gerados seguem rigorosamente os padrões e requisitos do USCIS, reduzindo drasticamente o risco de rejeição.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Powered by IA</h3>
                <p className="text-muted-foreground">
                  Inteligência Artificial avançada garante precisão e detecta erros que humanos podem passar despercebidos.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Validação Completa</h3>
                <p className="text-muted-foreground">
                  Validação abrangente e verificação de erros antes do envio. Identifique problemas antes que o USCIS os encontre.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Disponível 24/7</h3>
                <p className="text-muted-foreground">
                  Trabalhe na sua aplicação a qualquer hora, de qualquer lugar. Sem esperar horário comercial ou agendamentos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      {!user && (
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="mb-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                  Economize Tempo e Evite Erros Custosos
                </h2>
                <p className="text-xl text-muted-foreground">
                  Não arrisque sua aprovação por causa de documentação mal feita
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 mb-12">
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="mb-3 text-xl font-semibold text-foreground">
                    ⏱️ Economize Horas de Trabalho
                  </h3>
                  <p className="text-muted-foreground">
                    O que levaria dias para escrever manualmente, nossa IA gera em minutos. Cover Letter, Personal Statement e Exhibit List prontos automaticamente.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="mb-3 text-xl font-semibold text-foreground">
                    ✅ Reduza Risco de Rejeição
                  </h3>
                  <p className="text-muted-foreground">
                    Validação completa antes do envio. Documentos formatados conforme padrões USCIS. Identifique problemas antes que custem sua aprovação.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="mb-3 text-xl font-semibold text-foreground">
                    📄 Documentação Completa
                  </h3>
                  <p className="text-muted-foreground">
                    PDF combinado com Cover Letter, Personal Statement, Exhibit List e todos os documentos organizados. Tudo pronto para envio ao USCIS.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="mb-3 text-xl font-semibold text-foreground">
                    🎯 Foco no Que Importa
                  </h3>
                  <p className="text-muted-foreground">
                    Deixe a documentação conosco e foque no que realmente importa: seus estudos e sua preparação para a mudança de status.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      {!user && (
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-12 text-center">
              <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
                Pronto para Simplificar Sua Mudança de Status?
              </h2>
              <p className="mb-6 text-xl text-muted-foreground">
                Gere sua documentação completa em minutos, não em dias
              </p>
              <div className="mb-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Sem cartão de crédito</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Comece agora</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Resultados em minutos</span>
                </div>
              </div>
              <SignUpButton mode="modal">
                <button className="group mx-auto flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg">
                  Começar Agora - Grátis
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </SignUpButton>
              <p className="mt-4 text-sm text-muted-foreground">
                ✨ Gere sua primeira documentação em menos de 5 minutos
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">DocAI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 DocAI. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
