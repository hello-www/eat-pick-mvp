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
}
