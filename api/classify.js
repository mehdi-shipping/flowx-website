import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a trade finance document classifier. For each document, identify: document_type (one of: lc_swift_mt700, lc_amendment_mt799, commercial_invoice, bill_of_lading, bill_of_exchange_draft, certificate_of_origin, certificate_of_quality, certificate_of_weight, insurance_certificate, vessel_certificate, draft_survey_report, inspection_report, packing_list, shipping_advice_email, unknown), lc_reference, bank_name, quantity_mt, invoice_reference, vessel_name, beneficiary, applicant, text_quality (full_text/partial_text/no_text), confidence (0-1). CRITICAL: If you see TWO DIFFERENT LC numbers or bank names or invoice numbers across documents, set multi_lc_transaction to true. A shipper letter or vessel certificate is NOT a Bill of Lading. SWIFT MT700 messages appear inside email text with field tags 27: 40A: 20: 31C: 46A: 47A:. If no text, classify by filename: LOT+quantity=inspection cert, REPORT=draft survey, LETTER=vessel cert. IMPORTANT: Look carefully for MULTIPLE LC references. Different bank names (e.g. State Bank of India vs Bank of Baroda) almost always mean different LCs. Different invoice numbers across documents almost always mean different LCs. Different quantities for the same commodity on the same vessel almost always mean different LCs. When in doubt, split into separate LC groups rather than merging. Respond ONLY valid JSON no markdown fences: {"multi_lc_transaction": bool, "transaction_summary": "string", "documents": [{"filename": "", "document_type": "", "lc_reference": "", "bank_name": "", "quantity_mt": "", "invoice_reference": "", "vessel_name": "", "beneficiary": "", "applicant": "", "text_quality": "", "confidence": 0}], "lc_groups": [{"lc_reference": "", "issuing_bank": "", "documents_belonging": ["filenames"]}]} Be concise. Use short strings for all fields. Limit transaction_summary to one sentence. Set null for any field you cannot determine — do not explain why.`;

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
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: "No documents provided." });
    }

    const docTexts = documents.map((doc, i) => {
      const text = doc.text && doc.text.trim() ? doc.text.trim().slice(0, 4000) : "[No text extracted]";
      return `--- DOCUMENT ${i + 1}: ${doc.name || "unnamed"} ---\n${text}`;
    }).join("\n\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let message;
    try {
      message = await client.messages.create(
        {
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Classify these trade documents:\n\n${docTexts}` }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Classify raw:", responseText.slice(0, 300));

    const result = parseJSON(responseText);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Classify error:", err);
    if (err.name === "AbortError") return res.status(504).json({ error: "Classification timed out." });
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Classification failed. Please try again." });
  }
}
