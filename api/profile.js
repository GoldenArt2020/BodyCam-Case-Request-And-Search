import { kv } from "./_lib/kv.js";

const KEY = "profile:requester";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const profile = (await kv.get(KEY)) || null;
      return res.status(200).json(profile);
    }

    if (req.method === "POST") {
      const profile = req.body;
      if (!profile || !profile.name || !profile.email) {
        return res.status(400).json({ error: "Name and email are required" });
      }
      await kv.set(KEY, profile);
      return res.status(200).json(profile);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}