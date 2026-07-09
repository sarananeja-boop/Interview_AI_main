import asyncio
import os
import json
import httpx

from config import settings

async def main():
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        print("NO API KEY")
        return
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    models = ["google/gemma-7b-it:free", "meta-llama/llama-3-8b-instruct:free", "mistralai/mistral-7b-instruct:free"]
    
    for model in models:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "Return a JSON object with 'test': 'success'"},
                {"role": "user", "content": "Go."}
            ],
            "response_format": {"type": "json_object"}
        }
        
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=10)
                print(f"Model: {model} -> Status: {res.status_code}")
                if res.status_code == 200:
                    print(res.json()["choices"][0]["message"]["content"])
                else:
                    print(res.text)
            except Exception as e:
                print(f"Model: {model} -> Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
