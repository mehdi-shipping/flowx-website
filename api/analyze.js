import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const MAX_CHARS_PER_DOC = 3000;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert L/C document examiner under UCP 600. Analyze the provided trade documents and return a JSON discrepancy report.

Check for:
- Document inventory: compare presented docs against Field 46A requirements
- UCP 600 compliance: Art. 14c (no conflicting data), Art. 18 (invoice matches goods desc, made to applicant, within L/C amount), Art. 20-25 (transport docs: on-board, ports, dates, consignee), Art. 27 (clean transport docs), Art. 28 (insurance coverage/amount/date), Art. 30 (quantity/amount tolerances), Art. 31 (partial shipments), Art. 14d (addresses same country)
- Cross-document consistency: beneficiary name, goods description, quantities, weights, values, dates (invoice <= B/L <= expiry), ports, vessel name

If only an L/C is provided, analyze it for internal issues and list documents that will be needed. If no L/C is found, analyze available docs for common issues and note that no L/C was identified.

Keep responses concise. For discrepancies, limit to the 10 most critical findings. For recommended actions, limit to 5.

Respond with ONLY raw JSON. No markdown, no code fences, no backticks, no explanation before or after.
{"verdict":"COMPLIANT"|"DISCREPANCIES_FOUND"|"MAJOR_ISSUES","summary":"One sentence","documentChecklist":[{"document":"Name","required":true,"presented":true|false,"notes":""}],"discrepancies":[{"id":1,"severity":"critical"|"major"|"minor","title":"Short title","ucpArticle":"UCP 600 Art. XX"|null,"lcRequirement":"What L/C requires","actualValue":"What doc states","explanation":"Why and consequences","affectedDocument":"Doc name"}],"recommendedActions":[{"priority":1,"action":"What to do","rationale":"Why"}]}`;

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

    // Build the user message, truncating each document to MAX_CHARS_PER_DOC
    const documentTexts = documents
      .map((doc, i) => {
        const label = doc.name || `Document ${i + 1}`;
        const type = doc.type ? ` (${doc.type})` : "";
        let text =
          doc.text && doc.text.trim()
            ? doc.text.trim()
            : "[No text could be extracted from this document]";
        if (text.length > MAX_CHARS_PER_DOC) {
          text = text.slice(0, MAX_CHARS_PER_DOC) + "\n[...truncated]";
        }
        return `--- DOCUMENT ${i + 1}: ${label}${type} ---\n${text}`;
      })
      .join("\n\n");

    const userMessage = `Analyze these trade documents for L/C discrepancies under UCP 600:\n\n${documentTexts}`;

    // 55s timeout so we can return a proper error before Vercel's 60s kill
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let message;
    try {
      message = await client.messages.create(
        {
          model: "claude-opus-4-6-20250116",
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the JSON response
    console.log("Raw AI response:", responseText);

    let analysis;
    try {
      // Strip markdown code fences if present
      let cleaned = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/g, "")
        .trim();

      // Try direct parse first, then fall back to regex extraction
      try {
        analysis = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON object found in response");
        }
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message);
      console.error("Response was:", responseText.slice(0, 500));
      return res.status(500).json({
        error: "The AI returned an unexpected format. Please try again.",
      });
    }

    return res.status(200).json(analysis);
  } catch (err) {
    console.error("Analysis error:", err);

    if (err.name === "AbortError") {
      return res.status(504).json({
        error:
          "Analysis took too long. Please try with fewer or shorter documents.",
      });
    }

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
