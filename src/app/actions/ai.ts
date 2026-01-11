"use server";

import { currentUser } from "@clerk/nextjs/server";

interface TiesSelections {
  familyMembers: string[];
  assetTypes: string[];
  employmentTypes: string[];
  additionalInfo?: string;
}

/**
 * Generate detailed answers about ties to country using AI
 * Based on user's selections from structured form
 */
export async function generateTiesAnswers(selections: TiesSelections) {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "AI service not configured. Please add OPENAI_API_KEY to .env.local",
      };
    }

    // Build the prompt based on selections
    const prompt = `You are helping a visa applicant write answers about their ties to their home country. The applicant may not be fluent in English, so use SIMPLE GRAMMAR and BASIC WORDS, but write detailed answers.

IMPORTANT INSTRUCTIONS:
- Use simple grammar (present tense, simple sentences)
- Use basic, everyday words (avoid complex vocabulary)
- Write at least 100 words for EACH answer
- Make it detailed and specific
- Use short sentences (10-15 words each)
- Connect sentences with simple words like "and", "but", "because"
- Explain things clearly with examples
- Use simple words: "have" not "possess", "need" not "require", "come back" not "return"

Based on the following selections, generate detailed answers in SIMPLE ENGLISH:

Family Members Selected: ${selections.familyMembers.join(", ") || "None specified"}
Asset Types Selected: ${selections.assetTypes.join(", ") || "None specified"}
Employment Types Selected: ${selections.employmentTypes.join(", ") || "None specified"}
Additional Information: ${selections.additionalInfo || "None"}

Generate three detailed answers (minimum 100 words each) using SIMPLE GRAMMAR:

Question 1: Do you have family members (spouse, children, parents) in your home country?
Answer: [Write at least 100 words. Use simple grammar. Explain who your family members are, where they live, and your relationship to them. State factual information about their residence and any dependency relationships. Use objective language like "My [family member] resides in [location]" NOT "they are very important to me". Use simple words and short sentences.]

Question 2: Do you own property or have financial assets in your home country?
Answer: [Write at least 100 words. Use simple grammar. Explain what property or assets you own, where they are located, their approximate value, and any management obligations. State ownership facts like "I own [property type] in [location]" NOT emotional statements. Use simple words and short sentences.]

Question 3: Do you have employment or business commitments in your home country that require your return?
Answer: [Write at least 100 words. Use simple grammar. Explain what work or business you have, your contractual obligations, when you need to return, and any formal commitments. State objective facts like "I have employment obligations" NOT emotional statements. Use simple words and short sentences.]

Format the response as JSON with three fields: question1, question2, question3.`;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using cost-effective model
        messages: [
          {
            role: "system",
            content:
              "You are a professional visa application assistant. Generate answers in SIMPLE, CLEAR English using basic vocabulary and short sentences. The applicant may not be fluent in English, so make your answers easy to understand for non-native speakers. Use everyday words, avoid complex terms, and keep sentences short.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API error:", error);
      return {
        success: false,
        error: error.error?.message || "Failed to generate answers",
      };
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        success: false,
        error: "Invalid response from AI service",
      };
    }

    try {
      const content = JSON.parse(data.choices[0].message.content);

      return {
        success: true,
        answers: {
          question1: content.question1 || "",
          question2: content.question2 || "",
          question3: content.question3 || "",
        },
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      return {
        success: false,
        error: "Failed to parse AI response",
      };
    }
  } catch (error: any) {
    console.error("Error generating AI answers:", error);
    return {
      success: false,
      error: error.message || "Failed to generate answers",
    };
  }
}

