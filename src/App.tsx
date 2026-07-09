import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Clipboard,
  Compass,
  CupSoda,
  Flame,
  Heart,
  Info,
  Leaf,
  LocateFixed,
  MapPinned,
  MessageCircle,
  Navigation,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { foodCategories } from "./data/food";
import { getBrowserLocation, type LocationStatus } from "./services/location";
import {
  geocodeKeyword,
  getCurrentWeather,
  getAmapNavigationUrl,
  hasAmapKey,
  reverseGeocodeLocation,
  searchLocationSuggestions,
  searchNearbyFood,
} from "./services/amap";
import {
  getCurrentTimeSlot,
  loadEatStats,
  recordAiReject,
  recordAiUse,
  recordCategoryChoice,
  saveEatStats,
  summarizeSlot,
  type EatStats,
} from "./services/eatStats";
import {
  getAiPickedLines,
  getAiRejectedLines,
  getAiThinkingLines,
  getIdlePetLines,
  getPlacePetLines,
  type PetLines,
  type PetMood,
} from "./services/petLogic";
import { recommendPlaces } from "./services/recommend";
import type { FoodCategoryId, GeoLocation, LocationSuggestion, Place, RecommendResponse, WeatherSnapshot } from "./types";

const iconMap = {
  Rice: Utensils,
  Spark: Sparkles,
  Flame,
  Cup: CupSoda,
  Leaf,
};

type SearchSource = "amap" | "mock";
type SortMode = "distance" | "rating";
type AiPickMode = "randomTaste" | "lockedTaste";
type PetAnchor = { left: number; top: number };
type ModalPetAnchor = { ai: number; customer: number };

const quickLocations: GeoLocation[] = [
  { lng: 113.2644, lat: 23.1291, label: "广州中心" },
  { lng: 113.3246, lat: 23.1067, label: "珠江新城" },
  { lng: 113.3308, lat: 23.1189, label: "体育西路" },
];

const recentLocationsKey = "eat-pick-mvp-recent-locations-v1";
const favoritePlacesKey = "eat-pick-mvp-favorite-places-v1";
const hiddenPlacesKey = "eat-pick-mvp-hidden-places-v1";

function formatDistance(distance: number) {
  if (!distance) return "距离未知";
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
}

function getBubblePosition(index: number, total: number) {
  const layouts: Record<number, Array<{ left: number; top: number }>> = {
    1: [{ left: 50, top: 66 }],
    2: [
      { left: 39, top: 62 },
      { left: 61, top: 62 },
    ],
    3: [
      { left: 33, top: 58 },
      { left: 67, top: 58 },
      { left: 50, top: 75 },
    ],
    4: [
      { left: 34, top: 55 },
      { left: 66, top: 55 },
      { left: 38, top: 74 },
      { left: 62, top: 74 },
    ],
    5: [
      { left: 50, top: 52 },
      { left: 31, top: 62 },
      { left: 69, top: 62 },
      { left: 40, top: 78 },
      { left: 60, top: 78 },
    ],
    6: [
      { left: 35, top: 52 },
      { left: 65, top: 52 },
      { left: 30, top: 67 },
      { left: 70, top: 67 },
      { left: 42, top: 80 },
      { left: 58, top: 80 },
    ],
  };

  return layouts[Math.min(total, 6)]?.[index] ?? { left: 50, top: 66 };
}

function getRandomPetAnchors(): { ai: PetAnchor; customer: PetAnchor } {
  const anchors = [
    { ai: { left: 22, top: 38 }, customer: { left: 78, top: 58 } },
    { ai: { left: 24, top: 62 }, customer: { left: 72, top: 36 } },
    { ai: { left: 76, top: 34 }, customer: { left: 22, top: 64 } },
    { ai: { left: 26, top: 48 }, customer: { left: 80, top: 48 } },
  ];
  return anchors[Math.floor(Math.random() * anchors.length)];
}

function getRandomModalPetAnchors(): ModalPetAnchor {
  const anchors: ModalPetAnchor[] = [
    { ai: 28, customer: 70 },
    { ai: 36, customer: 62 },
    { ai: 22, customer: 78 },
    { ai: 44, customer: 66 },
  ];
  return anchors[Math.floor(Math.random() * anchors.length)];
}

