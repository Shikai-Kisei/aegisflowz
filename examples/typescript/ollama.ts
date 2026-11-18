import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://localhost:4318/v1', apiKey: 'ollama', dangerouslyAllowBrowser: false });
const result = await client.chat.completions.create({ model: 'llama3.2', messages: [{ role: 'user', content: 'Hello from AegisFlow' }] });
console.log(result.choices[0]?.message.content);
// Set AEGISFLOW_UPSTREAM_URL=http://127.0.0.1:11434/v1 and expose Ollama's OpenAI-compatible endpoint.
