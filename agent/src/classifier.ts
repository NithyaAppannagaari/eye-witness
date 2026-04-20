import ollama from 'ollama'

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

    const prompt = `Classify how a webpage uses a photo. Respond with JSON only, no markdown.
Format: {"useType":"editorial"|"commercial"|"ai_training","confidence":0.0-1.0}
editorial = news, journalism, commentary
commercial = ads, product pages, sales
ai_training = AI/ML dataset pages

Page content:
${text}`

    const response = await ollama.chat({
      model: 'llama3.2',
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
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
