import type { FoodCategoryId } from "../types";

export type TimeSlotId = "late-night" | "breakfast" | "lunch" | "tea" | "dinner" | "supper";

export interface TimeSlot {
  id: TimeSlotId;
  name: string;
  startHour: number;
  endHour: number;
}

export interface SlotStats {
  categories: Record<FoodCategoryId, number>;
  aiUses: number;
  aiRejects: number;
}

export type EatStats = Record<TimeSlotId, SlotStats>;

const storageKey = "eat-pick-mvp-stats-v1";

export const timeSlots: TimeSlot[] = [
  { id: "late-night", name: "凌晨档", startHour: 0, endHour: 5.5 },
  { id: "breakfast", name: "早餐档", startHour: 5.5, endHour: 10.5 },
  { id: "lunch", name: "午餐档", startHour: 10.5, endHour: 14.5 },
  { id: "tea", name: "下午茶档", startHour: 14.5, endHour: 17.5 },
  { id: "dinner", name: "晚餐档", startHour: 17.5, endHour: 21.5 },
  { id: "supper", name: "夜宵档", startHour: 21.5, endHour: 24 },
];

const categoryIds: FoodCategoryId[] = ["staple", "snack", "dessert", "grill", "light"];

function createSlotStats(): SlotStats {
  return {
    categories: categoryIds.reduce(
      (result, id) => ({ ...result, [id]: 0 }),
      {} as Record<FoodCategoryId, number>,
    ),
    aiUses: 0,
    aiRejects: 0,
  };
}

export function createEmptyStats(): EatStats {
  return timeSlots.reduce(
    (result, slot) => ({ ...result, [slot.id]: createSlotStats() }),
    {} as EatStats,
  );
}

export function getCurrentTimeSlot(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return timeSlots.find((slot) => hour >= slot.startHour && hour < slot.endHour) ?? timeSlots[0];
}

export function loadEatStats(): EatStats {
  if (typeof window === "undefined") return createEmptyStats();

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return createEmptyStats();
    const parsed = JSON.parse(stored) as Partial<EatStats>;
    const base = createEmptyStats();
    return timeSlots.reduce((result, slot) => {
      const saved = parsed[slot.id];
      result[slot.id] = {
        categories: { ...base[slot.id].categories, ...saved?.categories },
        aiUses: saved?.aiUses ?? 0,
        aiRejects: saved?.aiRejects ?? 0,
      };
      return result;
    }, base);
  } catch {
    return createEmptyStats();
  }
}

export function saveEatStats(stats: EatStats) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(stats));
}

export function recordCategoryChoice(stats: EatStats, categoryId: FoodCategoryId, slotId: TimeSlotId): EatStats {
  const next = structuredClone(stats);
  next[slotId].categories[categoryId] = (next[slotId].categories[categoryId] ?? 0) + 1;
  return next;
}

export function recordAiUse(stats: EatStats, slotId: TimeSlotId): EatStats {
  const next = structuredClone(stats);
  next[slotId].aiUses += 1;
  return next;
}

export function recordAiReject(stats: EatStats, slotId: TimeSlotId): EatStats {
  const next = structuredClone(stats);
  next[slotId].aiRejects += 1;
  return next;
}

export function summarizeSlot(stats: SlotStats) {
  const categoryTotal = Object.values(stats.categories).reduce((sum, count) => sum + count, 0);
  if (!categoryTotal && !stats.aiUses) return "这个时段还没人拍板，AI 正在假装淡定。";
  if (stats.aiRejects >= 5) return `AI 已被嫌弃 ${stats.aiRejects} 次，正在被顾客狠狠复盘。`;
  if (stats.aiUses > categoryTotal) return "大家今天很信 AI，但 AI 已经开始飘了。";
  return `已有 ${categoryTotal} 次口味选择，AI 被叫来参谋 ${stats.aiUses} 次。`;
}
