import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a quality assurance reviewer for L/C document examination reports. Review the discrepancy report below. For EACH finding, evaluate: 1) Is this a genuine discrepancy or a false positive? Common false positives: treating two different LCs as one, flagging normal multi-LC arrangements as conflicts, marking insurance as missing when the LC says applicant covers it locally, treating commingled cargo as partial shipment. 2) Is the severity classification correct? 3) Is the UCP 600 article citation accurate? Remove any finding with less than 80% confidence. Downgrade severity where appropriate. Add a confidence_score (0-1) to each remaining finding. Respond with ONLY valid JSON, same structure as the input but with confidence_score added to each discrepancy and any false positives removed.`;

export default async function handler(req, res) {
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
    const { analysis } = req.body;

    if (!analysis) {
      return res.status(400).json({
        error: "No analysis data provided for verification.",
      });
    }

    const userMessage = `Review and verify this L/C discrepancy report:\n\n${JSON.stringify(analysis, null, 2)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let message;
    try {
      message = await client.messages.create(
        {
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
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

    console.log("Raw verify response:", responseText);

    let verified;
    try {
      let cleaned = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/g, "")
        .trim();

      try {
        verified = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          verified = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON object found in response");
        }
      }
    } catch (parseErr) {
      console.error("Verify JSON parse error:", parseErr.message);
      console.error("Response was:", responseText.slice(0, 500));
      return res.status(500).json({
        error: "Verification returned an unexpected format. Please try again.",
      });
    }

    return res.status(200).json(verified);
  } catch (err) {
    console.error("Verify error:", err);

    if (err.name === "AbortError") {
      return res.status(504).json({
        error:
          "Verification took too long. Please try again.",
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
        "An error occurred during verification. Please try again in a moment.",
    });
  }
}
