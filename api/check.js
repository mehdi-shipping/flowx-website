import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior LC document examiner with 20+ years at a major bank. Perform UCP 600 compliance review for a SINGLE LC. Check: 1) Document completeness per 46A. 2) Date logic: LC issue > shipment > BL > docs > presentation > expiry. 3) Cross-doc consistency Art 14d: beneficiary, goods desc, quantity, amount, vessel, ports. 4) BL compliance Art 19-25. 5) Invoice compliance Art 18. 6) Certificate of Origin. 7) Insurance Art 28 — FIRST check if LC says applicant covers insurance locally, if so beneficiary does NOT need to present it. 8) Other required docs. 9) Tolerances Art 30. 10) 47A conditions. Severity: critical=automatic rejection, major=examiner will flag, minor=may or may not flag, observation=worth noting. NOT A DISCREPANCY: charter party BL when LC permits, commingled cargo when LC permits, BL date before LC issue unless LC prohibits. Maximum 10 findings. Respond ONLY valid JSON no markdown fences: {"lc_reference": "", "issuing_bank": "", "verdict": "compliant|discrepant|incomplete", "summary": "", "document_checklist": [{"document_name": "", "status": "presented|missing|unverifiable", "matched_file": "", "notes": ""}], "discrepancies": [{"id": 1, "severity": "critical|major|minor|observation", "title": "", "ucp_article": "", "lc_requirement": "", "actual_value": "", "explanation": "", "affected_document": "", "recommended_action": ""}], "observations": [""], "recommended_actions": [{"priority": 1, "action": "", "rationale": ""}]}`;

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

    const lcTypes = new Set(["lc_swift_mt700", "lc_amendment_mt799"]);
    const classifiedDocs = new Map(
      (classification.documents || []).map(d => [d.filename, d])
    );
    const docTextMap = new Map(
      documents.map(d => [d.name, d.text || ""])
    );
    const lcGroups = classification.lc_groups || [];
    const lcParsed = parsing.lc_analyses || [];

    // Process each LC separately
    const allAnalyses = [];
    const allObservations = [];
    const allActions = [];

    for (let i = 0; i < lcGroups.length; i++) {
      const group = lcGroups[i];
      const parsedLc = lcParsed[i] || lcParsed.find(p =>
        p._lc_reference === group.lc_reference || p.lc_number === group.lc_reference
      ) || {};

      const belongingFiles = group.documents_belonging || [];

      // Build doc texts for this LC
      const docTexts = [];
      for (const filename of belongingFiles) {
        const cls = classifiedDocs.get(filename);
        const isLc = cls && lcTypes.has(cls.document_type);
        const isNoText = cls && cls.text_quality === "no_text";

        if (isNoText) {
          docTexts.push(`--- ${filename} ---\n[No text — classified as ${cls.document_type}]`);
          continue;
        }

        let text = (docTextMap.get(filename) || "").trim() || "[No text extracted]";
        if (!isLc && text.length > 2000) {
          text = text.slice(0, 2000) + "\n[...truncated]";
        }
        docTexts.push(`--- ${filename} ---\n${text}`);
      }

      const userMessage = `LC parsed requirements:\n${JSON.stringify(parsedLc, null, 2)}\n\nDocument texts:\n${docTexts.join("\n\n")}`;

      console.log(`Check LC ${group.lc_reference}: ${docTexts.length} docs, ~${userMessage.length} chars`);

      const message = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      console.log(`Check LC ${group.lc_reference} raw:`, responseText.slice(0, 200));

      const result = parseJSON(responseText);

      // Ensure lc_reference is set
      result.lc_reference = result.lc_reference || group.lc_reference;
      result.issuing_bank = result.issuing_bank || group.issuing_bank;

      allAnalyses.push(result);

      // Collect per-LC observations and actions
      if (result.observations) {
        allObservations.push(...result.observations.filter(o => o && o.trim()));
      }
      if (result.recommended_actions) {
        allActions.push(...result.recommended_actions);
      }
    }

    // Deduplicate and re-prioritize actions
    const uniqueActions = [];
    const seenActions = new Set();
    for (const a of allActions) {
      const key = (a.action || "").toLowerCase().trim();
      if (key && !seenActions.has(key)) {
        seenActions.add(key);
        uniqueActions.push(a);
      }
    }
    uniqueActions.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    return res.status(200).json({
      analysis_per_lc: allAnalyses,
      cross_lc_observations: allObservations,
      recommended_actions: uniqueActions,
    });
  } catch (err) {
    console.error("Check error:", err);
    if (err.status === 401) return res.status(500).json({ error: "API configuration error." });
    if (err.status === 429) return res.status(429).json({ error: "Too many requests. Please wait." });
    return res.status(500).json({ error: "Compliance check failed. Please try again." });
  }
}
