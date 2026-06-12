export interface Tenant {
  tenant_id: string; // unique short text id
  name: string;
  bot_username: string;
  owner_telegram_id: string;
  owner_username: string;
  monthly_price: number;
  status: 'active' | 'suspended' | 'trial' | 'expired';
  rent_start: string; // ISO DateTime
  rent_end: string;   // ISO DateTime
  dashboard_enabled: boolean;
  dashboard_secret_hash: string | null;
  dashboard_password_set_at: string | null;
  dashboard_first_login_at: string | null;
  dashboard_last_login_at: string | null;
  dashboard_password_reset_required: boolean;
  service_url?: string;
  notes?: string;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  price: number;
  duration: string; // e.g., "1 month", "permanent"
  description: string;
  stock: number;
  auto_delivery: boolean;
  active: boolean;
  status?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  tenant_id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
}

export interface Order {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id: string | null;
  status: 'pending' | 'waiting_approval' | 'completed' | 'cancelled' | 'rejected';
  payer_username: string;
  payer_telegram_id?: string;
  amount: number;
  created_at: string;
  receipt_url?: string;
  approved_at?: string;
  notes?: string;
}

export interface Credential {
  id: string;
  tenant_id: string;
  product_id: string;
  variant_id: string | null;
  email: string;
  password: string;
  is_used: boolean;
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  points: number;
  joined_at: string;
}

export interface BotSetting {
  tenant_id: string;
  key: string;
  value: string;
  description: string;
}

export interface PointHistory {
  id: string;
  tenant_id: string;
  user_id: string; // telegram_id or username
  amount: number;
  reason: string;
  created_at: string;
}

export interface RentalPayment {
  id: string;
  tenant_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  period_start: string;
  period_end: string;
  paid_at?: string;
}

export interface TenantAuditLog {
  id: string;
  tenant_id: string;
  message: string;
  action: string;
  created_at: string;
  ip_address?: string;
}

// Session objects
export interface SessionData {
  role: 'tenant' | 'master';
  tenant_id?: string;
  username?: string;
}
