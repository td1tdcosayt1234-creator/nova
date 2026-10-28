/* ============ Nova Engine — AI providers (Bring-Your-Own-Key) ============ */

export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'groq' | 'ollama' | 'custom'

export interface AISettings {
  provider: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
}

export const PROVIDER_INFO: Record<ProviderKind, {
  label: string
  needsKey: boolean
  defaultBase: string
  defaultModel: string
  models: string[]
  note: string
}> = {
  openai: {
    label: 'OpenAI',
    needsKey: true,
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    note: 'platform.openai.com theke API key nao.'
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    needsKey: true,
    defaultBase: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-haiku-latest',
    models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514', 'claude-sonnet-4-5'],
    note: 'console.anthropic.com theke API key nao.'
  },
  gemini: {
    label: 'Google Gemini',
    needsKey: true,
    defaultBase: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    note: 'aistudio.google.com/apikey theke free key pao.'
  },
  openrouter: {
    label: 'OpenRouter (300+ models)',
    needsKey: true,
    defaultBase: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-8b-instruct'],
    note: 'openrouter.ai/keys theke key nao — ek key diye sob model.'
  },
  groq: {
    label: 'Groq (ultra fast)',
    needsKey: true,
    defaultBase: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'qwen2.5-coder-32b'],
    note: 'console.groq.com/keys theke free key pao.'
  },
  ollama: {
    label: 'Ollama (Local)',
    needsKey: false,
    defaultBase: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    models: ['llama3.1', 'qwen2.5-coder', 'mistral', 'phi3'],
    note: 'Local e cholle — key lagbe na. Ollama chalu thakte hobe.'
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    needsKey: false,
    defaultBase: 'http://localhost:8080/v1',
    defaultModel: 'default',
    models: ['default'],
    note: 'Jekono OpenAI-compatible server (vLLM, LM Studio, LM, LiteLLM...) — Base URL set koro.'
  }
}

const LS_KEY = 'nova.ai.settings'

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return Object.assign({ provider: 'openai', baseUrl: '', apiKey: '', model: '' }, JSON.parse(raw))
  } catch { /* ignore */ }
  return { provider: 'openai', baseUrl: '', apiKey: '', model: '' }
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

export function normalizeSettings(s: AISettings): AISettings {
  const info = PROVIDER_INFO[s.provider] || PROVIDER_INFO.openai
  return {
    provider: s.provider,
    baseUrl: (s.baseUrl || '').trim() || info.defaultBase,
    apiKey: (s.apiKey || '').trim(),
    model: (s.model || '').trim() || info.defaultModel
  }
}

export function aiConfigured(s: AISettings): boolean {
  const n = normalizeSettings(s)
  const info = PROVIDER_INFO[n.provider]
  if (info.needsKey && !n.apiKey) return false
  return true
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

async function transport(url: string, headers: Record<string, string>, body: string): Promise<{ ok: boolean; status: number; text: string }> {
  const desktop = (window as any).nova?.aiFetch
  if (desktop) {
    return await desktop({ url, headers, body })
  }
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text }
}

export async function chatComplete(
  sRaw: AISettings,
  system: string,
  messages: ChatMsg[],
  temperature = 0.7
): Promise<string> {
  const s = normalizeSettings(sRaw)
  const base = s.baseUrl.replace(/\/+$/, '')
  let url = ''
  const headers: Record<string, string> = {}
  let body: any

  if (s.provider === 'anthropic') {
    url = `${base}/v1/messages`
    headers['x-api-key'] = s.apiKey
    headers['anthropic-version'] = '2023-06-02'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
    body = { model: s.model, max_tokens: 8192, temperature, system, messages }
  } else if (s.provider === 'gemini') {
    url = `${base}/models/${s.model}:generateContent?key=${encodeURIComponent(s.apiKey)}`
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature, maxOutputTokens: 8192 }
    }
  } else {
    // openai + ollama (openai-compatible)
    url = `${base}/chat/completions`
    if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}`
    body = { model: s.model, temperature, messages: [{ role: 'system', content: system }, ...messages] }
  }

  const res = await transport(url, headers, JSON.stringify(body))
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(res.text)
      msg = j?.error?.message || j?.message || res.text.slice(0, 300)
    } catch {
      if (res.text) msg = res.text.slice(0, 300)
    }
    throw new Error(`AI request failed: ${msg}`)
  }

  const j = JSON.parse(res.text)
  if (s.provider === 'anthropic') {
    return (j.content || []).map((c: any) => c.text || '').join('')
  }
  if (s.provider === 'gemini') {
    return (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('')
  }
  return j.choices?.[0]?.message?.content ?? ''
}

export async function testConnection(s: AISettings): Promise<string> {
  const reply = await chatComplete(s, 'You are a test echo. Reply with exactly: NOVA OK', [{ role: 'user', content: 'ping' }], 0)
  return reply.trim().slice(0, 100) || '(empty reply)'
}
