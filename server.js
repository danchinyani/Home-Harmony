import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import multer from "multer";


const upload = multer({ dest: "uploads/" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   LOAD KNOWLEDGE BASE FILES
========================= */
const kbPath = path.join(__dirname, "knowledge", "knowledge_base.json");
const rulesPath = path.join(__dirname, "knowledge", "safety_rules.json");

function safeReadJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read JSON: ${filePath}`, err);
    return fallback;
  }
}

const KB = safeReadJson(kbPath, { records: [] });
const SAFETY = safeReadJson(rulesPath, { rules: [] });

/* =========================
   HELPER FUNCTIONS
========================= */

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYMS = {
  sofa: "couch",
  settee: "couch",
  loveseat: "couch",
  couch: "couch",
  upholstered: "upholstery",
  upholstery: "upholstery",
  fabric: "fabric",
  textile: "fabric",

  pan: "pot",
  saucepan: "pot",
  cookware: "pot",
  skillet: "pan",

  fridge: "fridge",
  refrigerator: "fridge",

  windowpane: "window",
  glass: "glass",
  screen: "screen",
  monitor: "screen",
  television: "tv",
  tv: "tv"
};

const OBJECT_GROUPS = {
  upholstery: ["couch", "sofa", "armchair", "chair", "upholstery", "fabric sofa"],
  cookware: ["pot", "pan", "saucepan", "skillet", "air fryer"],
  glass: ["window", "mirror", "shower glass", "glass"],
  appliance: ["fridge", "oven", "microwave", "air fryer"],
  screen: ["tv", "screen", "monitor", "display"]
};

function expandTokens(tokens) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    if (SYNONYMS[token]) {
      expanded.add(SYNONYMS[token]);
    }
  }

  return Array.from(expanded);
}

function tokenize(text) {
  const stopWords = new Set([
    "how", "do", "i", "a", "an", "the", "my", "to", "clean",
    "please", "can", "you", "of", "for", "on", "in", "with",
    "from", "is", "it", "and", "this", "that", "what"
  ]);

  const raw = normalize(text)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !stopWords.has(t));

  return expandTokens(raw);
}

function getDetectedObjectGroup(tokens) {
  for (const [group, words] of Object.entries(OBJECT_GROUPS)) {
    if (words.some((word) => tokens.includes(normalize(word)))) {
      return group;
    }
  }
  return null;
}

function retrieveKB(query, k = 3) {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(query);
  const detectedGroup = getDetectedObjectGroup(tokens);

  const scored = (KB.records || []).map((rec) => {
    let score = 0;

    const title = normalize(rec.title);
    const problem = normalize(rec.problem);
    const surface = normalize(rec.surface);
    const room = normalize(rec.room);
    const category = normalize(rec.category);
    const intent = normalize(rec.intent);
    const objectType = normalize(rec.object_type);
    const material = normalize(rec.material);
    const tags = normalize((rec.tags || []).join(" "));
    const instructions = normalize((rec.instructions || []).join(" "));
    const appliesWhen = normalize((rec.applies_when || []).join(" "));

    const fullText = [
      title,
      problem,
      surface,
      room,
      category,
      intent,
      objectType,
      material,
      tags,
      instructions,
      appliesWhen
    ].join(" ");

    // Strong phrase matches
    if (normalizedQuery.includes("fabric couch") && fullText.includes("fabric") && (fullText.includes("couch") || fullText.includes("sofa"))) {
      score += 30;
    }

    if (normalizedQuery.includes("dirty couch") && (fullText.includes("couch") || fullText.includes("sofa"))) {
      score += 25;
    }

    if (normalizedQuery.includes("burnt pot") && fullText.includes("pot")) {
      score += 25;
    }

    if (normalizedQuery.includes("shower glass") && fullText.includes("shower") && fullText.includes("glass")) {
      score += 25;
    }

    if (normalizedQuery.includes("fridge") && fullText.includes("fridge")) {
      score += 20;
    }

    // Token scoring
    for (const token of tokens) {
      if (surface === token) score += 12;
      else if (surface.includes(token)) score += 8;

      if (objectType === token) score += 14;
      else if (objectType.includes(token)) score += 9;

      if (material === token) score += 11;
      else if (material.includes(token)) score += 7;

      if (intent === token) score += 6;
      else if (intent.includes(token)) score += 4;

      if ((rec.tags || []).some(tag => normalize(tag) === token)) score += 10;
      else if (tags.includes(token)) score += 6;

      if (title.includes(token)) score += 7;
      if (problem.includes(token)) score += 7;
      if (appliesWhen.includes(token)) score += 6;
      if (room.includes(token)) score += 3;
      if (category.includes(token)) score += 2;
      if (instructions.includes(token)) score += 1;
    }

    // Object-group consistency bonus
    if (detectedGroup) {
      if (
        (detectedGroup === "upholstery" && ["upholstery", "furniture", "sofa", "couch"].some(v => fullText.includes(v))) ||
        (detectedGroup === "cookware" && ["pot", "pan", "cookware", "air fryer"].some(v => fullText.includes(v))) ||
        (detectedGroup === "glass" && ["glass", "window", "mirror", "shower"].some(v => fullText.includes(v))) ||
        (detectedGroup === "appliance" && ["fridge", "oven", "microwave", "appliance"].some(v => fullText.includes(v))) ||
        (detectedGroup === "screen" && ["screen", "tv", "monitor", "display"].some(v => fullText.includes(v)))
      ) {
        score += 18;
      } else {
        score -= 18;
      }
    }

    // Penalties for obviously wrong categories
    if (tokens.includes("couch") || tokens.includes("sofa") || tokens.includes("upholstery")) {
      if (["cutlery", "utensil", "fork", "knife", "spoon"].some(v => fullText.includes(v))) {
        score -= 40;
      }
    }

    if (tokens.includes("pot") || tokens.includes("pan")) {
      if (["couch", "sofa", "upholstery"].some(v => fullText.includes(v))) {
        score -= 30;
      }
    }

    if (tokens.includes("fridge")) {
      if (["cutlery", "sofa", "screen"].some(v => fullText.includes(v))) {
        score -= 25;
      }
    }

    const matchedImportant = tokens.filter(
      (t) =>
        title.includes(t) ||
        problem.includes(t) ||
        surface.includes(t) ||
        objectType.includes(t) ||
        material.includes(t) ||
        tags.includes(t) ||
        appliesWhen.includes(t)
    ).length;

    score += matchedImportant * 2;
    score += rec.confidence || 0;

    return {
      rec: {
        ...rec,
        _score: score
      },
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((x) => x.score >= 8)
    .slice(0, k)
    .map((x) => x.rec);
}

function safetyChecks(query, kbMatches = []) {
  const q = normalize(query);

  return (SAFETY.rules || []).filter((rule) => {
    const conditions = rule.conditions || {};
    const hasKbConditions =
      conditions.material ||
      conditions.materials ||
      conditions.room ||
      conditions.surface;

    const hasProductConditions =
      conditions.products && conditions.products.length > 0;

    // First: product-only checks can work without KB matches
    if (hasProductConditions && !hasKbConditions) {
      return conditions.products.every((p) => q.includes(normalize(p)));
    }

    // Otherwise: require at least one KB record to match metadata conditions
    return kbMatches.some((rec) => {
      const material = normalize(rec.material);
      const room = normalize(rec.room);
      const surface = normalize(rec.surface);

      if (conditions.material && material !== normalize(conditions.material)) {
        return false;
      }

      if (conditions.materials) {
        const match = conditions.materials.map(normalize).includes(material);
        if (!match) return false;
      }

      if (conditions.room && room !== normalize(conditions.room)) {
        return false;
      }

      if (conditions.surface && surface !== normalize(conditions.surface)) {
        return false;
      }

      if (hasProductConditions) {
        const hasAllProducts = conditions.products.every((p) =>
          q.includes(normalize(p))
        );
        if (!hasAllProducts) return false;
      }

      return Object.keys(conditions).length > 0;
    });
  });
}

function formatKB(rec) {
  const contextBits = [
    rec.room ? `Room: ${rec.room}` : null,
    rec.object_type ? `Object: ${rec.object_type}` : null,
    rec.material ? `Material: ${rec.material}` : null,
    rec.intent ? `Intent: ${rec.intent}` : null
  ].filter(Boolean).join(" | ");

  const instructions = (rec.instructions || [])
    .map(step => `- ${step}`)
    .join("\n");

  const dos = (rec.dos || []).length
    ? `Do:\n${rec.dos.map(d => `- ${d}`).join("\n")}`
    : "";

  const donts = (rec.donts || []).length
    ? `Don't:\n${rec.donts.map(d => `- ${d}`).join("\n")}`
    : "";

  const safety = (rec.safety?.warnings || []).length
    ? `Safety:\n${rec.safety.warnings.map(w => `- ${w}`).join("\n")}`
    : "";

  return `
Title: ${rec.title}
${contextBits ? `${contextBits}\n` : ""}

Instructions:
${instructions}

${dos}

${donts}

${safety}
`;
}

function kbOnlyAnswer(message, kbMatches, safetyHits) {
  if (!kbMatches.length) {
    if (safetyHits.length) {
      return [
        "Safety warnings:",
        ...safetyHits.map((rule) => `- ${rule.message}`)
      ].join("\n");
    }

    return [
      "I do not have enough information in the knowledge base to answer fully.",
      "Please include the surface, material, or specific cleaning problem."
    ].join("\n");
  }

  const rec = kbMatches[0];
  let response = "";

  if (safetyHits.length) {
    response += "Safety warnings:\n";
    response += safetyHits.map((rule) => `- ${rule.message}`).join("\n");
    response += "\n\n";
  }

  response += `${rec.title}\n\n`;

  response += "Instructions:\n";
  response += (rec.instructions || []).map((step) => `- ${step}`).join("\n");

  if ((rec.dos || []).length) {
    response += "\n\nDo:\n";
    response += rec.dos.map((d) => `- ${d}`).join("\n");
  }

  if ((rec.donts || []).length) {
    response += "\n\nDon't:\n";
    response += rec.donts.map((d) => `- ${d}`).join("\n");
  }

  const combinedSafety = [
    ...(rec.safety?.warnings || [])
  ];

  if (combinedSafety.length) {
    response += "\n\nSafety:\n";
    response += combinedSafety.map((w) => `- ${w}`).join("\n");
  }

  return response.trim();
}

function shouldFallbackToKBOnly(reply, kbMatches) {
  if (!reply || !reply.trim()) return true;

  const lower = reply.toLowerCase();

  if (reply.includes("KB_1") || reply.includes("KB_2")) return true;

  if (
    lower.includes("limescale") &&
    !kbMatches.some((r) => (r.problem || "").toLowerCase().includes("limescale"))
  ) {
    return true;
  }

  return false;
}

async function describeImageWithOllama(imagePath) {
  try {
    const imageBase64 = fs.readFileSync(imagePath, { encoding: "base64" });

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llava",
        prompt: `
You are helping a cleaning assistant.
Identify the main household object in this image and the visible cleaning issue.

Return exactly in this format:
Object: ...
Material: ...
Problem: ...

Choose the main visible household item only.
Examples:
Object: couch; Material: fabric; Problem: visible stains and dirt
Object: pot; Material: metal; Problem: burnt food residue
Object: shower glass; Material: glass; Problem: limescale
        `.trim(),
        images: [imageBase64],
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Image model error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return (data.response || "").trim();
  } catch (error) {
    console.error("describeImageWithOllama error:", error.message);
    throw error;
  }
}

async function rewriteUserQuery(text) {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen2.5:1.5b",
        prompt: `
Rewrite this cleaning request into short structured search text.
Focus on object, material, and problem only.

Input:
${text}

Example output:
couch fabric stains
        `.trim(),
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Rewrite model error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return (data.response || text).trim();
  } catch (error) {
    console.error("rewriteUserQuery error:", error.message);
    throw error;
  }
}

