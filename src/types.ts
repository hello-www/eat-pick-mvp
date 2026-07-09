export type FoodCategoryId =
  | "staple"
  | "snack"
  | "grill"
  | "dessert"
  | "light";

export interface FoodSubtype {
  id: string;
  name: string;
  keywords: string[];
}

export interface FoodCategory {
  id: FoodCategoryId;
  name: string;
  icon: string;
  subtypes: FoodSubtype[];
}

export interface GeoLocation {
  lng: number;
  lat: number;
  label?: string;
}

export interface LocationSuggestion {
  id: string;
  name: string;
  address?: string;
  location: GeoLocation;
}

export interface WeatherSnapshot {
  city?: string;
  weather?: string;
  temperature?: number;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  distance: number;
  location: GeoLocation;
  category: FoodCategoryId;
  subtype?: string;
  rating?: number;
  photos?: string[];
}

export interface RecommendRequest {
  userText: string;
  location: GeoLocation | null;
  selectedCategory?: FoodCategoryId;
  selectedSubtypes?: string[];
  selectedSubtypeLabels?: string[];
  weather?: WeatherSnapshot | null;
  timeSlot?: string;
  places: Place[];
}

export interface RecommendPick {
  placeId: string;
  reason: string;
  confidence: number;
}

export interface RecommendResponse {
  picks: RecommendPick[];
  fallbackSubtype?: string;
  source?: "ai" | "local";
}
