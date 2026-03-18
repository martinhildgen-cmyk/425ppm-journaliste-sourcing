"""
Abstraction LLM — interface commune pour Gemini, OpenAI (GPT) et Mistral.

Permet de switcher de provider sans modifier le code appelant.
Usage:
    from app.services.llm import get_llm_service
    llm = get_llm_service()
    result = await llm.complete(system_prompt, user_prompt)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class LLMResponse:
    """Réponse standardisée d'un appel LLM."""

    content: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int


class BaseLLMService(ABC):
    """Interface commune pour tous les providers LLM."""

    provider: str

    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        json_mode: bool = True,
    ) -> LLMResponse:
        """Envoie un prompt et retourne la réponse structurée."""
        ...


class GeminiService(BaseLLMService):
    """Google Gemini API (Flash-Lite / Flash)."""

    provider = "gemini"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-lite"):
        self.api_key = api_key
        self.model = model

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        json_mode: bool = True,
    ) -> LLMResponse:
        url = f"{self.BASE_URL}/models/{self.model}:generateContent"
        payload: dict = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if json_mode:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, params={"key": self.api_key})
            resp.raise_for_status()
            data = resp.json()

        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage = data.get("usageMetadata", {})
        return LLMResponse(
            content=content,
            model=self.model,
            provider=self.provider,
            input_tokens=usage.get("promptTokenCount", 0),
            output_tokens=usage.get("candidatesTokenCount", 0),
        )


class OpenAIService(BaseLLMService):
    """OpenAI GPT API (GPT-4.1 nano / mini)."""

    provider = "openai"
    BASE_URL = "https://api.openai.com/v1"

    def __init__(self, api_key: str, model: str = "gpt-4.1-nano"):
        self.api_key = api_key
        self.model = model

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        json_mode: bool = True,
    ) -> LLMResponse:
        url = f"{self.BASE_URL}/chat/completions"
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return LLMResponse(
            content=content,
            model=self.model,
            provider=self.provider,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )


class MistralService(BaseLLMService):
    """Mistral API (Small 3.2 / Medium 3.1)."""

    provider = "mistral"
    BASE_URL = "https://api.mistral.ai/v1"

    def __init__(self, api_key: str, model: str = "mistral-small-latest"):
        self.api_key = api_key
        self.model = model

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        json_mode: bool = True,
    ) -> LLMResponse:
        url = f"{self.BASE_URL}/chat/completions"
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return LLMResponse(
            content=content,
            model=self.model,
            provider=self.provider,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )


def get_llm_service(provider: str | None = None, model: str | None = None) -> BaseLLMService:
    """Factory — retourne le service LLM configuré.

    Args:
        provider: "gemini", "openai", ou "mistral". Défaut: settings.LLM_PROVIDER
        model: Nom du modèle spécifique. Défaut: modèle par défaut du provider.
    """
    provider = provider or settings.LLM_PROVIDER
    api_key = settings.LLM_API_KEY

    if provider == "gemini":
        return GeminiService(api_key, model=model or "gemini-2.5-flash-lite")
    elif provider == "openai":
        return OpenAIService(api_key, model=model or "gpt-4.1-nano")
    elif provider == "mistral":
        return MistralService(api_key, model=model or "mistral-small-latest")
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")