/* =========================
   ROUTES
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/health", async (req, res) => {
  // Quick diagnostic endpoint
  const kbCount = (KB.records || []).length;
  const safetyCount = (SAFETY.rules || []).length;

  let ollamaOk = false;
  try {
    const r = await fetch("http://localhost:11434/api/tags", { method: "GET" });
    ollamaOk = r.ok;
  } catch {
    ollamaOk = false;
  }

  res.json({ ok: true, kbCount, safetyCount, ollamaOk });
});

function cleanResponse(text) {
  if (!text) return text;

  return text
    // remove bold/italic markers
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")

    // remove stray single asterisks
    .replace(/\*/g, "")

    // normalize spacing
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSafetyOnlyQuery(query) {
  const q = normalize(query);

  return (
    (q.includes("mix") || q.includes("combine")) &&
    (
      q.includes("bleach") ||
      q.includes("vinegar") ||
      q.includes("ammonia")
    )
  );
}

function isBroadCleaningQuery(text = "") {
  const q = normalize(text);

  return (
    q.includes("whole") ||
    q.includes("thoroughly") ||
    q.includes("entire") ||
    q.includes("everything") ||
    q.includes("room")
  );
}

function isHouseholdCleaningQuery(text = "") {
  const q = normalize(text);

  const cleaningKeywords = [
    "clean", "cleaning", "wash", "wipe", "mop", "vacuum", "dust",
    "stain", "grease", "dirt", "mould", "mold", "limescale", "odour", "odor",
    "sofa", "couch", "chair", "carpet", "rug", "mattress", "bed", "bedroom",
    "bathroom", "kitchen", "living room", "window", "glass", "mirror",
    "fridge", "oven", "microwave", "sink", "toilet", "shower", "tap",
    "floor", "tile", "wood", "laminate", "fabric", "upholstery",
    "air fryer", "pan", "pot", "worktop", "surface"
  ];

  return cleaningKeywords.some((keyword) => q.includes(keyword));
}

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const userText = req.body.message || "";
    const transcript = req.body.transcript || "";
    const image = req.file;

    if (image) {
      console.log("Image received:", image.filename);
    }

    let imageDescription = "";

    if (image) {
      try {
        imageDescription = await describeImageWithOllama(image.path);
        console.log("Image description:", imageDescription);
      } catch (imgErr) {
        console.error("Image description failed:", imgErr.message);
        imageDescription = "uploaded cleaning image";
      }
    }

    const extractedIntent = extractCleaningIntent(imageDescription);

  const combinedInput = [userText, transcript, extractedIntent]
  .filter(Boolean)
  .join(" ")
  .trim();

      function extractCleaningIntent(text) {
  const t = normalize(text);

  let object = "";
  let material = "";
  let problem = "";

  if (t.includes("couch") || t.includes("sofa")) object = "couch";
  if (t.includes("fabric")) material = "fabric";
  if (t.includes("leather")) material = "leather";
  if (t.includes("stain") || t.includes("dirty")) problem = "stains";

  return `${object} ${material} ${problem}`.trim();
}

    if (!combinedInput) {
      return res.status(400).json({
        error: "No message, speech, or image provided."
      });
    }

    let interpretedText = combinedInput;

    try {
      interpretedText = await rewriteUserQuery(combinedInput);
    } catch (rewriteErr) {
      console.error("Query rewrite failed:", rewriteErr.message);
      interpretedText = combinedInput;
    }

    console.log("Combined input:", combinedInput);
    console.log("Interpreted text:", interpretedText);

    
   
    const finalMessage = interpretedText;

