import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert LC document examiner. You receive a single LC and its associated trade documents. Extract: A) Basic terms: lc_number, issuing_bank, advising_bank, applicant, beneficiary, amount, currency, tolerance_percent, issue_date, expiry_date, latest_shipment_date, presentation_period, draft_terms. B) Shipping terms: port_of_loading, port_of_discharge, partial_shipments, transshipment, goods_description (exact from 45A), incoterms, quantity_mt. C) Required documents from 46A: each with document_name, originals_required, copies_required, specific_requirements. D) Additional conditions from 47A. E) Document matching: for each required doc, which uploaded file matches (by LC ref, invoice number, quantity, bank name), confidence, notes. Mark unmatched as not_presented. Preserve EXACT LC requirement wording. Respond ONLY valid JSON no markdown fences: {"lc_number": "", "issuing_bank": "", "advising_bank": "", "applicant": "", "beneficiary": "", "amount": "", "currency": "", "tolerance_percent": "", "issue_date": "", "expiry_date": "", "latest_shipment_date": "", "presentation_period": "", "draft_terms": "", "port_of_loading": "", "port_of_discharge": "", "partial_shipments": "", "transshipment": "", "goods_description": "", "incoterms": "", "quantity_mt": "", "required_documents": [{"document_name": "", "originals_required": 0, "copies_required": 0, "specific_requirements": "", "matched_file": null, "confidence": 0, "notes": ""}], "additional_conditions": [""], "unmatched_files": [""]}`;

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

    const lcTypes = new Set(["lc_swift_mt700", "lc_amendment_mt799"]);
    const lcGroups = classification.lc_groups || [];
    const classifiedDocs = new Map(
      (classification.documents || []).map(d => [d.filename, d])
    );
    const docTextMap = new Map(
      documents.map(d => [d.name, d.text || ""])
    );

    // Find filenames classified as unknown with no text — send as filename-only stubs
    const assignedFiles = new Set(lcGroups.flatMap(g => g.documents_belonging || []));
    const unknownNoTextFiles = (classification.documents || [])
      .filter(d => !assignedFiles.has(d.filename) && d.text_quality === "no_text")
      .map(d => d.filename);

    // Safety: if 1 LC group with 8+ docs, use aggressive truncation
    const aggressiveTruncate = lcGroups.length === 1 &&
      (lcGroups[0].documents_belonging || []).length > 8;
    const nonLcLimit = aggressiveTruncate ? 1500 : 2000;
    const lcLimit = aggressiveTruncate ? 1500 : Infinity;

    // Process each LC group separately
    const lcResults = [];

    for (const group of lcGroups) {
      const belongingFiles = group.documents_belonging || [];

      // Build doc texts: ONLY this LC's documents
      const docTexts = [];

      for (const filename of belongingFiles) {
        const cls = classifiedDocs.get(filename);
        const isLc = cls && lcTypes.has(cls.document_type);
        const isNoText = cls && cls.text_quality === "no_text";

        // Scanned/unreadable: filename only
        if (isNoText) {
          docTexts.push(`FILENAME: ${filename} — scanned, no text available`);
          continue;
        }

        let text = (docTextMap.get(filename) || "").trim() || "[No text extracted]";
        const limit = isLc ? lcLimit : nonLcLimit;
        if (text.length > limit) {
          text = text.slice(0, limit) + "\n[...truncated]";
        }
        docTexts.push(`--- ${filename} ---\n${text}`);
      }

      // Add unknown/no_text docs as filename-only stubs (no text body)
      for (const filename of unknownNoTextFiles) {
        docTexts.push(`FILENAME: ${filename} — scanned, no text available`);
      }

      const userMessage = `LC Reference: ${group.lc_reference || "unknown"}\nIssuing Bank: ${group.issuing_bank || "unknown"}\n\nDocuments:\n${docTexts.join("\n\n")}`;

      console.log("Parse LC " + (group.lc_reference || "?") + ": " + docTexts.length + " docs, ~" + userMessage.length + " chars");

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      console.log(`Parse LC ${group.lc_reference} raw:`, responseText.slice(0, 200));

      const parsed = parseJSON(responseText);
      parsed._lc_reference = group.lc_reference;
      parsed._issuing_bank = group.issuing_bank;
      lcResults.push(parsed);
    }

    return res.status(200).json({ lc_analyses: lcResults });
  } catch (err) {
    console.error("Parse error:", err);
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Parsing failed. Please try again." });
  }
}
