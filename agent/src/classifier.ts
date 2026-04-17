import ollama from 'ollama'

const MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2'

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)
}

export type UseType = 'editorial' | 'commercial' | 'ai_training'

export interface Classification {
  useType: UseType
  confidence: number
}

export async function classifyUse(pageHtml: string): Promise<Classification> {
  try {
    const text = stripHtml(pageHtml)

    const response = await ollama.chat({
      model: MODEL,
      format: 'json',
      messages: [
        {
          role: 'system',
          content:
            'You classify how a webpage uses a photo. Respond with JSON only: { "useType": "editorial" | "commercial" | "ai_training", "confidence": 0.0-1.0 }. ' +
            'editorial = news, journalism, commentary. commercial = ads, product pages, sales. ai_training = AI/ML dataset pages.',
        },
        {
          role: 'user',
          content: `Classify the use type of a photo on this page:\n\n${text}`,
        },
      ],
    })

    const parsed = JSON.parse(response.message.content) as { useType?: string; confidence?: number }

    const useType = (['editorial', 'commercial', 'ai_training'] as UseType[]).includes(
      parsed.useType as UseType
    )
      ? (parsed.useType as UseType)
      : 'editorial'

    return { useType, confidence: parsed.confidence ?? 0 }
  } catch (err) {
    console.warn('[classifier] Ollama call failed, defaulting to editorial:', err)
    return { useType: 'editorial', confidence: 0 }
  }
}
