import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 300 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior LC document examiner with 20+ years at a major international bank. You analyze one Letter of Credit and its associated documents at a time.

TASK: Parse the LC requirements, match documents, and check UCP 600 compliance in one pass.

STEP 1 — PARSE THE LC:
Extract: lc_number, issuing_bank, advising_bank, applicant, beneficiary, amount, currency, tolerance_percent, expiry_date, latest_shipment_date, port_of_loading, port_of_discharge, partial_shipments (allowed/not), goods_description (exact from 45A), incoterms, quantity_mt. List every required document from field 46A with specific requirements. List key conditions from 47A.

STEP 2 — MATCH DOCUMENTS:
For each required document in 46A, identify which uploaded file satisfies it. Match by content, not just filename. Mark unmatched requirements as not_presented. Mark unreadable documents as unverifiable.

STEP 3 — CHECK COMPLIANCE (UCP 600):
Check: document completeness, date logic (shipment date, BL date, expiry), cross-document consistency (Art 14d), BL compliance (Art 19-25), invoice compliance (Art 18), insurance (Art 28 — FIRST check if LC says applicant covers insurance, if so beneficiary does NOT need to present it), certificate of origin, tolerances (Art 30), 47A conditions.

Severity: critical = automatic rejection, major = bank will flag, minor = may be flagged, observation = worth noting.

NOT A DISCREPANCY: Different quantities under different LCs is normal. Charter party BL when LC permits it. Commingled cargo when LC permits it. BL before LC issue date unless LC explicitly prohibits it.

STEP 4 — VERIFY YOUR FINDINGS:
Before responding, review each finding. Remove anything below 80% confidence. Add confidence_score (0.0-1.0) to each discrepancy.

Max 10 findings. Be concise.

Respond ONLY valid JSON no markdown fences:
{"lc_reference": "", "issuing_bank": "", "verdict": "compliant|discrepant|incomplete", "summary": "", "lc_terms": {"amount": "", "currency": "", "tolerance_percent": "", "expiry_date": "", "latest_shipment_date": "", "port_of_loading": "", "port_of_discharge": "", "goods_description": "", "quantity_mt": "", "incoterms": ""}, "document_checklist": [{"document_name": "", "status": "presented|missing|unverifiable", "matched_file": "", "notes": ""}], "discrepancies": [{"id": 1, "severity": "critical|major|minor|observation", "title": "", "ucp_article": "", "lc_requirement": "", "actual_value": "", "explanation": "", "affected_document": "", "recommended_action": "", "confidence_score": 0.0}], "recommended_actions": [{"priority": 1, "action": "", "rationale": ""}]}`;

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
    const { lc_group, documents } = req.body;

    if (!lc_group || !documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: "Missing lc_group or documents." });
    }

    const lcRef = lc_group.lc_reference || "unknown";
    const lcTypes = /lc|mt700|mt799/i;

    // Build document texts with truncation
    const docTexts = [];
    for (const doc of documents) {
      const name = doc.name || "unnamed";
      const docType = doc.document_type || "";
      const isLc = lcTypes.test(docType);
      const isNoText = doc.text_quality === "no_text";

      if (isNoText || !doc.text || !doc.text.trim()) {
        docTexts.push(`FILENAME: ${name} — scanned, unreadable`);
        console.log("  Doc: " + name + " = 0 chars (no_text)");
        continue;
      }

      let text = doc.text.trim();
      const limit = isLc ? 8000 : 2000;
      if (text.length > limit) {
        text = text.slice(0, limit) + "\n[...truncated]";
      }
      console.log("  Doc: " + name + " = " + text.length + " chars");
      docTexts.push(`--- ${name} ---\n${text}`);
    }

    const userMessage = `LC Reference: ${lcRef}\nIssuing Bank: ${lc_group.issuing_bank || "unknown"}\n\nDocuments:\n${docTexts.join("\n\n")}`;

    console.log("Analyze LC " + lcRef + ": " + documents.length + " docs, ~" + userMessage.length + " chars");

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Analyze LC " + lcRef + " raw:", responseText.slice(0, 200));

    const result = parseJSON(responseText);
    result.lc_reference = result.lc_reference || lcRef;
    result.issuing_bank = result.issuing_bank || lc_group.issuing_bank;

    return res.status(200).json(result);
  } catch (err) {
    console.error("Analyze LC error:", err);
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
