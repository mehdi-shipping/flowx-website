import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 300 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a QA reviewer for LC examination reports. Review each finding: 1) Is it genuine or a false positive? Common false positives: treating two LCs as one, flagging multi-LC arrangements as conflicts, marking insurance missing when LC says applicant covers it, treating commingled cargo as partial shipment. 2) Is severity correct? 3) Is UCP article citation accurate? Remove findings below 80% confidence. Add confidence_score (0-1) to each remaining finding. Respond ONLY valid JSON no markdown fences, same structure as input but with confidence_score added to each discrepancy and false positives removed.`;

function parseJSON(text) {
  let cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No JSON found in response");
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { analysis } = req.body;

    if (!analysis) {
      return res.status(400).json({ error: "No analysis data provided." });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Review and verify this LC examination report:\n\n${JSON.stringify(analysis, null, 2)}` }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Verify raw:", responseText.slice(0, 300));

    const result = parseJSON(responseText);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Verify error:", err);
    if (err.name === "AbortError") return res.status(504).json({ error: "Verification timed out." });
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Verification failed. Please try again." });
  }
}
