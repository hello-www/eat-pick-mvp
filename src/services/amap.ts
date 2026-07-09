import { getCategoryKeywords } from "../data/food";
import { makeMockPlaces } from "../data/mockPlaces";
import type { FoodCategoryId, GeoLocation, LocationSuggestion, Place, WeatherSnapshot } from "../types";

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

interface AmapGeoResponse {
  status: string;
  geocodes?: Array<{
    formatted_address?: string;
    location?: string;
  }>;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: {
      adcode?: string;
      city?: string | string[];
      district?: string;
      province?: string;
    };
  };
}

interface AmapInputTipsResponse {
  status: string;
  tips?: Array<{
    id?: string;
    name?: string;
    district?: string;
    address?: string;
    location?: string;
  }>;
}

interface AmapWeatherResponse {
  status: string;
  lives?: Array<{
    city?: string;
    weather?: string;
    temperature?: string;
  }>;
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

function withLabel(location: GeoLocation, label?: string): GeoLocation {
  return {
    ...location,
    label: label || location.label,
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

export async function reverseGeocodeLocation(location: GeoLocation): Promise<GeoLocation> {
  const key = import.meta.env.VITE_AMAP_KEY;
  if (!key) return location;

  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${location.lng},${location.lat}`);
  url.searchParams.set("extensions", "base");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as AmapGeoResponse;
    if (data.status !== "1") return location;
    return withLabel(location, data.regeocode?.formatted_address);
  } catch {
    return location;
  }
}

export async function getCurrentWeather(location: GeoLocation | null): Promise<WeatherSnapshot | null> {
  const key = import.meta.env.VITE_AMAP_KEY;
  if (!key || !location) return null;

  try {
    const regeoUrl = new URL("https://restapi.amap.com/v3/geocode/regeo");
    regeoUrl.searchParams.set("key", key);
    regeoUrl.searchParams.set("location", `${location.lng},${location.lat}`);
    regeoUrl.searchParams.set("extensions", "base");

    const regeoResponse = await fetch(regeoUrl);
    const regeoData = (await regeoResponse.json()) as AmapGeoResponse;
    const adcode = regeoData.regeocode?.addressComponent?.adcode;
    if (regeoData.status !== "1" || !adcode) return null;

    const weatherUrl = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
    weatherUrl.searchParams.set("key", key);
    weatherUrl.searchParams.set("city", adcode);
    weatherUrl.searchParams.set("extensions", "base");

    const weatherResponse = await fetch(weatherUrl);
    const weatherData = (await weatherResponse.json()) as AmapWeatherResponse;
    const live = weatherData.lives?.[0];
    if (weatherData.status !== "1" || !live) return null;

    const temperature = Number(live.temperature);
    return {
      city: live.city,
      weather: live.weather,
      temperature: Number.isFinite(temperature) ? temperature : undefined,
    };
  } catch {
    return null;
  }
}

export async function geocodeKeyword(keyword: string): Promise<GeoLocation | null> {
  const key = import.meta.env.VITE_AMAP_KEY;
  const trimmed = keyword.trim();
  if (!key || !trimmed) return null;

  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", key);
  url.searchParams.set("address", trimmed);
  url.searchParams.set("city", "全国");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as AmapGeoResponse;
    const first = data.geocodes?.[0];
    if (data.status !== "1" || !first?.location) return null;
    return withLabel(parseLocation(first.location), first.formatted_address ?? trimmed);
  } catch {
    return null;
  }
}

function poiToSuggestion(poi: AmapPoi, index: number): LocationSuggestion | null {
  if (!poi.name || !poi.location) return null;
  return {
    id: poi.id ?? `nearby-${index}`,
    name: poi.name,
    address: poi.address,
    location: withLabel(parseLocation(poi.location), poi.name),
  };
}

export async function searchLocationSuggestions(
  keyword: string,
  center: GeoLocation | null,
): Promise<LocationSuggestion[]> {
  const key = import.meta.env.VITE_AMAP_KEY;
  const trimmed = keyword.trim();
  if (!key) return [];

  if (trimmed) {
    const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    url.searchParams.set("key", key);
    url.searchParams.set("keywords", trimmed);
    url.searchParams.set("datatype", "poi");
    if (center) {
      url.searchParams.set("location", `${center.lng},${center.lat}`);
      url.searchParams.set("citylimit", "false");
    }

    try {
      const response = await fetch(url);
      const data = (await response.json()) as AmapInputTipsResponse;
      if (data.status !== "1" || !data.tips?.length) return [];
      return data.tips
        .filter((tip) => typeof tip.location === "string" && tip.location.includes(","))
        .slice(0, 6)
        .map((tip, index) => ({
          id: tip.id ?? `${tip.name}-${index}`,
          name: tip.name ?? trimmed,
          address: [tip.district, tip.address].filter(Boolean).join(" "),
          location: withLabel(parseLocation(tip.location), tip.name ?? trimmed),
        }));
    } catch {
      return [];
    }
  }

  if (!center) return [];

  const url = new URL("https://restapi.amap.com/v3/place/around");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${center.lng},${center.lat}`);
  url.searchParams.set("keywords", "商场|地铁站|写字楼|小区|公园");
  url.searchParams.set("radius", "1200");
  url.searchParams.set("offset", "8");
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "base");

  try {
    const response = await fetch(url);
    const data = (await response.json()) as AmapSearchResponse;
    if (data.status !== "1" || !data.pois?.length) return [];
    return data.pois
      .map(poiToSuggestion)
      .filter((item): item is LocationSuggestion => Boolean(item))
      .slice(0, 6);
  } catch {
    return [];
  }
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

  const location = params.location;
  const keywords = getCategoryKeywords(params.category, params.subtypes).slice(0, 8).join("|");
  const searchPages = [1, 2, 3];

  try {
    const pageResults = await Promise.all(
      searchPages.map(async (page) => {
        const url = new URL("https://restapi.amap.com/v3/place/around");
        url.searchParams.set("key", key);
        url.searchParams.set("location", `${location.lng},${location.lat}`);
        url.searchParams.set("keywords", keywords);
        url.searchParams.set("types", "050000");
        url.searchParams.set("radius", "4000");
        url.searchParams.set("offset", "25");
        url.searchParams.set("page", String(page));
        url.searchParams.set("extensions", "all");

        const response = await fetch(url);
        const data = (await response.json()) as AmapSearchResponse;
        return data.status === "1" ? data.pois ?? [] : [];
      }),
    );

    const uniquePois = new Map<string, AmapPoi>();
    for (const poi of pageResults.flat()) {
      const id = poi.id ?? `${poi.name}-${poi.location}`;
      if (id) uniquePois.set(id, poi);
    }

    if (!uniquePois.size) return fallback();

    const filteredPois = [...uniquePois.values()].filter((poi) => matchesCurrentCategory(poi, params.category));
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

export function openAmapNavigation(place: Place, origin?: GeoLocation | null) {
  window.location.href = getAmapNavigationUrl(place, origin);
}

function formatNavigationPoint(location: GeoLocation, label?: string) {
  return `${location.lng},${location.lat},${label ?? location.label ?? ""}`;
}

export function getAmapNavigationUrl(place: Place, origin?: GeoLocation | null) {
  const { lng, lat } = place.location;
  const params = new URLSearchParams({
    to: `${lng},${lat},${place.name}`,
    mode: "walk",
    policy: "1",
    src: "eat-pick-mvp",
    coordinate: "gaode",
    callnative: "1",
  });

  if (origin) {
    params.set("from", formatNavigationPoint(origin, origin.label ?? "我的位置"));
  }

  return `https://uri.amap.com/navigation?${params.toString()}`;
}