function loadRecentLocations(): GeoLocation[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(recentLocationsKey);
    const parsed = stored ? (JSON.parse(stored) as GeoLocation[]) : [];
    return parsed
      .filter((item) => Number.isFinite(item.lng) && Number.isFinite(item.lat) && item.label)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function saveRecentLocations(locations: GeoLocation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(recentLocationsKey, JSON.stringify(locations.slice(0, 4)));
}

function loadStringList(key: string): string[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? (JSON.parse(stored) as string[]) : [];
    return parsed.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}

function saveStringList(key: string, list: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

export default function App() {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("点击定位后，马上帮你看看附近有什么可吃。");
  const [manualLocationText, setManualLocationText] = useState("");
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSuggestingLocation, setIsSuggestingLocation] = useState(false);
  const [isLocationSuggestOpen, setIsLocationSuggestOpen] = useState(false);
  const [recentLocations, setRecentLocations] = useState<GeoLocation[]>(() => loadRecentLocations());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FoodCategoryId>("staple");
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>(["rice", "noodle"]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchSource, setSearchSource] = useState<SearchSource>("mock");
  const [isSearching, setIsSearching] = useState(false);
  const [userText, setUserText] = useState("");
  const [isRolling, setIsRolling] = useState(false);
  const [rollingSubtypes, setRollingSubtypes] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [favoritePlaceIds, setFavoritePlaceIds] = useState<string[]>(() => loadStringList(favoritePlacesKey));
  const [hiddenPlaceIds, setHiddenPlaceIds] = useState<string[]>(() => loadStringList(hiddenPlacesKey));
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<RecommendResponse | null>(null);
  const [aiPool, setAiPool] = useState<Place[]>([]);
  const [aiSubtypes, setAiSubtypes] = useState<string[]>([]);
  const [stats, setStats] = useState<EatStats>(() => loadEatStats());
  const initialSlot = useRef(getCurrentTimeSlot());
  const [petMood, setPetMood] = useState<PetMood>("idle");
  const [petLines, setPetLines] = useState<PetLines>(() => getIdlePetLines(initialSlot.current.id, null));
  const [petScoldCount, setPetScoldCount] = useState(0);
  const [petAnchors, setPetAnchors] = useState(() => getRandomPetAnchors());
  const [modalPetAnchors, setModalPetAnchors] = useState(() => getRandomModalPetAnchors());
  const lockedRecommendation = useRef<RecommendResponse | null>(null);

  const category = useMemo(
    () => foodCategories.find((item) => item.id === selectedCategory) ?? foodCategories[0],
    [selectedCategory],
  );
  const categorySubtypeIds = useMemo(() => new Set(category.subtypes.map((item) => item.id)), [category]);
  const activeSlot = getCurrentTimeSlot();
  const activeStats = stats[activeSlot.id];
  const maxCategoryCount = Math.max(1, ...foodCategories.map((item) => activeStats.categories[item.id] ?? 0));

  function normalizeSubtypes(subtypeIds: string[], fallbackCategory = category) {
    const validIds = new Set(fallbackCategory.subtypes.map((item) => item.id));
    const normalized = subtypeIds.filter((id) => validIds.has(id));
    return normalized.length ? normalized : fallbackCategory.subtypes.slice(0, 2).map((item) => item.id);
  }

  const displaySubtypeIds = normalizeSubtypes(selectedSubtypes);
  const displaySubtypes = displaySubtypeIds
    .map((subtypeId) => category.subtypes.find((item) => item.id === subtypeId))
    .filter(Boolean) as typeof category.subtypes;

  const aiRecommendedPlaces = useMemo(() => {
    if (!aiRecommendation) return [];
    return aiRecommendation.picks
      .map((pick) => {
        const place = aiPool.find((item) => item.id === pick.placeId);
        return place ? { place, pick } : null;
      })
      .slice(0, 3)
      .filter(Boolean) as Array<{ place: Place; pick: RecommendResponse["picks"][number] }>;
  }, [aiPool, aiRecommendation]);

  const visiblePlaces = useMemo(
    () => places.filter((place) => !hiddenPlaceIds.includes(place.id)),
    [hiddenPlaceIds, places],
  );
  const hiddenPlaceCount = places.length - visiblePlaces.length;

  const sortedPlaces = useMemo(() => {
    return [...visiblePlaces].sort((a, b) => {
      if (sortMode === "rating") {
        return (b.rating ?? 0) - (a.rating ?? 0) || a.distance - b.distance;
      }

      return a.distance - b.distance;
    });
  }, [sortMode, visiblePlaces]);

  function sortPlaces(placeList: Place[]) {
    return [...placeList].sort((a, b) => {
      if (sortMode === "rating") {
        return (b.rating ?? 0) - (a.rating ?? 0) || a.distance - b.distance;
      }

      return a.distance - b.distance;
    });
  }

  function updateStats(updater: (current: EatStats) => EatStats) {
    setStats((current) => {
      const next = updater(current);
      saveEatStats(next);
      return next;
    });
  }

  function getSubtypeName(subtypeId?: string) {
    if (!subtypeId) return undefined;
    return foodCategories.flatMap((item) => item.subtypes).find((item) => item.id === subtypeId)?.name;
  }

  function showIdlePetTalk() {
    setPetMood("idle");
    setPetLines(getIdlePetLines(getCurrentTimeSlot().id, weather));
  }

  function showPlacePetTalk(place: Place) {
    setPetMood("comment");
    setPetLines(getPlacePetLines(place, getSubtypeName(place.subtype), getCurrentTimeSlot().id, weather));
  }

  function markNavigationStart(place: Place) {
    setStatusMessage(`正在打开到「${place.name}」的高德导航，已尽量带上当前位置作为起点。`);
  }

  function toggleFavoritePlace(place: Place) {
    const isFavorite = favoritePlaceIds.includes(place.id);
    const next = isFavorite
      ? favoritePlaceIds.filter((id) => id !== place.id)
      : [place.id, ...favoritePlaceIds].slice(0, 80);
    setFavoritePlaceIds(next);
    saveStringList(favoritePlacesKey, next);
    setStatusMessage(isFavorite ? `已取消收藏「${place.name}」。` : `已收藏「${place.name}」，这家先放进心动名单。`);
  }

  function hidePlace(place: Place) {
    if (hiddenPlaceIds.includes(place.id)) return;
    const next = [place.id, ...hiddenPlaceIds].slice(0, 120);
    setHiddenPlaceIds(next);
    saveStringList(hiddenPlacesKey, next);
    if (selectedPlace?.id === place.id) setSelectedPlace(null);
    setStatusMessage(`已隐藏「${place.name}」，这家今天先不看。`);
  }

  function restoreHiddenPlaces() {
    setHiddenPlaceIds([]);
    saveStringList(hiddenPlacesKey, []);
    setStatusMessage("已恢复全部隐藏店铺。");
  }

  async function copyPlaceAddress(place: Place) {
    const text = `${place.name}\n${place.address}\n${place.location.lng},${place.location.lat}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage(`已复制「${place.name}」的地址和坐标。`);
    } catch {
      setStatusMessage(`复制失败，可以手动记录：${place.address}`);
    }
  }

  function rememberLocation(nextLocation: GeoLocation) {
    if (!nextLocation.label) return;
    setRecentLocations((current) => {
      const next = [
        nextLocation,
        ...current.filter(
          (item) =>
            item.label !== nextLocation.label &&
            (Math.abs(item.lng - nextLocation.lng) > 0.00001 || Math.abs(item.lat - nextLocation.lat) > 0.00001),
        ),
      ].slice(0, 4);
      saveRecentLocations(next);
      return next;
    });
  }

  const resultItems = useMemo(
    () => sortedPlaces.map((place) => ({ place, pick: null })),
    [sortedPlaces],
  );

  const resultCountLabel = isSearching
    ? "搜索中..."
    : hiddenPlaceCount
      ? `${resultItems.length} 家可选 · 已隐藏 ${hiddenPlaceCount} 家`
      : `${resultItems.length} 家可选`;

  function getRandomSubtypeGroup(avoidSubtypes = selectedSubtypes) {
    const normalize = (ids: string[]) => [...ids].sort().join("|");
    const avoidKey = normalize(avoidSubtypes);
    let nextGroup = avoidSubtypes;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const shuffled = [...category.subtypes].sort(() => Math.random() - 0.5);
      const count = Math.min(3, Math.max(2, Math.ceil(Math.random() * 3)));
      nextGroup = shuffled.slice(0, count).map((item) => item.id);
      if (normalize(nextGroup) !== avoidKey) return nextGroup;
    }

    const shuffled = [...category.subtypes].sort(() => Math.random() - 0.5);
    const count = Math.min(3, Math.max(2, Math.ceil(Math.random() * 3)));
    return shuffled.slice(0, count).map((item) => item.id);
  }

  async function locate() {
    setLocationStatus("loading");
    setStatusMessage("正在确认你附近的美食雷达范围。");
    const result = await getBrowserLocation();
    const readableLocation =
      result.status === "ready" ? await reverseGeocodeLocation(result.location) : result.location;
    setLocation(readableLocation);
    if (result.status === "ready") rememberLocation(readableLocation);
    setLocationStatus(result.status);
    setStatusMessage(
      result.status === "ready" && readableLocation.label
        ? `已定位到 ${readableLocation.label}`
        : result.message,
    );
  }

  async function refreshPlaces(categoryId = selectedCategory, subtypeIds = selectedSubtypes) {
    const targetCategory = foodCategories.find((item) => item.id === categoryId) ?? category;
    const cleanSubtypes = normalizeSubtypes(subtypeIds, targetCategory);
    setIsSearching(true);
    const result = await searchNearbyFood({
      location,
      category: categoryId,
      subtypes: cleanSubtypes,
    });
    setPlaces(result.places);
    setSearchSource(result.source);
    setStatusMessage(result.message);
    setIsSearching(false);
    return result.places;
  }

  function selectCategory(categoryId: FoodCategoryId) {
    const next = foodCategories.find((item) => item.id === categoryId)!;
    const nextSubtypes = next.subtypes.slice(0, 2).map((item) => item.id);
    setSelectedCategory(categoryId);
    setSelectedSubtypes(nextSubtypes);
    updateStats((current) => recordCategoryChoice(current, categoryId, getCurrentTimeSlot().id));
    void refreshPlaces(categoryId, nextSubtypes);
  }

  function toggleSubtype(subtypeId: string) {
    if (!categorySubtypeIds.has(subtypeId)) return;
    const nextSubtypes =
      selectedSubtypes.includes(subtypeId)
        ? selectedSubtypes.length === 1
          ? selectedSubtypes
          : selectedSubtypes.filter((id) => id !== subtypeId)
        : [...selectedSubtypes, subtypeId];

    setSelectedSubtypes(nextSubtypes);
    void refreshPlaces(selectedCategory, nextSubtypes);
  }

  async function applyManualLocation() {
    const keyword = manualLocationText.trim();
    if (!keyword || isResolvingLocation) return;

    setIsResolvingLocation(true);
    setIsLocationSuggestOpen(false);
    setStatusMessage(`正在查找「${keyword}」附近。`);
    const resolved = await geocodeKeyword(keyword);
    setIsResolvingLocation(false);

    if (!resolved) {
      setStatusMessage("没有找到这个位置，可以换个更具体的地名或商圈。");
      return;
    }

    setLocation(resolved);
    setLocationStatus("ready");
    rememberLocation(resolved);
    setStatusMessage(`已切换到 ${resolved.label ?? keyword} 附近。`);
  }

  function applyQuickLocation(nextLocation: GeoLocation) {
    setLocation(nextLocation);
    setLocationStatus("ready");
    rememberLocation(nextLocation);
    setManualLocationText(nextLocation.label ?? "");
    setIsLocationSuggestOpen(false);
    setLocationSuggestions([]);
    setStatusMessage(`已切换到 ${nextLocation.label ?? "手动位置"} 附近。`);
  }

  function applySuggestedLocation(suggestion: LocationSuggestion) {
    setLocation(suggestion.location);
    setLocationStatus("ready");
    rememberLocation(suggestion.location);
    setManualLocationText(suggestion.name);
    setIsLocationSuggestOpen(false);
    setLocationSuggestions([]);
    setStatusMessage(`已切换到 ${suggestion.name} 附近。`);
  }

  async function runAiPick(mode: AiPickMode) {
    if (isRolling || !sortedPlaces.length) return;
    updateStats((current) => recordAiUse(current, getCurrentTimeSlot().id));
    setIsRolling(true);
    setPetMood("thinking");
    setPetLines(getAiThinkingLines());
    setAiModalOpen(true);
    setAiRecommendation(null);
    setAiPool(sortedPlaces);
    lockedRecommendation.current = null;
    const finalSubtypes = mode === "randomTaste" ? getRandomSubtypeGroup(selectedSubtypes) : normalizeSubtypes(selectedSubtypes);
    setAiSubtypes(finalSubtypes);

    const startedAt = Date.now();
    const rollTimer =
      mode === "randomTaste"
        ? window.setInterval(() => {
            const nextRolling = getRandomSubtypeGroup();
            setRollingSubtypes(nextRolling);
            setAiSubtypes(nextRolling);
          }, 140)
        : undefined;

    window.setTimeout(() => {
      if (rollTimer) window.clearInterval(rollTimer);
      setRollingSubtypes(finalSubtypes);
      setAiSubtypes(finalSubtypes);

      void (async () => {
        const pool =
          mode === "randomTaste"
            ? sortPlaces(
                (
                  await searchNearbyFood({
                    location,
                    category: selectedCategory,
                    subtypes: finalSubtypes,
                  })
                ).places,
              )
            : sortedPlaces;
        setAiPool(pool);

        const locked = await recommendPlaces({
          userText,
          location,
          selectedCategory,
          selectedSubtypes: finalSubtypes,
          selectedSubtypeLabels: finalSubtypes
            .map((id) => category.subtypes.find((item) => item.id === id)?.name)
            .filter(Boolean) as string[],
          weather,
          timeSlot: getCurrentTimeSlot().name,
          places: pool,
        });
        lockedRecommendation.current = locked;

        const elapsed = Date.now() - startedAt;
        window.setTimeout(() => {
          setAiRecommendation(lockedRecommendation.current);
          setIsRolling(false);
          setRollingSubtypes([]);
          setPetMood("praise");
          setPetLines(getAiPickedLines());
          setStatusMessage(
            mode === "randomTaste"
              ? `AI 随机换了口味，看完 ${pool.length} 个选择，给你圈了 3 个答案。`
              : `AI 按当前口味，看完 ${pool.length} 个选择，给你圈了 3 个答案。`,
          );
        }, Math.max(0, 2600 - elapsed));
      })();
    }, mode === "randomTaste" ? 1600 : 700);
  }

  async function rerollAiBatch() {
    if (isRolling || !aiPool.length) return;
    const rejectCount = (stats[getCurrentTimeSlot().id].aiRejects ?? 0) + 1;
    updateStats((current) => recordAiReject(current, getCurrentTimeSlot().id));
    setPetMood("scold");
    setPetScoldCount((count) => count + 1);
    setPetLines(getAiRejectedLines(rejectCount));
    setIsRolling(true);
    setAiRecommendation(null);
    const nextSubtypes = getRandomSubtypeGroup(aiSubtypes.length ? aiSubtypes : selectedSubtypes);
    setAiSubtypes(nextSubtypes);

    const startedAt = Date.now();
    const rollTimer = window.setInterval(() => {
      setAiSubtypes(getRandomSubtypeGroup());
    }, 130);

    const locked = await recommendPlaces({
      userText,
      location,
      selectedCategory,
      selectedSubtypes,
      selectedSubtypeLabels: selectedSubtypes
        .map((id) => category.subtypes.find((item) => item.id === id)?.name)
        .filter(Boolean) as string[],
      weather,
      timeSlot: getCurrentTimeSlot().name,
      places: aiPool,
    });

    window.setTimeout(() => {
      window.clearInterval(rollTimer);
      setAiSubtypes(nextSubtypes);
      setAiRecommendation(locked);
      setIsRolling(false);
    }, Math.max(0, 1200 - (Date.now() - startedAt)));
  }

  function closeAiModal() {
    setAiModalOpen(false);
    setAiRecommendation(null);
    setAiPool([]);
    setAiSubtypes([]);
    setRollingSubtypes([]);
    setIsRolling(false);
    showIdlePetTalk();
  }

  function changeSortMode(nextMode: SortMode) {
    setSortMode(nextMode);
  }

  function rerollSubtype() {
    const nextSubtypes = getRandomSubtypeGroup(selectedSubtypes);
    setSelectedSubtypes(nextSubtypes);
    void refreshPlaces(selectedCategory, nextSubtypes);
  }

  function swapSameType(place: Place, pickIndex: number) {
    const currentIds = new Set(aiRecommendation?.picks.map((pick) => pick.placeId) ?? []);
    const alternatives = aiPool.filter(
      (item) => item.subtype === place.subtype && item.id !== place.id && !currentIds.has(item.id),
    );
    if (!alternatives.length) {
      setPetMood("scold");
      setPetLines({
        ai: "这类备选已经被你榨干了，我先护住另外两张牌。",
        customer: "行吧，这次先记账。",
      });
      return;
    }
    const next = alternatives[Math.floor(Math.random() * alternatives.length)];
    setAiRecommendation((current) => {
      if (!current) return current;
      return {
        ...current,
        fallbackSubtype: next.subtype,
        picks: current.picks.map((pick, index) =>
          index === pickIndex
            ? {
                placeId: next.id,
                reason: "换了一家同类型的店，保留刚刚的口味方向，只动这一张牌。",
                confidence: Math.round((next.rating ?? 4.4) * 18),
              }
            : pick,
        ),
      };
    });
  }

  useEffect(() => {
    void locate();
  }, []);

  useEffect(() => {
    if (location) void refreshPlaces(selectedCategory, selectedSubtypes);
  }, [location]);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);

    void (async () => {
      const nextWeather = await getCurrentWeather(location);
      if (!cancelled) setWeather(nextWeather);
    })();

    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    if (petMood === "idle") {
      setPetLines(getIdlePetLines(getCurrentTimeSlot().id, weather));
    }
  }, [weather, petMood]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!aiModalOpen) setPetAnchors(getRandomPetAnchors());
    }, 3600);

    return () => window.clearInterval(timer);
  }, [aiModalOpen]);

  useEffect(() => {
    if (!aiModalOpen || petMood === "scold") return undefined;

    const timer = window.setInterval(() => {
      setModalPetAnchors(getRandomModalPetAnchors());
    }, 3200);

    return () => window.clearInterval(timer);
  }, [aiModalOpen, petMood]);

  useEffect(() => {
    if (!isLocationSuggestOpen) return;

    let cancelled = false;
    const delay = manualLocationText.trim() ? 220 : 0;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSuggestingLocation(true);
        const suggestions = await searchLocationSuggestions(manualLocationText, location);
        if (cancelled) return;
        setLocationSuggestions(suggestions);
        setIsSuggestingLocation(false);
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isLocationSuggestOpen, manualLocationText, location]);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="hero-copy">
          <p className="eyebrow">ASK AI, EAT EASY</p>
          <h1>随便吃吧</h1>
          <p className="hero-tagline">
            吃什么，问我不如问 AI。附近美食、口味偏好和随机灵感，一次帮你拍板。
          </p>
        </div>
        <button className="icon-button" onClick={locate} title="重新定位">
          <LocateFixed size={20} />
        </button>
      </section>

      <section className="status-strip">
        <div className="radar">
          <Compass size={18} />
        </div>
        <div>
          <strong>{location?.label ?? "等待定位"}</strong>
          <span>{statusMessage}</span>
        </div>
        <span className={searchSource === "amap" ? "source source-live" : "source"}>
          {searchSource === "amap" ? "高德实时" : hasAmapKey() ? "模拟兜底" : "模拟模式"}
        </span>
      </section>

      <section className="location-tuner" aria-label="位置校准">
        <div className="location-summary">
          <span>当前位置</span>
          <strong>{location?.label ?? "等待定位"}</strong>
          {location ? (
            <small>
              {location.lng.toFixed(5)}, {location.lat.toFixed(5)}
            </small>
          ) : null}
        </div>
        <div className="location-tools">
          <div className="location-search">
            <input
              value={manualLocationText}
              onFocus={() => setIsLocationSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setIsLocationSuggestOpen(false), 140)}
              onChange={(event) => {
                setManualLocationText(event.target.value);
                setIsLocationSuggestOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void applyManualLocation();
              }}
              aria-expanded={isLocationSuggestOpen}
              placeholder="输入商圈、地标或地址"
            />
            <button className="ghost-button" onClick={() => void applyManualLocation()} disabled={isResolvingLocation}>
              {isResolvingLocation ? "查找中" : "使用位置"}
            </button>
            {isLocationSuggestOpen ? (
              <div className="location-suggestions" role="listbox">
                {isSuggestingLocation ? (
                  <div className="location-suggestion muted">正在从高德查找附近位置...</div>
                ) : null}
                {!isSuggestingLocation && locationSuggestions.length
                  ? locationSuggestions.map((item) => (
                      <button
                        className="location-suggestion"
                        key={item.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applySuggestedLocation(item)}
                        type="button"
                      >
                        <strong>{item.name}</strong>
                        {item.address ? <small>{item.address}</small> : null}
                      </button>
                    ))
                  : null}
                {!isSuggestingLocation && !locationSuggestions.length ? (
                  <div className="location-suggestion muted">
                    {hasAmapKey() ? "暂无匹配位置，试试更具体的商圈或地标" : "配置高德 Key 后可使用位置联想"}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="location-chips">
            <button className="ghost-button" onClick={locate} disabled={locationStatus === "loading"}>
              <LocateFixed size={14} />
              重新定位
            </button>
            {quickLocations.map((item) => (
              <button className="ghost-button" key={`${item.lng}-${item.lat}`} onClick={() => applyQuickLocation(item)}>
                {item.label}
              </button>
            ))}
            {recentLocations.map((item) => (
              <button className="ghost-button recent-location" key={`${item.label}-${item.lng}-${item.lat}`} onClick={() => applyQuickLocation(item)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="layout">
        <div className="control-panel">
          <div className="section-heading">
            <span>先定今日食欲</span>
            <button className="ghost-button" onClick={() => void refreshPlaces()}>
              <RefreshCw size={16} />
              刷新
            </button>
          </div>

          <div className="category-grid">
            {foodCategories.map((item) => {
              const Icon = iconMap[item.icon as keyof typeof iconMap] ?? Utensils;
              return (
                <button
                  key={item.id}
                  className={`category-chip ${selectedCategory === item.id ? "active" : ""}`}
                  onClick={() => selectCategory(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>

          <div className="section-heading compact">
            <span>再圈心动口味</span>
            <button className="ghost-button" onClick={rerollSubtype}>
              <Shuffle size={16} />
              随机组合
            </button>
          </div>

          <div className="subtype-grid">
            {category.subtypes.map((item) => (
              <button
                key={item.id}
                className={`subtype-chip ${
                  selectedSubtypes.includes(item.id) || rollingSubtypes.includes(item.id) ? "active" : ""
                } ${rollingSubtypes.includes(item.id) ? "rolling-hit" : ""}`}
                onClick={() => toggleSubtype(item.id)}
              >
                <span>{item.name}</span>
                <i />
              </button>
            ))}
          </div>

          <div className="ai-panel">
            <div className="ai-copy">
              <Sparkles size={18} />
              <span>交给 AI 纠结一下</span>
            </div>
            <textarea
              value={userText}
              onChange={(event) => setUserText(event.target.value)}
              placeholder="比如：不想太辣，想吃热乎的，最好别走太远。"
            />
            <div className="ai-action-row">
              <button
                className="primary-button secondary-ai-button"
                onClick={() => runAiPick("randomTaste")}
                disabled={isRolling || !places.length}
              >
                {isRolling ? <RotateCcw size={18} className="spin" /> : <Shuffle size={18} />}
                <span>{isRolling ? "AI 正在分析" : "随机口味"}</span>
              </button>
              <button
                className="primary-button"
                onClick={() => runAiPick("lockedTaste")}
                disabled={isRolling || !places.length}
              >
                {isRolling ? <RotateCcw size={18} className="spin" /> : <MessageCircle size={18} />}
                <span>{isRolling ? "AI 正在分析" : "按当前口味"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="stage">
          <div className="stage-top">
            <div className={`wheel-zone pet-mood-${petMood}`}>
              <div className="pet-scene" aria-live="polite">
                <div
                  className={`pet ai-pet ${petMood === "scold" ? "is-scolded" : ""}`}
                  key={`ai-${petScoldCount}`}
                  style={{ left: `${petAnchors.ai.left}%`, top: `${petAnchors.ai.top}%` }}
                >
                  <span className={`speech-bubble ai-speech ${petMood === "scold" ? "urgent" : ""}`}>
                    {petLines.ai}
                  </span>
                  <span className="pet-label">AI</span>
                  <span className="pet-head"><i /><i /></span>
                  <span className="pet-body"><b /></span>
                  <span className="pet-feet" />
                </div>
                <div
                  className="pet customer-pet"
                  style={{ left: `${petAnchors.customer.left}%`, top: `${petAnchors.customer.top}%` }}
                >
                  <span className="speech-bubble customer-speech">{petLines.customer}</span>
                  <span className="pet-label">顾客</span>
                  <span className="pet-head"><i /><i /></span>
                  <span className="pet-body"><b /></span>
                  <span className="pet-feet" />
                </div>
              </div>

              <div className={`wheel ${isRolling ? "wheel-active" : ""}`}>
            <div className="wheel-category">
              <strong>{category.name}</strong>
            </div>
            <div className="taste-orbits" aria-label="已圈口味">
              {displaySubtypes.map((item, index) => {
                const total = Math.max(displaySubtypes.length, 1);
                const { left, top } = getBubblePosition(index, total);
                return (
                  <button
                    key={`${item.id}-${index}`}
                    className="taste-bubble"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      animationDelay: `${index * 110}ms`,
                    }}
                    onClick={() => !isRolling && toggleSubtype(item.id)}
                    title={isRolling ? "AI 正在随机组合口味" : `取消 ${item.name}`}
                    type="button"
                  >
                    <span>{item.name}</span>
                    <small>取消</small>
                  </button>
                );
              })}
            </div>
              </div>
            </div>

            <aside className="stats-panel" aria-label="当前时间段选择统计">
              <div className="stats-heading">
                <div>
                  <p className="eyebrow">LIVE TASTE</p>
                  <h3>{activeSlot.name}战报</h3>
                </div>
                <span className="weather-chip">
                  {weather?.weather ? `${weather.city ?? "附近"} · ${weather.weather}${weather.temperature ? ` ${weather.temperature}°C` : ""}` : "本地统计"}
                </span>
              </div>
              <div className="stat-bars">
                {foodCategories.map((item) => {
                  const count = activeStats.categories[item.id] ?? 0;
                  return (
                    <div className="stat-row" key={item.id}>
                      <span>{item.name}</span>
                      <i style={{ width: `${Math.max(8, (count / maxCategoryCount) * 100)}%` }} />
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="ai-stat-grid">
                <div>
                  <strong>{activeStats.aiUses}</strong>
                  <span>AI 出手</span>
                </div>
                <div>
                  <strong>{activeStats.aiRejects}</strong>
                  <span>不满意</span>
                </div>
              </div>
              <p className="stat-summary">{summarizeSlot(activeStats)}</p>
            </aside>
          </div>

          <div className="results-head">
            <div>
              <p className="eyebrow">NEARBY</p>
              <h2>附近可选店铺</h2>
            </div>
            <div className="result-tools">
              <div className="filter-controls" aria-label="店铺筛选">
                <button
                  className={sortMode === "distance" ? "active" : ""}
                  onClick={() => changeSortMode("distance")}
                >
                  距离优先
                </button>
                <button
                  className={sortMode === "rating" ? "active" : ""}
                  onClick={() => changeSortMode("rating")}
                >
                  评分优先
                </button>
                {hiddenPlaceCount ? (
                  <button onClick={restoreHiddenPlaces}>
                    恢复隐藏
                  </button>
                ) : null}
              </div>
              <span>{resultCountLabel}</span>
            </div>
          </div>

          <div className="result-list">
            {resultItems.map(({ place }, index) => (
              <article
                className="place-card"
                key={`${place.id}-${index}`}
                onMouseEnter={() => showPlacePetTalk(place)}
                onMouseLeave={showIdlePetTalk}
              >
                <div className="place-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="place-quick-actions" aria-label={`${place.name} 快捷操作`}>
                  <button
                    className={favoritePlaceIds.includes(place.id) ? "active" : ""}
                    onClick={() => toggleFavoritePlace(place)}
                    title={favoritePlaceIds.includes(place.id) ? "取消收藏" : "收藏"}
                    type="button"
                  >
                    <Heart size={15} />
                  </button>
                  <button onClick={() => setSelectedPlace(place)} title="查看详情" type="button">
                    <Info size={15} />
                  </button>
                  <button onClick={() => hidePlace(place)} title="不想吃这家" type="button">
                    <Ban size={15} />
                  </button>
                </div>
                <div className={`place-photo ${place.photos?.[0] ? "" : "place-photo-empty"}`}>
                  {place.photos?.[0] ? (
                    <img
                      src={place.photos[0]}
                      alt={`${place.name} 店铺照片`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{place.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="place-body">
                  <div>
                    <h3>{place.name}</h3>
                    <p>{place.address}</p>
                  </div>
                  <div className="place-meta">
                    <span>{formatDistance(place.distance)}</span>
                    {place.rating ? <span>{place.rating.toFixed(1)} 分</span> : null}
                  </div>
                </div>
                <div className="place-actions">
                  <a
                    href={getAmapNavigationUrl(place, location)}
                    target="_blank"
                    rel="noreferrer"
                    title="打开地图导航"
                    onClick={() => markNavigationStart(place)}
                  >
                    <Navigation size={16} />
                    <span>去这里</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {aiModalOpen ? (
        <div className="ai-modal-backdrop" onClick={closeAiModal}>
          <section className="ai-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ai-modal-head">
              <div>
                <p className="eyebrow">AI PICK</p>
                <h2>先吃这 3 家</h2>
              </div>
              <button className="icon-button" onClick={closeAiModal} title="关闭 AI 推荐">
                <X size={18} />
              </button>
            </div>

            <div className={`ai-orbit-line ${isRolling ? "ai-orbit-rolling" : ""}`}>
              {(aiSubtypes.length ? aiSubtypes : selectedSubtypes).map((subtypeId) => {
                const subtype = category.subtypes.find((item) => item.id === subtypeId);
                return subtype ? <span key={subtype.id}>{subtype.name}</span> : null;
              })}
              {aiRecommendation ? (
                <span className={`ai-source-pill ${aiRecommendation.source === "ai" ? "live" : ""}`}>
                  {aiRecommendation.source === "ai" ? "真实 AI" : "本地规则"}
                </span>
              ) : null}
            </div>

            <div className={`modal-pet-strip pet-mood-${petMood}`}>
              <div className="modal-pet-track" aria-hidden="true">
                <div
                  className={`pet ai-pet mini ${petMood === "scold" ? "is-scolded" : ""}`}
                  key={`modal-ai-${petScoldCount}`}
                  style={{ left: `${modalPetAnchors.ai}%` }}
                >
                  <span className="pet-talk ai-talk">{petLines.ai}</span>
                  <span className="pet-label">AI</span>
                  <span className="pet-head"><i /><i /></span>
                  <span className="pet-body"><b /></span>
                  <span className="pet-feet" />
                </div>
                <div className="pet customer-pet mini" style={{ left: `${modalPetAnchors.customer}%` }}>
                  <span className="pet-talk customer-talk">{petLines.customer}</span>
                  <span className="pet-label">顾客</span>
                  <span className="pet-head"><i /><i /></span>
                  <span className="pet-body"><b /></span>
                  <span className="pet-feet" />
                </div>
              </div>
            </div>

            {aiRecommendedPlaces.length ? (
              <div className="ai-result-grid">
                {aiRecommendedPlaces.map(({ place, pick }, index) => (
                  <article className="ai-result-card" key={`${place.id}-${index}`}>
                    <div className={`place-photo ${place.photos?.[0] ? "" : "place-photo-empty"}`}>
                      {place.photos?.[0] ? (
                        <img
                          src={place.photos[0]}
                          alt={`${place.name} 店铺照片`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{place.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="ai-card-copy">
                      <span className="place-rank mini">{String(index + 1).padStart(2, "0")}</span>
                      <h3>{place.name}</h3>
                      <p>{pick.reason}</p>
                      <div className="place-meta">
                        <span>{formatDistance(place.distance)}</span>
                        {place.rating ? <span>{place.rating.toFixed(1)} 分</span> : null}
                        <span>{pick.confidence}% 匹配</span>
                      </div>
                    </div>
                    <div className="place-actions">
                      <button onClick={() => swapSameType(place, index)} title="换同类型店铺">
                        <RefreshCw size={16} />
                        <span>换一家</span>
                      </button>
                      <a
                        href={getAmapNavigationUrl(place, location)}
                        target="_blank"
                        rel="noreferrer"
                        title="打开地图导航"
                        onClick={() => markNavigationStart(place)}
                      >
                        <Navigation size={16} />
                        <span>去这里</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ai-loading">
                <RotateCcw size={24} className="spin" />
                <span>AI 正在从当前筛选结果里洗牌</span>
              </div>
            )}

            <div className="ai-modal-actions">
              <button className="ghost-button" onClick={rerollAiBatch} disabled={isRolling || !aiPool.length}>
                <Shuffle size={16} />
                不满意，换一批
              </button>
              <button className="ghost-button" onClick={closeAiModal}>
                继续自己找
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedPlace ? (
        <div className="detail-backdrop" onClick={() => setSelectedPlace(null)}>
          <section className="place-detail" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="icon-button detail-close" onClick={() => setSelectedPlace(null)} title="关闭详情">
              <X size={18} />
            </button>
            <div className={`place-photo detail-photo ${selectedPlace.photos?.[0] ? "" : "place-photo-empty"}`}>
              {selectedPlace.photos?.[0] ? (
                <img
                  src={selectedPlace.photos[0]}
                  alt={`${selectedPlace.name} 店铺照片`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{selectedPlace.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="detail-copy">
              <p className="eyebrow">PLACE DETAIL</p>
              <h2>{selectedPlace.name}</h2>
              <p>{selectedPlace.address}</p>
              <div className="place-meta">
                <span>{formatDistance(selectedPlace.distance)}</span>
                {selectedPlace.rating ? <span>{selectedPlace.rating.toFixed(1)} 分</span> : null}
                {getSubtypeName(selectedPlace.subtype) ? <span>{getSubtypeName(selectedPlace.subtype)}</span> : null}
              </div>
            </div>
            <div className="detail-actions">
              <button onClick={() => copyPlaceAddress(selectedPlace)}>
                <Clipboard size={16} />
                复制地址
              </button>
              <button
                className={favoritePlaceIds.includes(selectedPlace.id) ? "active" : ""}
                onClick={() => toggleFavoritePlace(selectedPlace)}
              >
                <Heart size={16} />
                {favoritePlaceIds.includes(selectedPlace.id) ? "已收藏" : "收藏"}
              </button>
              <button onClick={() => hidePlace(selectedPlace)}>
                <Ban size={16} />
                不想吃
              </button>
              <a
                href={getAmapNavigationUrl(selectedPlace, location)}
                target="_blank"
                rel="noreferrer"
                onClick={() => markNavigationStart(selectedPlace)}
              >
                <Navigation size={16} />
                去这里
              </a>
            </div>
          </section>
        </div>
      ) : null}

      <section className="manual-dock">
        <MapPinned size={18} />
        <span>
          手动选中任意店铺后可直接打开地图。定位被拒绝、超时或未配置高德 Key 时，会自动进入可演示的模拟模式。
        </span>
      </section>
    </main>
  );
}

