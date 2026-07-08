import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const LOCAL_AI_CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "ai-config.local.json");

let localAiConfigCache;

const moodRules = [
  { terms: ["辣", "重口", "刺激", "火锅", "麻"], boost: ["hotpot", "mala", "bbq", "skewer"] },
  { terms: ["清淡", "健康", "不腻", "轻", "舒服"], boost: ["salad", "soup", "brunch"] },
  { terms: ["快", "赶时间", "简单", "便宜"], boost: ["rice", "noodle", "baozi"] },
  { terms: ["甜", "喝", "咖啡", "奶茶"], boost: ["milk-tea", "coffee", "dessert"] },
  { terms: ["夜宵", "晚", "饿"], boost: ["late", "bbq", "skewer"] },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readLocalAiConfig() {
  if (localAiConfigCache !== undefined) return localAiConfigCache;

  try {
    if (!existsSync(LOCAL_AI_CONFIG_PATH)) {
      localAiConfigCache = null;
      return null;
    }

    localAiConfigCache = JSON.parse(readFileSync(LOCAL_AI_CONFIG_PATH, "utf8"));
    return localAiConfigCache;
  } catch {
    localAiConfigCache = null;
    return null;
  }
}

function normalizeAiConfig(config) {
  if (!config || typeof config !== "object") return null;

  const provider = config.provider === "compatible" ? "compatible" : "openai";
  const providerConfig = config[provider] ?? {};
  const apiKey = providerConfig.apiKey || config.apiKey;
  if (!apiKey) return null;

  return {
    apiKey,
    model: providerConfig.model || config.model || DEFAULT_MODEL,
    baseUrl:
      providerConfig.baseUrl ||
      config.baseUrl ||
      (provider === "openai" ? DEFAULT_BASE_URL : undefined),
  };
}

function getAiConfig() {
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
    };
  }

  if (process.env.AI_API_KEY) {
    return {
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      baseUrl: process.env.AI_BASE_URL || DEFAULT_BASE_URL,
    };
  }

  return normalizeAiConfig(readLocalAiConfig());
}

function scorePlace(place, request) {
  const text = String(request.userText ?? "").toLowerCase();
  let score = 50 + Math.max(0, 1200 - Number(place.distance ?? 1200)) / 35;
  if (place.subtype && request.selectedSubtypes?.includes(place.subtype)) score += 16;
  if (place.category === request.selectedCategory) score += 12;
  if (place.rating) score += Number(place.rating) * 6;

  for (const rule of moodRules) {
    if (rule.terms.some((term) => text.includes(term))) {
      if (place.subtype && rule.boost.includes(place.subtype)) score += 28;
    }
  }

  return score;
}

function localRecommend(request) {
  const ranked = [...(request.places ?? [])]
    .map((place) => ({ place, score: scorePlace(place, request) + Math.random() * 8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    fallbackSubtype: ranked[0]?.place.subtype,
    picks: ranked.map(({ place, score }, index) => ({
      placeId: place.id,
      confidence: clamp(Math.round(score), 62, 96),
      reason:
        index === 0
          ? "最贴近你刚才的描述，距离和口味都比较合适。"
          : "作为备选很稳，口味、评分和距离比较均衡。",
    })),
  };
}

function normalizeRequest(body) {
  const places = Array.isArray(body?.places) ? body.places : [];
  return {
    userText: String(body?.userText ?? "").slice(0, 500),
    location: body?.location ?? null,
    selectedCategory: body?.selectedCategory,
    selectedSubtypes: Array.isArray(body?.selectedSubtypes) ? body.selectedSubtypes.slice(0, 12) : [],
    places: places
      .filter((place) => place && typeof place.id === "string" && typeof place.name === "string")
      .slice(0, 30),
  };
}

function compactPlace(place) {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    distance: place.distance,
    category: place.category,
    subtype: place.subtype,
    rating: place.rating,
  };
}

function sanitizeAiResponse(raw, request) {
  const allowedIds = new Set(request.places.map((place) => place.id));
  const picks = Array.isArray(raw?.picks) ? raw.picks : [];
  const cleanPicks = [];

  for (const pick of picks) {
    if (!allowedIds.has(pick?.placeId)) continue;
    cleanPicks.push({
      placeId: pick.placeId,
      reason: String(pick.reason ?? "这家和你的偏好比较匹配。").slice(0, 80),
      confidence: clamp(Number.parseInt(pick.confidence, 10) || 78, 50, 99),
    });
    if (cleanPicks.length >= 3) break;
  }

  if (!cleanPicks.length) return null;

  return {
    picks: cleanPicks,
    fallbackSubtype: typeof raw?.fallbackSubtype === "string" ? raw.fallbackSubtype : undefined,
  };
}

async function callAi(request) {
  const aiConfig = getAiConfig();
  if (!aiConfig?.apiKey || !aiConfig.baseUrl) return null;

  const model = aiConfig.model || DEFAULT_MODEL;
  const baseUrl = aiConfig.baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  const payload = {
    model,
    temperature: 0.75,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是一个懂附近餐饮选择的中文推荐助手。只能从给定 places 中挑选。返回严格 JSON：{\"picks\":[{\"placeId\":\"\",\"reason\":\"\",\"confidence\":80}],\"fallbackSubtype\":\"\"}。推荐 3 家，reason 简短自然，不要编造店铺信息。",
      },
      {
        role: "user",
        content: JSON.stringify({
          userText: request.userText,
          location: request.location,
          selectedCategory: request.selectedCategory,
          selectedSubtypes: request.selectedSubtypes,
          places: request.places.map(compactPlace),
        }),
      },
    ],
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  } catch {
    body = {};
  }

  const request = normalizeRequest(body);
  if (!request.places.length) return res.status(200).json({ picks: [] });

  const aiResult = await callAi(request);
  const cleanAiResult = aiResult ? sanitizeAiResponse(aiResult, request) : null;
  return res.status(200).json(cleanAiResult ?? localRecommend(request));
}
