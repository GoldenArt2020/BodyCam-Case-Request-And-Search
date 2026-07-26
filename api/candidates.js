import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const latest = await kv.get("candidates:latest");
    return res.status(200).json(latest || null);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Could not load candidates" });
  }
}