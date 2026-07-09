import asyncio
import os
import httpx
from config import settings

async def main():
    api_key = settings.OPENROUTER_API_KEY
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    models = ["google/gemma-2-9b-it:free", "meta-llama/llama-3.1-8b-instruct:free", "huggingfaceh4/zephyr-7b-beta:free", "nousresearch/hermes-3-llama-3.1-405b:free", "liquid/lfm-40b:free"]
    
    for model in models:
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=10)
                print(f"{model}: {res.status_code}")
                if res.status_code != 200:
                    print(res.text)
        except Exception as e:
            print(f"{model}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
