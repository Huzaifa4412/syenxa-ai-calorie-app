export type NutritionValues = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodItem = NutritionValues & {
  name: string;
  quantity: string;
};

export type MealAnalysis = {
  status?: "success";
  total: NutritionValues;
  food: FoodItem[];
  micronutrients?: Array<{
    name: string;
    estimate: string;
    notes: string;
  }>;
  health_considerations?: string[];
  confidence?: "low" | "medium" | "high";
  assumptions?: string[];
  disclaimer?: string;
};

export type ScanQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
};

export type AnalysisResponse = {
  output: MealAnalysis | null;
  quota: ScanQuota;
};
