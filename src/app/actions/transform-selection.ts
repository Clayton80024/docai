"use server";

import { currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type TransformCommand = "rewrite" | "formal" | "uscis" | "simplify";

/**
 * Base system instruction for all transforms (legal safety).
 * Used in every AI rewrite to avoid adding facts, assumptions, or legal claims.
 */
const PROMPT_BASE =
  "You are assisting in the drafting of legal and immigration-related documents. " +
  "Do not add new facts, assumptions, or legal claims. " +
  "Only rewrite the provided text according to the instruction. " +
  "Preserve the original intent and meaning at all times. " +
  "Respond with ONLY the rewritten text, no explanations or quotes.";

const INSTRUCTIONS: Record<TransformCommand, string> = {
  rewrite:
    "Rewrite the selected text while preserving its original meaning. Use clear, professional, and well-structured prose. Do not add new facts or remove relevant details.",
  formal:
    "Rewrite the selected text using a formal tone appropriate for legal petitions and official correspondence. Maintain accuracy, clarity, and a professional legal writing style.",
  uscis:
    "Rewrite the selected text using clear, concise, and objective language suitable for U.S. immigration petitions submitted to USCIS. Maintain factual accuracy and avoid speculative or emotional language.",
  simplify:
    "Rewrite the selected text to make it easier to understand while preserving the original meaning. Use plain, clear language without reducing legal accuracy.",
};

function buildSystemPrompt(command: TransformCommand): string {
  return `${PROMPT_BASE}\n\n${INSTRUCTIONS[command]}`;
}

export async function transformSelectionWithAI(
  applicationId: string,
  text: string,
  command: TransformCommand
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const supabase = createAdminClient();
    const { data: app, error } = await (supabase.from("applications") as any)
      .select("user_id")
      .eq("id", applicationId)
      .single();

    if (error || !app || (app as { user_id?: string }).user_id !== user.id)
      return { success: false, error: "Application not found or unauthorized" };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { success: false, error: "AI service not configured" };

    const system = buildSystemPrompt(command);
    const userContent = `Selected text:\n\n${text}`;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: (err as any)?.error?.message || "AI request failed",
      };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string")
      return { success: false, error: "Invalid AI response" };

    return { success: true, text: content.trim() };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to transform" };
  }
}
