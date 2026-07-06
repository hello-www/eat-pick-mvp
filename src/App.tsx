import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  CupSoda,
  Flame,
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
import { getAmapNavigationUrl, hasAmapKey, searchNearbyFood } from "./services/amap";
import { recommendPlaces } from "./services/recommend";
import type { FoodCategoryId, GeoLocation, Place, RecommendResponse } from "./types";

const iconMap = {
  Rice: Utensils,
  Spark: Sparkles,
  Flame,
  Cup: CupSoda,
  Leaf,
};

type SearchSource = "amap" | "mock";
type SortMode = "distance" | "rating";

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

export default function App() {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("点击定位后，马上帮你看看附近有什么可吃。");
  const [selectedCategory, setSelectedCategory] = useState<FoodCategoryId>("staple");
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>(["rice", "noodle"]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [searchSource, setSearchSource] = useState<SearchSource>("mock");
  const [isSearching, setIsSearching] = useState(false);
  const [userText, setUserText] = useState("");
  const [isRolling, setIsRolling] = useState(false);
  const [rollingSubtypes, setRollingSubtypes] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<RecommendResponse | null>(null);
  const [aiPool, setAiPool] = useState<Place[]>([]);
  const [aiSubtypes, setAiSubtypes] = useState<string[]>([]);
  const lockedRecommendation = useRef<RecommendResponse | null>(null);

  const category = useMemo(
    () => foodCategories.find((item) => item.id === selectedCategory) ?? foodCategories[0],
    [selectedCategory],
  );
  const categorySubtypeIds = useMemo(() => new Set(category.subtypes.map((item) => item.id)), [category]);

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

  const sortedPlaces = useMemo(() => {
    return [...places].sort((a, b) => {
      if (sortMode === "rating") {
        return (b.rating ?? 0) - (a.rating ?? 0) || a.distance - b.distance;
      }

      return a.distance - b.distance;
    });
  }, [places, sortMode]);

  const resultItems = useMemo(
    () => sortedPlaces.map((place) => ({ place, pick: null })),
    [sortedPlaces],
  );

  const resultCountLabel = isSearching
    ? "搜索中..."
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
    setLocation(result.location);
    setLocationStatus(result.status);
    setStatusMessage(result.message);
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

  async function runAiPick() {
    if (isRolling || !sortedPlaces.length) return;
    setIsRolling(true);
    setAiModalOpen(true);
    setAiRecommendation(null);
    setAiPool(sortedPlaces);
    lockedRecommendation.current = null;
    const finalSubtypes = getRandomSubtypeGroup(selectedSubtypes);
    setAiSubtypes(finalSubtypes);

    const startedAt = Date.now();
    const rollTimer = window.setInterval(() => {
      const nextRolling = getRandomSubtypeGroup();
      setRollingSubtypes(nextRolling);
      setAiSubtypes(nextRolling);
    }, 140);

    window.setTimeout(() => {
      window.clearInterval(rollTimer);
      setRollingSubtypes(finalSubtypes);
      setAiSubtypes(finalSubtypes);

      void (async () => {
        const locked = await recommendPlaces({
          userText,
          location,
          selectedCategory,
          selectedSubtypes,
          places: sortedPlaces,
        });
        lockedRecommendation.current = locked;

        const elapsed = Date.now() - startedAt;
        window.setTimeout(() => {
          setAiRecommendation(lockedRecommendation.current);
          setIsRolling(false);
          setRollingSubtypes([]);
          setStatusMessage(`AI 看完当前 ${sortedPlaces.length} 个选择，给你圈了 3 个答案。`);
        }, Math.max(0, 2600 - elapsed));
      })();
    }, 1600);
  }

  async function rerollAiBatch() {
    if (isRolling || !aiPool.length) return;
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
  }

  function changeSortMode(nextMode: SortMode) {
    setSortMode(nextMode);
  }

  function rerollSubtype() {
    const nextSubtypes = getRandomSubtypeGroup(selectedSubtypes);
    setSelectedSubtypes(nextSubtypes);
    void refreshPlaces(selectedCategory, nextSubtypes);
  }

  function swapSameType(place: Place) {
    const alternatives = places.filter(
      (item) => item.subtype === place.subtype && item.id !== place.id,
    );
    if (!alternatives.length) {
      void refreshPlaces(selectedCategory, place.subtype ? [place.subtype] : selectedSubtypes);
      return;
    }
    const next = alternatives[Math.floor(Math.random() * alternatives.length)];
    setAiRecommendation({
      fallbackSubtype: next.subtype,
      picks: [
        {
          placeId: next.id,
          reason: "换了一家同类型的店，适合保留刚刚的口味方向。",
          confidence: Math.round((next.rating ?? 4.4) * 18),
        },
      ],
    });
  }

  useEffect(() => {
    void locate();
  }, []);

  useEffect(() => {
    if (location) void refreshPlaces(selectedCategory, selectedSubtypes);
  }, [location]);

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
            <button className="primary-button" onClick={runAiPick} disabled={isRolling || !places.length}>
              {isRolling ? <RotateCcw size={18} className="spin" /> : <MessageCircle size={18} />}
              {isRolling ? "AI 正在分析" : "让 AI 帮我选"}
            </button>
          </div>
        </div>

        <div className="stage">
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
              </div>
              <span>{resultCountLabel}</span>
            </div>
          </div>

          <div className="result-list">
            {resultItems.map(({ place }, index) => (
              <article className="place-card" key={`${place.id}-${index}`}>
                <div className="place-rank">{String(index + 1).padStart(2, "0")}</div>
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
                  <a href={getAmapNavigationUrl(place)} target="_blank" rel="noreferrer" title="打开地图导航">
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
                      <button onClick={() => swapSameType(place)} title="换同类型店铺">
                        <RefreshCw size={16} />
                        <span>换一家</span>
                      </button>
                      <a href={getAmapNavigationUrl(place)} target="_blank" rel="noreferrer" title="打开地图导航">
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

      <section className="manual-dock">
        <MapPinned size={18} />
        <span>
          手动选中任意店铺后可直接打开地图。定位被拒绝、超时或未配置高德 Key 时，会自动进入可演示的模拟模式。
        </span>
      </section>
    </main>
  );
}
