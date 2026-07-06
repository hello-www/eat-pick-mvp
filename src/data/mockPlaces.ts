import type { FoodCategoryId, GeoLocation, Place } from "../types";

const baseLocation: GeoLocation = {
  lng: 113.2644,
  lat: 23.1291,
  label: "模拟定位：广州市中心",
};

const names: Record<FoodCategoryId, Array<[string, string]>> = {
  staple: [
    ["稻香便当研究所", "rice"],
    ["一碗热汤粉", "noodle"],
    ["半笼烟火包子铺", "baozi"],
    ["夜航披萨汉堡", "western"],
    ["雾气火锅", "hotpot"],
    ["炭火星球烤肉", "bbq"],
  ],
  snack: [
    ["咔滋炸串局", "skewer"],
    ["巷口煎饼档", "street"],
    ["小满点心铺", "dimsum"],
    ["凌晨三点夜宵社", "late"],
    ["红油冒菜馆", "mala"],
  ],
  grill: [
    ["雾气火锅", "hotpot"],
    ["炭火星球烤肉", "bbq"],
    ["红油冒菜馆", "mala"],
    ["热辣麻辣香锅", "mala"],
  ],
  dessert: [
    ["琥珀奶茶制冰室", "milk-tea"],
    ["晨雾咖啡", "coffee"],
    ["月光甜品档", "dessert"],
    ["小岛蛋糕", "dessert"],
    ["绿洲沙拉碗", "salad"],
    ["午后吐司社", "brunch"],
    ["暖胃砂锅粥", "soup"],
  ],
  light: [
    ["绿洲沙拉碗", "salad"],
    ["午后吐司社", "brunch"],
    ["暖胃砂锅粥", "soup"],
    ["轻盈简餐室", "salad"],
  ],
};

export function getMockLocation() {
  return baseLocation;
}

export function makeMockPlaces(category?: FoodCategoryId, subtypes?: string[]): Place[] {
  const categories = category ? [category] : (Object.keys(names) as FoodCategoryId[]);
  return categories.flatMap((categoryId, categoryIndex) =>
    names[categoryId]
      .filter(([, subtypeId]) => !subtypes?.length || subtypes.includes(subtypeId))
      .flatMap(([name, subtypeId], index) => {
        const variants = ["", "·精选店", "·快取店"];
        return variants.map((suffix, variantIndex) => {
          const seed = categoryIndex * 17 + index * 3 + variantIndex + 1;
          return {
            id: `mock-${categoryId}-${subtypeId}-${index}-${variantIndex}`,
            name: `${name}${suffix}`,
            address: `附近 ${seed + 1} 号街区 · 步行 ${6 + (seed % 12)} 分钟`,
            distance: 160 + seed * 95,
            location: {
              lng: baseLocation.lng + seed * 0.0015,
              lat: baseLocation.lat + seed * 0.0011,
              label: `${name}${suffix}`,
            },
            category: categoryId,
            subtype: subtypeId,
            rating: Number((4.2 + (seed % 7) * 0.1).toFixed(1)),
          };
        });
      }),
  );
}
