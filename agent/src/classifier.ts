export type UseType = 'editorial' | 'commercial' | 'ai_training'

export function classifyUseByUrl(pageUrl: string): UseType {
  const u = pageUrl.toLowerCase()
  if (u.includes('dataset') || u.includes('training') || u.includes('/ai/') || u.includes('ml-data'))
    return 'ai_training'
  if (u.includes('shop') || u.includes('store') || u.includes('product') || u.includes('/ad/') || u.includes('buy') || u.includes('checkout'))
    return 'commercial'
  return 'editorial'
}
