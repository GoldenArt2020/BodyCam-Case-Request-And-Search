export async function groqComplete({ apiKey, model = "llama-3.3-70b-versatile", systemPrompt, userPrompt, maxRetries = 3 }) {
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const waitMs = 2000 * Math.pow(2, attempt);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error("Groq is rate-limited right now. Try again in a minute.");
    }

    const data = await response.json();
    if (!response.ok) {
      const message = (data && data.error && data.error.message) || `Groq request failed (${response.status})`;
      throw new Error(message);
    }

    return data?.choices?.[0]?.message?.content || "";
  }

  throw new Error("Groq is rate-limited right now. Try again in a minute.");
}

export function extractJson(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const first = cleaned.indexOf("[");
    const last = cleaned.lastIndexOf("]");
    if (first >= 0 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (e2) {}
    }
    const first2 = cleaned.indexOf("{");
    const last2 = cleaned.lastIndexOf("}");
    if (first2 >= 0 && last2 > first2) {
      try { return JSON.parse(cleaned.slice(first2, last2 + 1)); } catch (e3) {}
    }
    return null;
  }
}