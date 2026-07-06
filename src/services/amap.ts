import { getCategoryKeywords } from "../data/food";
import { makeMockPlaces } from "../data/mockPlaces";
import type { FoodCategoryId, GeoLocation, Place } from "../types";

interface AmapPoi {
  id?: string;
  name?: string;
  address?: string;
  distance?: string;
  location?: string;
  biz_ext?: { rating?: string };
  photos?: Array<{ url?: string }>;
}

interface AmapSearchResponse {
  status: string;
  pois?: AmapPoi[];
  info?: string;
}

const categoryBlockedTerms: Partial<Record<FoodCategoryId, string[]>> = {
  staple: [
    "咖啡",
    "拿铁",
    "美式",
    "奶茶",
    "茶饮",
    "果茶",
    "甜品",
    "蛋糕",
    "冰淇淋",
    "饮品",
    "饮料",
    "果汁",
  ],
  snack: ["咖啡", "拿铁", "美式", "奶茶", "茶饮", "果茶", "饮品", "饮料", "果汁"],
  dessert: ["火锅", "烤肉", "烧烤", "烤串", "拉面", "牛肉面", "米粉", "盖饭", "便当", "包子", "饺子"],
};

function parseLocation(value?: string): GeoLocation {
  const [lng, lat] = (value ?? "").split(",").map(Number);
  return {
    lng: Number.isFinite(lng) ? lng : 0,
    lat: Number.isFinite(lat) ? lat : 0,
  };
}

function matchesCurrentCategory(poi: AmapPoi, category: FoodCategoryId) {
  const blockedTerms = categoryBlockedTerms[category] ?? [];
  const content = `${poi.name ?? ""} ${poi.address ?? ""}`;
  return !blockedTerms.some((term) => content.includes(term));
}

export function hasAmapKey() {
  return Boolean(import.meta.env.VITE_AMAP_KEY);
}

export async function searchNearbyFood(params: {
  location: GeoLocation | null;
  category: FoodCategoryId;
  subtypes?: string[];
}): Promise<{ places: Place[]; source: "amap" | "mock"; message: string }> {
  const key = import.meta.env.VITE_AMAP_KEY;
  const fallback = () => ({
    places: makeMockPlaces(params.category, params.subtypes),
    source: "mock" as const,
    message: key ? "周边搜索暂不可用，已展示模拟店铺。" : "未配置高德 Key，已进入模拟店铺模式。",
  });

  if (!key || !params.location) return fallback();

  const keywords = getCategoryKeywords(params.category, params.subtypes).slice(0, 6).join("|");
  const url = new URL("https://restapi.amap.com/v3/place/around");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${params.location.lng},${params.location.lat}`);
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("types", "050000");
  url.searchParams.set("radius", "2500");
  url.searchParams.set("offset", "20");
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as AmapSearchResponse;
    if (data.status !== "1" || !data.pois?.length) return fallback();

    const filteredPois = data.pois.filter((poi) => matchesCurrentCategory(poi, params.category));
    if (!filteredPois.length) return fallback();

    const places = filteredPois.map((poi, index) => ({
      id: poi.id ?? `amap-${index}`,
      name: poi.name ?? "附近美食",
      address: poi.address ?? "暂无地址",
      distance: Number(poi.distance ?? 0),
      location: parseLocation(poi.location),
      category: params.category,
      subtype: params.subtypes?.[0],
      rating: Number(poi.biz_ext?.rating) || undefined,
      photos: poi.photos?.map((photo) => photo.url ?? "").filter(Boolean),
    }));

    return {
      places,
      source: "amap",
      message: `已找到 ${places.length} 家附近美食。`,
    };
  } catch {
    return fallback();
  }
}

export function openAmapNavigation(place: Place) {
  const { lng, lat } = place.location;
  const uri = `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(place.name)}&src=eat-pick-mvp&coordinate=gaode&callnative=1`;
  window.open(uri, "_blank", "noopener,noreferrer");
}
