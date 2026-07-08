import { foodCategories } from "../data/food";
import type { Place, RecommendRequest, RecommendResponse } from "../types";

const moodRules = [
  { terms: ["辣", "重口", "刺激", "火锅", "热"], boost: ["hotpot", "mala", "bbq"] },
  { terms: ["清淡", "健康", "不腻", "轻"], boost: ["salad", "soup", "brunch"] },
  { terms: ["快", "赶时间", "简单"], boost: ["rice", "noodle", "baozi"] },
  { terms: ["甜", "喝", "咖啡", "奶茶"], boost: ["milk-tea", "coffee", "dessert"] },
  { terms: ["夜宵", "晚", "饿"], boost: ["late", "bbq", "skewer"] },
];

function scorePlace(place: Place, request: RecommendRequest) {
  const text = request.userText.toLowerCase();
  let score = 50 + Math.max(0, 1000 - place.distance) / 35;
  if (place.subtype && request.selectedSubtypes?.includes(place.subtype)) score += 16;
  if (place.category === request.selectedCategory) score += 12;
  if (place.rating) score += place.rating * 6;

  for (const rule of moodRules) {
    if (rule.terms.some((term) => text.includes(term))) {
      if (place.subtype && rule.boost.includes(place.subtype)) score += 28;
    }
  }

  return score;
}

function localRecommend(request: RecommendRequest): RecommendResponse {
  const pool = request.places.length ? request.places : [];
  const ranked = [...pool]
    .map((place) => ({ place, score: scorePlace(place, request) + Math.random() * 8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const fallbackSubtype = ranked[0]?.place.subtype;
  const fallbackLabel = foodCategories
    .flatMap((category) => category.subtypes)
    .find((subtype) => subtype.id === fallbackSubtype)?.name;

  return {
    fallbackSubtype,
    picks: ranked.map(({ place, score }, index) => ({
      placeId: place.id,
      confidence: Math.min(96, Math.round(score)),
      reason:
        index === 0
          ? `${fallbackLabel ?? "这一类"}和你刚刚的描述更贴近，距离也比较友好。`
          : "作为备选很稳，口味和距离都比较均衡。",
    })),
  };
}

function isValidResponse(value: unknown, request: RecommendRequest): value is RecommendResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as RecommendResponse;
  const allowedIds = new Set(request.places.map((place) => place.id));
  return (
    Array.isArray(response.picks) &&
    response.picks.length > 0 &&
    response.picks.every(
      (pick) =>
        typeof pick.placeId === "string" &&
        allowedIds.has(pick.placeId) &&
        typeof pick.reason === "string" &&
        Number.isFinite(pick.confidence),
    )
  );
}

export async function recommendPlaces(request: RecommendRequest): Promise<RecommendResponse> {
  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (response.ok) {
      const data = await response.json();
      if (isValidResponse(data, request)) return data;
    }
  } catch {
    // Local recommendation keeps the demo complete before the backend exists.
  }

  return localRecommend(request);
}
