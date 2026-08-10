export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  id: string;
  label: string;
  needsKey: boolean;
  models: string[];
  customModel?: boolean;
  baseUrl?: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  { id: 'free', label: 'Umbra Free', needsKey: false, models: ['openai', 'mistral', 'qwen-coder'], baseUrl: 'https://text.pollinations.ai/openai' },
  { id: 'openai', label: 'OpenAI', needsKey: true, models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'], baseUrl: 'https://api.openai.com/v1/chat/completions' },
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true, models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'] },
  { id: 'gemini', label: 'Google Gemini', needsKey: true, models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'groq', label: 'Groq (fast)', needsKey: true, models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], baseUrl: 'https://api.groq.com/openai/v1/chat/completions' },
  { id: 'mistral', label: 'Mistral', needsKey: true, models: ['mistral-small-latest', 'mistral-medium-latest', 'open-mistral-nemo'], baseUrl: 'https://api.mistral.ai/v1/chat/completions' },
  { id: 'ollama', label: 'Ollama (local)', needsKey: false, models: ['llama3.2', 'qwen2.5', 'mistral', 'phi4'], customModel: true },
];

export function providerById(id: string): AIProvider {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export const DEFAULT_AI: AIConfig = {
  provider: 'gemini',
  apiKey: import.meta.env.VITE_GEMINI_KEY || '',
  model: 'gemini-2.0-flash',
};

export const FREE_AI: AIConfig = { provider: 'free', apiKey: '', model: 'openai' };

class QuotaExceededError extends Error {}

async function readLines(response: Response, onLine: (line: string) => string): Promise<string> {
  if (!response.body) throw new Error('Response body unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const delta = onLine(trimmed);
      if (delta) text += delta;
    }
  }
  return text;
}

function ssePayload(line: string): string | null {
  if (!line.startsWith('data:')) return null;
  const p = line.slice(5).trim();
  return p && p !== '[DONE]' ? p : null;
}

function safeParse<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

function isTransientError(e: unknown): boolean {
  if (e instanceof QuotaExceededError) return true;
  if (e instanceof TypeError) return true;
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  return false;
}

async function aiChatOnceWithRetry(config: AIConfig, system: string, user: string, onToken?: (delta: string) => void): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await aiChatOnce(config, system, user, onToken);
    } catch (e) {
      lastErr = e;
      if (!isTransientError(e)) throw e;
    }
  }
  throw lastErr;
}

export async function aiChat(config: AIConfig, system: string, user: string, onToken?: (delta: string) => void): Promise<string> {
  try {
    return await aiChatOnce(config, system, user, onToken);
  } catch (e) {
    if (config.provider !== 'free' && isTransientError(e)) {
      return aiChatOnceWithRetry(FREE_AI, system, user, onToken);
    }
    throw e;
  }
}

async function aiChatOnce(config: AIConfig, system: string, user: string, onToken?: (delta: string) => void): Promise<string> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), onToken ? 60000 : 40000);
  const provider = providerById(config.provider);
  const signal = ctrl.signal;
  const stream = !!onToken;

  let response: Response;
  let text: string;

  try {
    if (provider.id === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 300,
          system,
          messages: [{ role: 'user', content: user }],
          stream,
        }),
      });
      if (!response.ok) {
        const err = safeParse<AnthropicResponse>(await response.text()) ?? {};
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }
      if (stream) {
        text = await readLines(response, (line) => {
          const payload = ssePayload(line);
          if (!payload) return '';
          const d = safeParse<{ type?: string; delta?: { type?: string; text?: string } }>(payload);
          if (d?.type === 'content_block_delta' && d.delta?.type === 'text_delta' && d.delta.text) {
            onToken?.(d.delta.text);
            return d.delta.text;
          }
          return '';
        });
      } else {
        const data: AnthropicResponse = await response.json();
        if (!data.content) throw new Error(`HTTP ${response.status}`);
        text = data.content.map((c) => (c.type === 'text' && c.text ? c.text : '')).join(' ').trim();
      }
    } else if (provider.id === 'gemini') {
      const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      const url = stream ? `${base}?alt=sse&key=${encodeURIComponent(config.apiKey)}` : `${base}?key=${encodeURIComponent(config.apiKey)}`;
      response = await fetch(url, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
        }),
      });
      if (!response.ok) {
        const err = safeParse<GeminiResponse>(await response.text()) ?? {};
        if (response.status === 429) throw new QuotaExceededError(err.error?.message ?? 'Gemini quota exceeded');
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }
      if (stream) {
        text = await readLines(response, (line) => {
          const payload = ssePayload(line);
          if (!payload) return '';
          const d = safeParse<GeminiResponse>(payload);
          if (!d) return '';
          if (d.error?.message) throw new Error(d.error.message);
          const part = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (part) {
            onToken?.(part);
            return part;
          }
          return '';
        });
      } else {
        const data: GeminiResponse = await response.json();
        if (!data.candidates?.[0]?.content?.parts) throw new Error(data.error?.message ?? `HTTP ${response.status}`);
        text = data.candidates[0].content.parts.map((p) => p.text ?? '').join(' ').trim();
      }
    } else if (provider.id === 'ollama') {
      response = await fetch('http://localhost:11434/api/chat', {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream }),
      });
      if (!response.ok) {
        const err = safeParse<OllamaResponse>(await response.text()) ?? {};
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }
      if (stream) {
        text = await readLines(response, (line) => {
          const d = safeParse<OllamaResponse & { done?: boolean }>(line);
          const part = d?.message?.content ?? '';
          if (part) {
            onToken?.(part);
            return part;
          }
          return '';
        });
      } else {
        const data: OllamaResponse = await response.json();
        if (!data.message?.content) throw new Error(`HTTP ${response.status}`);
        text = data.message.content.trim();
      }
    } else {
      const url = provider.baseUrl ?? 'https://api.openai.com/v1/chat/completions';
      response = await fetch(url, {
        signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 300, temperature: 0.7, stream }),
      });
      if (!response.ok) {
        const err = safeParse<OpenAiResponse>(await response.text()) ?? {};
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }
      if (stream) {
        text = await readLines(response, (line) => {
          const payload = ssePayload(line);
          if (!payload) return '';
          const d = safeParse<OpenAiResponse & { choices?: { delta?: { content?: string } }[] }>(payload);
          const delta = d?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            onToken?.(delta);
            return delta;
          }
          return '';
        });
      } else {
        const data: OpenAiResponse = await response.json();
        if (!data.choices?.[0]?.message?.content) throw new Error(data.error?.message ?? `HTTP ${response.status}`);
        text = data.choices[0].message.content.trim();
      }
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  } finally {
    window.clearTimeout(timer);
  }

  text = text.trim();
  if (!text) throw new Error('Empty response from provider');
  return text;
}

export async function testAI(config: AIConfig): Promise<string> {
  return aiChat(config, 'You are a connection test. Reply with exactly one word: OK.', 'Ping');
}
