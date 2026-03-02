import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert trade finance document examiner specializing in Letters of Credit (L/C) under UCP 600 (ICC Uniform Customs and Practice for Documentary Credits, 2007 Revision).

Your task is to analyze the uploaded trade documents and produce a comprehensive discrepancy report. You must:

1. **Identify the L/C document** — Look for fields such as:
   - Field 46A (Documents Required)
   - Field 47A (Additional Conditions)
   - Issuing bank, applicant, beneficiary
   - L/C amount, currency, expiry date
   - Latest shipment date, port of loading/discharge
   - Goods description, Incoterms

2. **Classify each document** — Determine what each uploaded document is (L/C, Commercial Invoice, Bill of Lading, Packing List, Certificate of Origin, Insurance Certificate, Inspection Certificate, Draft/Bill of Exchange, etc.)

3. **Check document inventory** — Compare documents presented against documents required in Field 46A. Flag any missing documents.

4. **Analyze for discrepancies** — Check each document against UCP 600 rules:
   - **Art. 14c**: Data in a document must not conflict with data in any other stipulated document
   - **Art. 18**: Commercial invoice must match goods description exactly, be made out to applicant, not exceed L/C amount
   - **Art. 20-25**: Transport documents — shipped on board, ports, dates, consignee
   - **Art. 27**: Clean transport documents (no superimposed clauses declaring defective condition)
   - **Art. 28**: Insurance — coverage amount, risks covered, effective date
   - **Art. 30**: Tolerance in L/C amounts (5% for quantity, 10% for unit price if no specific quantity)
   - **Art. 31**: Partial shipments / drawings
   - **Art. 14d**: Addresses need not be the same but must be in the same country
   - **ISBP 745**: International Standard Banking Practice guidance

5. **Cross-document consistency** — Verify:
   - Beneficiary name consistent across all documents
   - Goods description matches between L/C and invoice
   - Quantities, weights, values are consistent
   - Dates are logical (invoice ≤ B/L ≤ expiry)
   - Port names match
   - Vessel name consistent

You MUST respond with valid JSON in exactly this format:
{
  "verdict": "COMPLIANT" | "DISCREPANCIES_FOUND" | "MAJOR_ISSUES",
  "summary": "One-sentence overall assessment",
  "documentChecklist": [
    {
      "document": "Document name as required in L/C",
      "required": true,
      "presented": true | false,
      "notes": "Any relevant notes"
    }
  ],
  "discrepancies": [
    {
      "id": 1,
      "severity": "critical" | "major" | "minor",
      "title": "Short title of the discrepancy",
      "ucpArticle": "UCP 600 Art. XX" or "ISBP 745 Para. XX" or null,
      "lcRequirement": "What the L/C requires",
      "actualValue": "What the document actually states",
      "explanation": "Why this is a discrepancy and potential consequences",
      "affectedDocument": "Name of the document with the issue"
    }
  ],
  "recommendedActions": [
    {
      "priority": 1,
      "action": "What to do",
      "rationale": "Why this matters"
    }
  ]
}

If only an L/C is provided with no other documents, analyze the L/C itself for internal issues, missing required fields, and provide guidance on what documents will need to be prepared. Still use the same JSON format.

If no L/C is found among the documents, do your best to analyze whatever trade documents are provided for common issues, but note in the summary that no L/C was identified.

IMPORTANT: Respond ONLY with the JSON object. No markdown, no code fences, no explanation before or after.`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        error: "Please upload at least one document to analyze.",
      });
    }

    const hasText = documents.some((d) => d.text && d.text.trim().length > 0);
    if (!hasText) {
      return res.status(400).json({
        error:
          "Could not extract text from the uploaded documents. They may be scanned images — this tool requires text-based PDFs.",
      });
    }

    // Build the user message with all document contents
    const documentTexts = documents
      .map((doc, i) => {
        const label = doc.name || `Document ${i + 1}`;
        const type = doc.type ? ` (${doc.type})` : "";
        const text =
          doc.text && doc.text.trim()
            ? doc.text.trim()
            : "[No text could be extracted from this document]";
        return `--- DOCUMENT ${i + 1}: ${label}${type} ---\n${text}`;
      })
      .join("\n\n");

    const userMessage = `Please analyze the following trade documents for L/C discrepancies under UCP 600:\n\n${documentTexts}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the JSON response
    let analysis;
    try {
      // Try to extract JSON even if wrapped in code fences
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      return res.status(500).json({
        error:
          "The AI returned an unexpected format. Please try again.",
      });
    }

    return res.status(200).json(analysis);
  } catch (err) {
    console.error("Analysis error:", err);

    if (err.status === 401) {
      return res.status(500).json({
        error: "API configuration error. Please contact support.",
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      });
    }

    return res.status(500).json({
      error:
        "An error occurred during analysis. Please try again in a moment.",
    });
  }
}
