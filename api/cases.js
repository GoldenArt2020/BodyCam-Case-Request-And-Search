import { kv } from "./_lib/kv.js";

const KEY = "cases:all";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const cases = (await kv.get(KEY)) || [];
      return res.status(200).json(cases);
    }

    if (req.method === "POST") {
      const newCase = req.body;
      if (!newCase || !newCase.id) {
        return res.status(400).json({ error: "Missing case data or id" });
      }
      const cases = (await kv.get(KEY)) || [];
      const filtered = cases.filter((c) => c.id !== newCase.id);
      const next = [newCase, ...filtered];
      await kv.set(KEY, next);
      return res.status(200).json(next);
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      const cases = (await kv.get(KEY)) || [];
      const next = cases.filter((c) => c.id !== id);
      await kv.set(KEY, next);
      return res.status(200).json(next);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}