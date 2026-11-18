from openai import OpenAI

client = OpenAI(base_url="http://localhost:4318/v1", api_key="your-provider-key")
response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "user", "content": "Hello from AegisFlow"}])
print(response.choices[0].message.content)
