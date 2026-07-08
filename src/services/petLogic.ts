import type { Place, WeatherSnapshot } from "../types";
import type { TimeSlotId } from "./eatStats";

export interface PetLines {
  ai: string;
  customer: string;
}

export type PetMood = "idle" | "comment" | "praise" | "scold";

const timeFlavor: Record<TimeSlotId, string> = {
  "late-night": "这个点还在纠结吃什么，胃已经开始写小作文了。",
  breakfast: "早上别太硬核，先让身体开机。",
  lunch: "午餐档要讲效率，吃饱才有资格继续对抗世界。",
  tea: "下午茶档，血糖和灵魂都需要一点安慰。",
  dinner: "晚餐档适合认真吃，今天的委屈可以下饭。",
  supper: "夜宵档已经启动，理智暂时下线。",
};

function isHot(weather: WeatherSnapshot | null) {
  return typeof weather?.temperature === "number" && weather.temperature >= 30;
}

function isRainy(weather: WeatherSnapshot | null) {
  return Boolean(weather?.weather && /雨|雷|阵雨/.test(weather.weather));
}

function weatherPrefix(weather: WeatherSnapshot | null) {
  if (!weather?.weather) return "";
  const temp = typeof weather.temperature === "number" ? `${weather.temperature}°C` : "";
  return `${weather.weather}${temp ? ` ${temp}` : ""}，`;
}

export function getIdlePetLines(slotId: TimeSlotId, weather: WeatherSnapshot | null): PetLines {
  return {
    ai: `${weatherPrefix(weather)}${timeFlavor[slotId]}`,
    customer: "先别吵，我看看。",
  };
}

export function getPlacePetLines(
  place: Place,
  subtypeName: string | undefined,
  slotId: TimeSlotId,
  weather: WeatherSnapshot | null,
): PetLines {
  const label = subtypeName ?? place.subtype ?? "这家";
  const ratingLine = place.rating && place.rating >= 4.5 ? "评分看着挺能打，别让期待太大声。" : "评分一般也不代表不好吃，人生需要一点盲盒。";

  if (isHot(weather) && /烧烤|烤肉|火锅|炸/.test(label)) {
    return {
      ai: `大热天吃${label}？有意思，你是来和太阳单挑的。`,
      customer: "要你管。",
    };
  }

  if (isRainy(weather) && /粉|面|汤|火锅|粥/.test(label)) {
    return {
      ai: `下雨天配${label}，合理到我都想给自己点个赞。`,
      customer: "少分析，多带路。",
    };
  }

  if (slotId === "lunch" && place.distance <= 300) {
    return {
      ai: `午餐就近原则启动，${place.name} 这个距离很懂打工人的命。`,
      customer: "这句还算中听。",
    };
  }

  if (slotId === "supper") {
    return {
      ai: `夜宵时间看到${label}，理智说不行，快乐说我来。`,
      customer: "理智先退下。",
    };
  }

  return {
    ai: `${weatherPrefix(weather)}${ratingLine}`,
    customer: "你话好多。",
  };
}

export function getAiPickedLines(): PetLines {
  return {
    ai: "我圈好了三家，今天的选择困难先交给我保管。",
    customer: "这次算你有点东西。",
  };
}

export function getAiRejectedLines(rejects: number): PetLines {
  return {
    ai: `收到第 ${rejects} 次不满意，我正在把推荐逻辑重新拧紧。`,
    customer: "重新想，别糊弄我。",
  };
}
