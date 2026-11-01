export function isOpenAIConfigured() {
  const apiKey = process.env.OPENAI_API_KEY
  return Boolean(apiKey) && !apiKey?.startsWith('YOUR_')
}
