import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert LC document examiner. You receive Phase 1 classification and full document texts. For each LC, extract: A) Basic terms: lc_number, issuing_bank, advising_bank, applicant, beneficiary, amount, currency, tolerance_percent, issue_date, expiry_date, latest_shipment_date, presentation_period, draft_terms. B) Shipping terms: port_of_loading, port_of_discharge, partial_shipments, transshipment, goods_description (exact from 45A), incoterms, quantity_mt. C) Required documents from 46A: each with document_name, originals_required, copies_required, specific_requirements. D) Additional conditions from 47A. E) Document matching: for each required doc, which uploaded file matches (by LC ref, invoice number, quantity, bank name), confidence, notes. Mark unmatched as not_presented. Preserve EXACT LC requirement wording. Respond ONLY valid JSON no markdown fences.`;

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
    const { classification, documents } = req.body;

    if (!classification || !documents) {
      return res.status(400).json({ error: "Missing classification or documents." });
    }

    // Build document text map from classification
    const lcTypes = new Set(["lc_swift_mt700", "lc_amendment_mt799"]);
    const classifiedDocs = new Map(
      (classification.documents || []).map(d => [d.filename, d])
    );

    const docTexts = documents.map((doc, i) => {
      const cls = classifiedDocs.get(doc.name);
      const isLc = cls && lcTypes.has(cls.document_type);
      const isNoText = cls && cls.text_quality === "no_text";

      if (isNoText) {
        return `--- DOCUMENT ${i + 1}: ${doc.name || "unnamed"} ---\n[No text — classified as ${cls.document_type}]`;
      }

      let text = doc.text && doc.text.trim() ? doc.text.trim() : "[No text extracted]";
      if (!isLc && text.length > 4000) {
        text = text.slice(0, 4000) + "\n[...truncated]";
      }
      return `--- DOCUMENT ${i + 1}: ${doc.name || "unnamed"} ---\n${text}`;
    }).join("\n\n");

    const userMessage = `Phase 1 classification:\n${JSON.stringify(classification, null, 2)}\n\nFull document texts:\n${docTexts}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    console.log("Parse raw:", responseText.slice(0, 300));

    const result = parseJSON(responseText);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Parse error:", err);
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Parsing failed. Please try again." });
  }
}
