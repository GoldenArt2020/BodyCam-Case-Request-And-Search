export async function tavilySearch({ apiKey, query, maxResults = 6 }) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
      include_answer: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = (data && data.error) || `Tavily search failed (${response.status})`;
    throw new Error(message);
  }

  const results = data.results || [];
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${(r.content || "").slice(0, 600)}`)
    .join("\n\n");
}