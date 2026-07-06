import type { FoodCategory } from "../types";

export const foodCategories: FoodCategory[] = [
  {
    id: "staple",
    name: "正餐主力",
    icon: "Rice",
    subtypes: [
      { id: "rice", name: "米饭", keywords: ["盖饭", "煲仔饭", "饭", "便当"] },
      { id: "noodle", name: "粉面", keywords: ["面", "粉", "米线", "拉面"] },
      { id: "baozi", name: "包点饺子", keywords: ["包子", "饺子", "馄饨", "烧麦"] },
      { id: "western", name: "汉堡披萨", keywords: ["汉堡", "披萨", "三明治"] },
      { id: "hotpot", name: "火锅", keywords: ["火锅", "涮肉", "牛油锅"] },
      { id: "bbq", name: "烧烤烤肉", keywords: ["烧烤", "烤肉", "烤串"] },
    ],
  },
  {
    id: "snack",
    name: "小吃夜宵",
    icon: "Spark",
    subtypes: [
      { id: "skewer", name: "炸串", keywords: ["炸串", "串串", "烤肠"] },
      { id: "street", name: "街边小吃", keywords: ["小吃", "煎饼", "肉夹馍", "臭豆腐"] },
      { id: "dimsum", name: "点心", keywords: ["点心", "糕点", "蛋挞"] },
      { id: "late", name: "夜宵", keywords: ["夜宵", "宵夜", "烧烤"] },
      { id: "mala", name: "麻辣烫", keywords: ["麻辣烫", "冒菜", "麻辣香锅"] },
    ],
  },
  {
    id: "dessert",
    name: "轻甜饮品",
    icon: "Cup",
    subtypes: [
      { id: "milk-tea", name: "奶茶果茶", keywords: ["奶茶", "茶饮", "果茶"] },
      { id: "coffee", name: "咖啡", keywords: ["咖啡", "拿铁", "美式"] },
      { id: "dessert", name: "甜品", keywords: ["甜品", "蛋糕", "冰淇淋"] },
      { id: "salad", name: "轻食沙拉", keywords: ["沙拉", "轻食", "健康餐"] },
      { id: "brunch", name: "早午餐", keywords: ["早午餐", "brunch", "吐司"] },
      { id: "soup", name: "汤粥", keywords: ["粥", "汤", "砂锅粥"] },
    ],
  },
];

export function getCategoryKeywords(categoryId: string, subtypeIds?: string[]) {
  const category = foodCategories.find((item) => item.id === categoryId);
  if (!category) return ["美食"];
  const selected = category.subtypes.filter((item) => subtypeIds?.includes(item.id));
  if (selected.length) return selected.flatMap((item) => item.keywords);
  return category.subtypes.flatMap((item) => item.keywords);
}
