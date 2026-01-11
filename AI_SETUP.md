# AI Setup for Application Form

The application form uses AI (OpenAI) to generate detailed answers based on user selections in Step 2.

## Setup Instructions

### 1. Get Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **Create new secret key**
5. Copy the API key (starts with `sk-...`)

### 2. Add to Environment Variables

Add your OpenAI API key to `.env.local`:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
```

### 3. Restart Your Dev Server

After adding the API key:

```bash
# Stop the server (Ctrl+C)
npm run dev
```

## How It Works

### Step 2: Ties to Country

1. **User makes selections:**
   - Family members (checkboxes)
   - Property & assets (checkboxes)
   - Employment commitments (checkboxes)
   - Optional additional information

2. **User clicks "Generate with AI":**
   - Selections are sent to OpenAI API
   - AI generates detailed, professional answers for all three questions
   - Answers appear in the text areas

3. **User can edit:**
   - All AI-generated answers are editable
   - User can modify any part of the generated text
   - User can also write answers manually without using AI

## Features

- **Structured Selections**: Easy checkboxes for common ties
- **AI Enhancement**: One-click generation of detailed answers
- **Fully Editable**: Users maintain full control
- **Graceful Degradation**: Works even if AI is not configured (users can write manually)

## Cost Considerations

- Uses `gpt-4o-mini` model (cost-effective)
- Each generation costs approximately $0.001-0.003 per request
- Consider adding rate limiting for production use

## Alternative: Without AI

If you don't want to use AI:
- Users can still write answers manually
- The form works perfectly without AI configuration
- Just remove or don't set `OPENAI_API_KEY`

## Troubleshooting

### Error: "AI service not configured"
- Make sure `OPENAI_API_KEY` is set in `.env.local`
- Restart your dev server after adding the key

### Error: "Failed to generate answers"
- Check your OpenAI API key is valid
- Check your OpenAI account has credits
- Check API rate limits

### AI not generating good answers
- The AI uses the selections you make
- Make sure to select relevant options before generating
- You can always edit the generated answers

