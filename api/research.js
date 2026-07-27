import { kv } from "./_lib/kv.js";
import { tavilySearch } from "./_lib/tavily.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!tavilyKey) return res.status(500).json({ error: "TAVILY_API_KEY is not set on the server" });
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });

  const { mode, focus, caseItem } = req.body || {};

  try {
    if (mode === "scan") {
      const query = `true crime case ${focus || "United States"} convicted OR sentenced OR "guilty plea" 911 call OR body camera OR interrogation footage released police department not widely covered`;
      const searchContext = await tavilySearch({ apiKey: tavilyKey, query, maxResults: 6 });

      const systemPrompt = `You research true crime cases in the United States for a content researcher building narrated documentary-style videos. From the search results given, extract real, verifiable cases that fit a coverage gap: either zero YouTube true-crime coverage, or coverage by at most one or two channels. Only use cases actually present in the search results — do not invent cases.

A case only qualifies if the search results give you ALL of the following: a named victim or suspect (or, if unidentified, a specific incident description with named location), a specific date (month/year minimum), and a specific law-enforcement agency or jurisdiction. If the search results are too thin to support these details — for example, a vague social post, a one-line mention, or a summary that would require guessing — DO NOT include that case. It is better to return fewer cases, or an empty list, than to include a weak or speculative one. Never write a summary that says details are unavailable; if you would have to write that, drop the case instead.

Prioritize cases that have real recorded law-enforcement footage tied to them: 911 calls, body-worn camera, dash camera, or interrogation/interview room video. This footage does not need to be bodycam specifically — 911 audio and interrogation-room footage both qualify, since all three are the raw material used to build a narrated documentary episode. Body-worn cameras were not in meaningful use by US police departments before approximately 2014, so if a case predates 2014 and its only footage type is bodycam, do not include it. 911 calls, interrogation footage, and dash cam are not bound by that 2014 floor.

Favor cases with a strong narrative arc suited to a documentary retelling: a clear hook (a secret revealed, a betrayal, a forensic or digital breakthrough, a wiretap or jailhouse confession). Do not include cases whose central subject matter is child sexual abuse material or child sexual exploitation, even if footage exists — exclude these entirely regardless of coverage gap.

ONLY include cases that are fully closed and resolved. The search results must show one of: a conviction and sentencing already handed down, a finalized guilty plea with sentencing complete, or an acquittal/dismissal that concluded the case. If the search results show the case is still under investigation, a suspect has been arrested but not yet tried, a trial is upcoming or in progress, an appeal is pending, or the outcome is otherwise unresolved, DO NOT include that case — drop it even if every other detail is strong. When in doubt about whether a case is fully closed, leave it out.

Respond with ONLY valid JSON: {"cases": [{"name": string, "location": string, "date": string, "summary": string (2 sentences max, concrete facts only), "coverage": "unreleased"|"low_coverage"|"new", "footage_type": string (e.g. "911 call", "bodycam", "interrogation room", "dash cam", or a combination), "case_status": string (must describe the final resolved outcome, e.g. "convicted, sentenced to life" or "pled guilty, sentenced to 15 years")}]}. Return up to 6 cases. If the search results don't support any qualifying cases, return {"cases": []}.`;

      const userPrompt = `Search focus: ${focus || "any region, any case type"}\n\nSearch results:\n${searchContext}`;

      const text = await groqComplete({ apiKey: groqKey, systemPrompt, userPrompt });
      const parsed = extractJson(text);
      const cases = (parsed && parsed.cases) || [];
      return res.status(200).json({ cases });
    }

    if (mode === "draft") {
      if (!caseItem) return res.status(400).json({ error: "Missing caseItem" });

      const profile = (await kv.get("profile:requester")) || null;

      const query = `${caseItem.name} ${caseItem.location} police department public records custodian body camera footage request nextrequest OR "public records request" OR "records request" email`;
      const searchContext = await tavilySearch({ apiKey: tavilyKey, query, maxResults: 6 });

      const requesterBlock = profile
        ? `Requester information (use this exactly in the letter, no placeholders):\nName: ${profile.name}\nOrganization: ${profile.organization || ""}\nAddress: ${profile.address || ""}\nCity/State/ZIP: ${profile.city || ""}, ${profile.state || ""} ${profile.zip || ""}\nEmail: ${profile.email}\nPhone: ${profile.phone || ""}`
        : `No requester information was provided. Use placeholders [Your Name], [Your Organization], [Your Address], [Your Email/Phone] in the letter.`;

      const systemPrompt = `You are drafting a formal public records request for body-worn camera footage under the applicable US state open-records law. Use the search results to identify the correct law-enforcement agency, its records custodian, and the state's open-records statute (state FOIA, CPRA, PIA, Sunshine Law, or whichever applies).

Also determine HOW to file the request, based on the search results:
- If the agency uses a third-party records portal (for example a NextRequest instance, which looks like a subdomain such as "agencyname.nextrequest.com", or GovQA, JustFOIA, or a similar system), set "filing_method" to "portal" and "portal_url" to the exact URL of that agency's request-submission page. Set "submission_email" to null.
- If the agency accepts requests by email with no dedicated portal, set "filing_method" to "email" and "submission_email" to the exact email address found in the search results. Set "portal_url" to null.
- If you cannot determine either with reasonable confidence from the search results, set "filing_method" to "unknown" and both URL/email fields to null.

Draft a complete, professional request letter that: names the specific case, date, and requests body-worn camera footage from the arrest and on-scene investigation; cites the statute; identifies the requester using the information given below; asks for a response within the statutory deadline; asks for a fee waiver or fee estimate if applicable.

${requesterBlock}

Respond with ONLY valid JSON: {"department": string, "custodian_title": string, "statute": string, "response_deadline": string, "filing_method": "portal"|"email"|"unknown", "portal_url": string|null, "submission_email": string|null, "letter": string}. If the search results don't clearly identify the agency, make your best reasonable inference based on the location given and note the uncertainty briefly at the top of the letter in brackets.`;

      const userPrompt = `Case: ${caseItem.name}. Location: ${caseItem.location}. Date: ${caseItem.date}. Status: ${caseItem.case_status}.\n\nSearch results:\n${searchContext}`;

      const text = await groqComplete({ apiKey: groqKey, systemPrompt, userPrompt });
      const parsed = extractJson(text);
      if (!parsed || !parsed.letter) {
        return res.status(200).json({ error: "Could not draft a letter from the search results" });
      }
      return res.status(200).json(parsed);
    }
    return res.status(400).json({ error: "Missing or invalid 'mode' (expected 'scan' or 'draft')" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Request failed" });
  }
}