if (!isHouseholdCleaningQuery(finalMessage)) {
  return res.json({
    reply: "I can only help with household cleaning and domestic surface-care questions.",
    source: "domain_restriction"
  });
}

const safetyOnly = isSafetyOnlyQuery(finalMessage);
const kbMatches = safetyOnly ? [] : retrieveKB(finalMessage, 5);
const bestMatch = kbMatches[0];
const safetyHits = safetyChecks(finalMessage, kbMatches);

if (
  finalMessage.includes("couch") &&
  !kbMatches.some(r => r.object_type === "couch")
) {
  return res.json({
    reply: "I detected a couch, but no suitable knowledge base entry was found for this material or problem. Please specify whether it is fabric or leather.",
    source: "no_specific_kb"
  });
}

if (isBroadCleaningQuery(finalMessage) && kbMatches.length > 1) {
  let response = "Cleaning routine:\n\n";

  kbMatches.forEach((rec) => {
    response += `${rec.title}\n`;
    response += (rec.instructions || []).map((step) => `- ${step}`).join("\n");

    if ((rec.dos || []).length) {
      response += "\nDo:\n";
      response += rec.dos.map((item) => `- ${item}`).join("\n");
    }

    if ((rec.donts || []).length) {
      response += "\nDon't:\n";
      response += rec.donts.map((item) => `- ${item}`).join("\n");
    }

    if ((rec.safety?.warnings || []).length) {
      response += "\nSafety:\n";
      response += rec.safety.warnings.map((item) => `- ${item}`).join("\n");
    }

    response += "\n\n";
  });

  return res.json({
  reply: response,
  source: "knowledge_base_routine"
});
}

