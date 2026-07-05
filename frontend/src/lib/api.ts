import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refresh,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (email: string, password: string, full_name?: string) =>
    api.post("/auth/register", { email, password, full_name }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

export const listsApi = {
  getAll: () => api.get("/lists/"),
  create: (name: string, frequency = "weekly") =>
    api.post("/lists/", { name, frequency }),
  getOne: (listId: string) => api.get(`/lists/${listId}`),
  update: (
    listId: string,
    patch: { name?: string; description?: string; frequency?: string }
  ) => api.patch(`/lists/${listId}`, patch),
  delete: (listId: string) => api.delete(`/lists/${listId}`),

  // Merged shopping view (all lists currently due)
  getShopping: () => api.get("/lists/shopping"),

  // Priced cart: resolves items to Rohlík products + totals (slower, hits Rohlík)
  getCart: () => api.get("/lists/shopping/cart"),

  addItem: (
    listId: string,
    item: {
      generic_name?: string;
      rohlik_product_id?: string;
      rohlik_product_name?: string;
      rohlik_image_url?: string;
      quantity?: number;
      unit?: string;
      notes?: string;
    }
  ) => api.post(`/lists/${listId}/items`, item),

  updateItem: (
    listId: string,
    itemId: string,
    patch: {
      quantity?: number;
      unit?: string;
      notes?: string;
      is_checked?: boolean;
      rohlik_product_id?: string;
      rohlik_product_name?: string;
      rohlik_image_url?: string;
    }
  ) => api.patch(`/lists/${listId}/items/${itemId}`, patch),

  deleteItem: (listId: string, itemId: string) =>
    api.delete(`/lists/${listId}/items/${itemId}`),
};

export const rohlikApi = {
  search: (q: string) => api.get("/lists/rohlik/search", { params: { q } }),
  discounted: () => api.get("/lists/rohlik/discounted"),
};

export const ordersApi = {
  getAll: () => api.get("/orders"),
  create: (delivery?: {
    delivery_date?: string;
    delivery_start?: string;
    delivery_end?: string;
  }) => api.post("/orders", delivery ?? {}),
};

export const rohlikMcpApi = {
  getStatus: (probe = false) => api.get("/rohlik-mcp/status", { params: { probe } }),
  connect: (email: string, password: string) =>
    api.post("/rohlik-mcp/connect", { email, password }),
  disconnect: () => api.post("/rohlik-mcp/disconnect"),
  getAddresses: () => api.get("/rohlik-mcp/addresses"),
  selectAddress: (address_id: number) => api.put("/rohlik-mcp/address", { address_id }),
  pushCart: () => api.post("/rohlik-mcp/cart"),
};

export const chatApi = {
  getHistory: () => api.get("/chat/"),
  send: (message: string) =>
    api.post("/chat/", { message }, { timeout: 180_000 }), // agent může běžet dlouho
  clear: () => api.delete("/chat/"),
};

export const scheduleApi = {
  getAll: () => api.get("/schedule/"),
  getDeliverySlots: (days = 7) =>
    api.get("/schedule/delivery-slots", { params: { days } }),
  create: (slot: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    activity_type: string;
    label?: string;
    is_home?: boolean;
  }) => api.post("/schedule/", slot),
  update: (id: string, patch: {
    day_of_week?: number;
    start_time?: string;
    end_time?: string;
  }) => api.patch(`/schedule/${id}`, patch),
  delete: (id: string) => api.delete(`/schedule/${id}`),
};
