export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  revolut_connected: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  description: string | null;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "custom";
  is_active: boolean;
}

export interface ListItem {
  id: string;
  rohlik_product_id: string | null;
  rohlik_product_name: string | null;
  generic_name: string | null;
  quantity: number;
  unit: string | null;
  is_checked: boolean;
}

export interface ScheduleSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_type: string;
  label: string | null;
  is_home: boolean;
}

export interface Order {
  id: string;
  status: string;
  total_amount: number | null;
  currency: string;
  discount_saved: number;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  approved_at: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  created_at: string;
}