console.log("Top match:", bestMatch ? { id: bestMatch.id, score: bestMatch._score } : "none");

if (!safetyOnly && (!bestMatch || bestMatch._score < 12)) {
  return res.json({
    reply: "I am not fully confident about this match. Please confirm:\n- Object (e.g. couch, table)\n- Material (e.g. fabric, leather)\n- Problem (e.g. stains, grease)",
    source: "low_confidence"
  });
}


    const systemPrompt = `
You are Home Harmony, a strict knowledge-based cleaning assistant.

You MUST ONLY use the provided KB content.

STRICT RULES:
- Do NOT invent or infer anything
- Do NOT add extra advice
- ONLY output what exists in KB
- ALWAYS include:
  Instructions
  Do (if available)
  Don't (if available)
  Safety (if available)
- Use "-" bullet points ONLY
- NO markdown or symbols like *

If KB is missing:
Say exactly:
"I do not have enough information in the knowledge base to answer fully. Please include the surface, material, or specific cleaning problem."
`.trim();

    const kbBlock = kbMatches.length
      ? kbMatches.map((m) => `Record ID: ${m.id}\n${formatKB(m)}`).join("\n\n")
      : "NO RELEVANT KNOWLEDGE FOUND.";

    const safetyBlock = safetyHits.length
      ? safetyHits.map((s) => `SAFETY WARNING: ${s.message}`).join("\n")
      : "No safety warnings triggered.";

    const fullPrompt = `${systemPrompt}

${safetyBlock}

${kbBlock}

USER QUESTION:
${finalMessage}

ANSWER:
`;

    let reply = "";

    try {
      const ollamaRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:1.5b",
          prompt: fullPrompt,
          stream: false
        })
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text();
        console.error("Ollama non-OK:", ollamaRes.status, errText);
        reply = kbOnlyAnswer(finalMessage, kbMatches, safetyHits);
      } else {
        const data = await ollamaRes.json();
        reply = normalizeAnswerStyle(cleanResponse((data.response || "").trim()));

        if (
  !reply ||
  !reply.includes("Instructions") ||
  shouldFallbackToKBOnly(reply, kbMatches)
) {
  console.log("⚠️ Falling back to KB-only answer");
  reply = kbOnlyAnswer(finalMessage, kbMatches, safetyHits);
}
      }
    } catch (ollamaErr) {
      console.error("Ollama fetch failed:", ollamaErr.message);
      reply = kbOnlyAnswer(finalMessage, kbMatches, safetyHits);
    }

    return res.json({
      reply,
      source: "knowledge_base",
      debug: {
        userText,
        transcript,
        imageDescription,
        combinedInput,
        interpretedText,
        kbMatches: kbMatches.map((m) => m.id)
      }
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "Server error.",
      details: err.message
    });
  }
});

function normalizeAnswerStyle(text) {
  if (!text) return text;

  return text
    .replace(/^\d+\.\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Home Harmony running at http://localhost:${PORT}`);
  console.log(`🧠 KB records: ${(KB.records || []).length}, Safety rules: ${(SAFETY.rules || []).length}`);
  console.log(`🔎 Health check: http://localhost:${PORT}/api/health`);
});
