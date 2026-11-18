import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://localhost:4318/v1', apiKey: process.env.OPENAI_API_KEY });
const result = await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello from AegisFlow' }] });
console.log(result.choices[0]?.message.content);
