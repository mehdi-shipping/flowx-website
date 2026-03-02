import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior LC document examiner with 20+ years at a major bank. Perform UCP 600 compliance review. Check: 1) Document completeness per 46A. 2) Date logic: LC issue > shipment > BL > docs > presentation > expiry. 3) Cross-doc consistency Art 14d: beneficiary, goods desc, quantity, amount, vessel, ports. 4) BL compliance Art 19-25. 5) Invoice compliance Art 18. 6) Certificate of Origin. 7) Insurance Art 28 — FIRST check if LC says applicant covers insurance locally, if so beneficiary does NOT need to present it. 8) Other required docs. 9) Tolerances Art 30. 10) 47A conditions. Severity: critical=automatic rejection, major=examiner will flag, minor=may or may not flag, observation=worth noting. NOT A DISCREPANCY: different quantities under different LCs, different invoices under different LCs, charter party BL when LC permits, commingled cargo when LC permits, BL date before LC issue unless LC prohibits. Maximum 10 findings per LC. Respond ONLY valid JSON no markdown fences: {"analysis_per_lc": [{"lc_reference": "", "issuing_bank": "", "verdict": "compliant|discrepant|incomplete", "summary": "", "document_checklist": [{"document_name": "", "status": "presented|missing|unverifiable", "matched_file": "", "notes": ""}], "discrepancies": [{"id": 1, "severity": "critical|major|minor|observation", "title": "", "ucp_article": "", "lc_requirement": "", "actual_value": "", "explanation": "", "affected_document": "", "recommended_action": ""}]}], "cross_lc_observations": [""], "recommended_actions": [{"priority": 1, "action": "", "rationale": ""}]}`;

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
    const { classification, parsing, documents } = req.body;

    if (!classification || !parsing || !documents) {
      return res.status(400).json({ error: "Missing required phase data." });
    }

    const docTexts = documents.map((doc, i) => {
      let text = doc.text && doc.text.trim() ? doc.text.trim() : "[No text extracted]";
      if (text.length > 6000) {
        text = text.slice(0, 6000) + "\n[...truncated]";
      }
      return `--- DOCUMENT ${i + 1}: ${doc.name || "unnamed"} ---\n${text}`;
    }).join("\n\n");

    const userMessage = `Phase 1 classification:\n${JSON.stringify(classification, null, 2)}\n\nPhase 2 parsing:\n${JSON.stringify(parsing, null, 2)}\n\nDocument texts:\n${docTexts}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let message;
    try {
      message = await client.messages.create(
        {
          model: "claude-opus-4-6",
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Check raw:", responseText.slice(0, 300));

    const result = parseJSON(responseText);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Check error:", err);
    if (err.name === "AbortError") return res.status(504).json({ error: "Compliance check timed out." });
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Compliance check failed. Please try again." });
  }
}
