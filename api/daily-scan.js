import { kv } from "./_lib/kv.js";
import { tavilySearch } from "./_lib/tavily.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const FOCUS_ROTATION = [
  "Midwest United States, any case type involving a police response",
  "Southern United States, home invasion or robbery cases",
  "West Coast United States, missing person or cold case",
  "Northeast United States, domestic violence or intimate partner case",
  "Southwest United States, officer-involved case with unclear public coverage",
  "Any US state, case involving a wrongful conviction or overturned charge",
  "Any US state, unresolved case older than five years",
];

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!tavilyKey || !groqKey) {
    return res.status(500).json({ error: "TAVILY_API_KEY or GROQ_API_KEY is not set on the server" });
  }

  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % FOCUS_ROTATION.length;
  const focus = FOCUS_ROTATION[dayIndex];

  try {
    const query = `true crime case ${focus} body camera footage not released local news`;
    const searchContext = await tavilySearch({ apiKey: tavilyKey, query, maxResults: 6 });

    const systemPrompt = `You research true crime cases in the United States for a content researcher. From the search results given, extract real, verifiable cases that fit a coverage gap: either zero YouTube true-crime coverage, or coverage by at most one or two channels. Only use cases actually present in the search results — do not invent cases. Prioritize cases where body-worn camera footage exists but has not been publicly released or widely covered on YouTube. Respond with ONLY valid JSON: {"cases": [{"name": string, "location": string, "date": string, "summary": string (2 sentences max), "coverage": "unreleased"|"low_coverage"|"new", "bodycam_worn": boolean, "case_status": string}]}. Return up to 6 cases. If the search results don't support any real cases, return {"cases": []}.`;

    const userPrompt = `Search focus: ${focus}\n\nSearch results:\n${searchContext}`;

    const text = await groqComplete({ apiKey: groqKey, systemPrompt, userPrompt });
    const parsed = extractJson(text);
    const cases = (parsed && parsed.cases) || [];

    const today = new Date().toISOString().slice(0, 10);
    await kv.set("candidates:latest", { date: today, focus, cases });
    await kv.set(`candidates:${today}`, { date: today, focus, cases });

    return res.status(200).json({ ok: true, date: today, focus, count: cases.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Daily scan failed" });
  }
}