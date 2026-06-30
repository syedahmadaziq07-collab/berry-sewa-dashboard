import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { 
  Tenant, Product, ProductVariant, Order, Credential, 
  User, BotSetting, PointHistory, RentalPayment, TenantAuditLog 
} from './types';

// Password hashing helper using standard Node.js crypto
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

const BACKUP_PATH = path.join(process.cwd(), 'berry_db_backup.json');

// Default bot settings
const defaultKeys = [
  { key: 'welcome_message', value: 'Welcome to our store.', description: 'Greeting message sent to new bot users' },
  { key: 'support_username', value: '@berry_support', description: 'Username for customer support inquiries' },
  { key: 'shop_title', value: '📦 LIST PRODUCTS', description: 'Message header when showing products' },
  { key: 'shop_footer', value: 'Tap a product to view details.', description: 'Message footer when showing products' },
  { key: 'out_of_stock_msg', value: '⚠️ Stock is currently unavailable.', description: 'Shown when a product/variant is out of stock' },
  { key: 'product_delivery_note', value: '• Account will be delivered immediately after payment.', description: 'Note shown before checking out' },
  { key: 'payment_title', value: '💳 PAYMENT DETAILS', description: 'Title of the payment instructions screen' },
  { key: 'payment_instruction', value: 'Please scan the QR code to pay.', description: 'General payment instructions' },
  { key: 'payment_button_instruction', value: 'After payment, click the button below.', description: 'Instructions on the confirmation button' },
  { key: 'order_summary_title', value: '🧾 ORDER SUMMARY', description: 'Title shown with order itemization' },
  { key: 'order_proceed_msg', value: 'Please continue to payment.', description: 'Subtext directing to checkout' },
  { key: 'delivery_msg', value: 'Your account will be delivered soon.', description: 'Message for manual delivery receipt' },
  { key: 'auto_delivery_msg', value: 'Your account is ready: {email} {password}', description: 'Template for automatic credential delivery' },
  { key: 'testimonial_template', value: 'Thank you for your purchase!', description: 'Template for customer testimonial' },
  { key: 'payment_qr_file_id', value: '', description: 'Telegram File ID for payment QR code' },
  { key: 'banner_file_id', value: '', description: 'Telegram File ID for shop welcome banner' },
  { key: 'payment_qr_url', value: '', description: 'Public URL of store payment QR image' },
  { key: 'banner_url', value: '', description: 'Public URL of shop welcome banner image' }
];

// Initialize Database structure
interface DBStructure {
  tenants: Tenant[];
  products: Product[];
  product_variants: ProductVariant[];
  orders: Order[];
  credentials: Credential[];
  users: User[];
  bot_settings: BotSetting[];
  points_history: PointHistory[];
  rental_payments: RentalPayment[];
  tenant_audit_logs: TenantAuditLog[];
}

const initialDB: DBStructure = {
  tenants: [
    {
      tenant_id: "premium_shop",
      name: "Berry Premium Bot",
      bot_username: "@BerryPremiumBot",
      owner_telegram_id: "85720491",
      owner_username: "sky_owner",
      monthly_price: 49.00,
      status: "active",
      rent_start: "2026-05-01T12:00:00Z",
      rent_end: "2026-10-01T12:00:00Z",
      dashboard_enabled: true,
      dashboard_secret_hash: hashPassword("password123"), // Seed password
      dashboard_password_set_at: "2026-05-01T12:10:00Z",
      dashboard_first_login_at: "2026-05-01T12:10:00Z",
      dashboard_last_login_at: "2026-06-09T03:40:00Z",
      dashboard_password_reset_required: false,
      service_url: "https://shop1.berrybots.com",
      notes: "Dedicated customer, premium shop instance",
      created_at: "2026-05-01T12:00:00Z"
    },
    {
      tenant_id: "vpn_store",
      name: "Fruit VPN Retail",
      bot_username: "@FruitVpnRetailBot",
      owner_telegram_id: "53920194",
      owner_username: "vpn_master",
      monthly_price: 35.00,
      status: "trial",
      rent_start: "2026-06-05T00:00:00Z",
      rent_end: "2026-06-15T00:00:00Z",
      dashboard_enabled: true,
      dashboard_secret_hash: null, // Treat as first-time setup
      dashboard_password_set_at: null,
      dashboard_first_login_at: null,
      dashboard_last_login_at: null,
      dashboard_password_reset_required: false,
      service_url: "",
      notes: "Trial user. Needs follow up on payment.",
      created_at: "2026-06-05T00:00:00Z"
    },
    {
      tenant_id: "alpha_games",
      name: "Alpha Game Vouchers",
      bot_username: "@AlphaGameVoucherBot",
      owner_telegram_id: "20485912",
      owner_username: "alpha_gamer",
      monthly_price: 39.00,
      status: "expired",
      rent_start: "2026-04-01T00:00:00Z",
      rent_end: "2026-06-01T00:00:00Z",
      dashboard_enabled: true,
      dashboard_secret_hash: hashPassword("alpha2026"),
      dashboard_password_set_at: "2026-04-01T10:00:00Z",
      dashboard_first_login_at: "2026-04-01T10:00:00Z",
      dashboard_last_login_at: "2026-05-25T14:00:00Z",
      dashboard_password_reset_required: false,
      service_url: "https://games.berrybots.com",
      notes: "Suspended rental status due to expiration.",
      created_at: "2026-04-01T00:00:00Z"
    },
    {
      tenant_id: "omega_keys",
      name: "Omega Digital Keys",
      bot_username: "@OmegaAdminBot",
      owner_telegram_id: "10574823",
      owner_username: "omega_owner",
      monthly_price: 45.00,
      status: "suspended",
      rent_start: "2026-01-10T00:00:00Z",
      rent_end: "2026-07-10T00:00:00Z",
      dashboard_enabled: false,
      dashboard_secret_hash: hashPassword("omega123"),
      dashboard_password_set_at: "2026-01-10T05:00:00Z",
      dashboard_first_login_at: "2026-01-10T05:00:00Z",
      dashboard_last_login_at: "2026-05-15T08:00:00Z",
      dashboard_password_reset_required: false,
      service_url: "",
      notes: "Violated TOS, disabled dashboard.",
      created_at: "2026-01-10T00:00:00Z"
    }
  ],
  products: [
    // premium_shop
    { id: "p1", tenant_id: "premium_shop", name: "Premium Spotify Account", price: 5.90, duration: "1 month", description: "Premium individual Spotify account with immediate active subscription.", stock: 2, auto_delivery: true, active: true },
    { id: "p2", tenant_id: "premium_shop", name: "Netflix Ultra HD Premium", price: 9.99, duration: "1 month", description: "Ultra HD Netflix profile access. Max 1 screen streaming allowed concurrently.", stock: 0, auto_delivery: true, active: true },
    { id: "p3", tenant_id: "premium_shop", name: "Custom Telegram Bot Dev", price: 150.00, duration: "permanent", description: "Custom Telegram Shop or Utility bot built to your custom specifications.", stock: 99, auto_delivery: false, active: true },
    
    // vpn_store
    { id: "vp1", tenant_id: "vpn_store", name: "FruitVPN Ultimate Protocol", price: 4.50, duration: "1 month", description: "Ultra-fast secure private tunnels supporting WireGuard client profiles.", stock: 5, auto_delivery: true, active: true },
    { id: "vp2", tenant_id: "vpn_store", name: "FruitVPN Family Pack", price: 12.00, duration: "3 months", description: "Voucher key redeemable for 3 simultaneous active client devices.", stock: 1, auto_delivery: true, active: true }
  ],
  product_variants: [
    { id: "v1", product_id: "p1", tenant_id: "premium_shop", name: "US Region Account", price: 5.90, stock: 1, active: true },
    { id: "v2", product_id: "p1", tenant_id: "premium_shop", name: "UK Region Account", price: 6.50, stock: 1, active: true },
    { id: "v3", product_id: "p2", tenant_id: "premium_shop", name: "Shared Screen", price: 9.99, stock: 0, active: true }
  ],
  orders: [
    { id: "o1", tenant_id: "premium_shop", product_id: "p1", variant_id: "v1", status: "completed", payer_username: "@alice_wonder", payer_telegram_id: "11223344", amount: 5.90, created_at: "2026-06-08T10:00:00Z", approved_at: "2026-06-08T10:02:00Z", notes: "A1 quality delivered automatically" },
    { id: "o2", tenant_id: "premium_shop", product_id: "p2", variant_id: "v3", status: "waiting_approval", payer_username: "@bob_builder", payer_telegram_id: "44332211", amount: 9.99, created_at: "2026-06-09T01:30:00Z", receipt_url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=500", notes: "Manual receipt uploaded, awaits admin confirmation" },
    { id: "o3", tenant_id: "premium_shop", product_id: "p3", variant_id: null, status: "pending", payer_username: "@gamer_guy", payer_telegram_id: "55667788", amount: 150.00, created_at: "2026-06-09T04:00:00Z", notes: "Awaiting crypto payment transfer confirm" },
    { id: "o4", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, status: "completed", payer_username: "@vpn_tester", payer_telegram_id: "99887766", amount: 4.50, created_at: "2026-06-07T15:20:00Z", approved_at: "2026-06-07T15:21:00Z", notes: "FruitVPN credential delivered" },
    { id: "o5", tenant_id: "premium_shop", product_id: "p1", variant_id: "v2", status: "rejected", payer_username: "@fake_troll", payer_telegram_id: "88888888", amount: 6.50, created_at: "2026-06-05T12:00:00Z", notes: "Fake receipt image provided." }
  ],
  credentials: [
    { id: "c1", tenant_id: "premium_shop", product_id: "p1", variant_id: "v1", email: "spotify.alice@berry.com", password: "alicepass1", is_used: true, created_at: "2026-06-01T12:00:00Z" },
    { id: "c2", tenant_id: "premium_shop", product_id: "p1", variant_id: "v1", email: "spotify.active.user2@berry.com", password: "berryuser2pass", is_used: false, created_at: "2026-06-01T12:00:00Z" },
    { id: "c3", tenant_id: "premium_shop", product_id: "p1", variant_id: "v2", email: "spotify.uk.active@berry.com", password: "ukpass1", is_used: false, created_at: "2026-06-01T12:00:00Z" },
    { id: "c4", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1104", password: "", is_used: true, created_at: "2026-06-05T12:00:00Z" },
    { id: "c5", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1106", password: "", is_used: false, created_at: "2026-06-05T13:00:00Z" },
    { id: "c6", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1107", password: "", is_used: false, created_at: "2026-06-05T13:00:00Z" },
    { id: "c7", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1108", password: "", is_used: false, created_at: "2026-06-05T13:00:00Z" },
    { id: "c8", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1109", password: "", is_used: false, created_at: "2026-06-05T13:00:00Z" },
    { id: "c9", tenant_id: "vpn_store", product_id: "vp1", variant_id: null, email: "fruitvpn-client-auth-token-1110", password: "", is_used: false, created_at: "2026-06-05T13:00:00Z" },
    { id: "c10", tenant_id: "vpn_store", product_id: "vp2", variant_id: null, email: "fruitvpn-premium-family-keys-992", password: "", is_used: false, created_at: "2026-06-05T14:40:00Z" }
  ],
  users: [
    { id: "u1", tenant_id: "premium_shop", telegram_id: "11223344", username: "alice_wonder", first_name: "Alice", points: 120, joined_at: "2026-05-15T12:00:00Z" },
    { id: "u2", tenant_id: "premium_shop", telegram_id: "44332211", username: "bob_builder", first_name: "Bob", points: 40, joined_at: "2026-05-16T14:00:00Z" },
    { id: "u3", tenant_id: "premium_shop", telegram_id: "55667788", username: "gamer_guy", first_name: "Gamer Guy", points: 0, joined_at: "2026-06-01T10:00:00Z" },
    { id: "u4", tenant_id: "vpn_store", telegram_id: "99887766", username: "vpn_tester", first_name: "VTester", points: 10, joined_at: "2026-06-06T08:00:00Z" }
  ],
  bot_settings: [
    // Pre-seeded settings for premium_shop
    { tenant_id: "premium_shop", key: 'welcome_message', value: 'Welcome to Berry Premium store bot! Feel free to explore our original software accounts and premium voucher keys!', description: 'Greeting message sent to new bot users' },
    { tenant_id: "premium_shop", key: 'support_username', value: '@premium_bot_admin', description: 'Username for customer support inquiries' },
    { tenant_id: "premium_shop", key: 'shop_title', value: '💎 ORIGINAL PREMIUM PREMIUM ACCOUNTS', description: 'Message header when showing products' },
    { tenant_id: "premium_shop", key: 'shop_footer', value: 'Tap a digital category or product listing below to get started.', description: 'Message footer when showing products' },
    { tenant_id: "premium_shop", key: 'out_of_stock_msg', value: '❌ Apologies, listing stock currently empty. Click Notify Me.', description: 'Shown when a product/variant is out of stock' },
    { tenant_id: "premium_shop", key: 'product_delivery_note', value: '• Your credential will be processed in real-time or sent to chat.', description: 'Note shown before checking out' },
    { tenant_id: "premium_shop", key: 'payment_title', value: '🏦 REALTIME COIN TRANSFER', description: 'Title of the payment instructions screen' },
    { tenant_id: "premium_shop", key: 'payment_instruction', value: 'Transfer exact amount of USDT/TRX to our verified secure address.', description: 'General payment instructions' },
    { tenant_id: "premium_shop", key: 'payment_button_instruction', value: 'Completed? Tap Verify Order.', description: 'Instructions on the confirmation button' },
    { tenant_id: "premium_shop", key: 'order_summary_title', value: '🧾 DEPOSIT VERIFICATION', description: 'Title shown with order itemization' },
    { tenant_id: "premium_shop", key: 'order_proceed_msg', value: 'Proceed with the transaction details below.', description: 'Subtext directing to checkout' },
    { tenant_id: "premium_shop", key: 'delivery_msg', value: 'Manual item dispatched, reviewing transaction records.', description: 'Message for manual delivery receipt' },
    { tenant_id: "premium_shop", key: 'auto_delivery_msg', value: 'Your premium credentials: {email} {password}', description: 'Template for automatic credential delivery' },
    { tenant_id: "premium_shop", key: 'testimonial_template', value: 'We look forward to serving your digital demands again!', description: 'Template for customer testimonial' },
    { tenant_id: "premium_shop", key: 'payment_qr_file_id', value: 'file_id_qr_premium_102', description: 'Telegram File ID for payment QR code' },
    { tenant_id: "premium_shop", key: 'banner_file_id', value: 'file_id_banner_premium_102', description: 'Telegram File ID for shop welcome banner' }
  ],
  points_history: [],
  rental_payments: [
    { id: "rp1", tenant_id: "premium_shop", amount: 49.00, status: "completed", period_start: "2026-05-01T12:00:00Z", period_end: "2026-06-01T12:00:00Z", paid_at: "2026-04-28T09:00:00Z" },
    { id: "rp2", tenant_id: "premium_shop", amount: 49.00, status: "completed", period_start: "2026-06-01T12:00:00Z", period_end: "2026-07-01T12:00:00Z", paid_at: "2026-05-29T11:30:00Z" }
  ],
  tenant_audit_logs: [
    { id: "a1", tenant_id: "premium_shop", message: "Owner updated welcome message configuration", action: "SETTINGS_UPDATE", created_at: "2026-06-08T15:00:00Z" },
    { id: "a2", tenant_id: "premium_shop", message: "US-Region Spotify account credential added code: c2", action: "CREDENTIAL_UPLOAD_SUCCESS", created_at: "2026-06-08T16:21:00Z" },
    { id: "a3", tenant_id: "premium_shop", message: "Successful dashboard login from administrative session", action: "LOGIN_SUCCESS", created_at: "2026-06-09T03:40:00Z" }
  ]
};

class FileDatabase {
  private data: DBStructure;

  constructor() {
    this.data = JSON.parse(JSON.stringify(initialDB));
    this.load();
  }

  private get isProduction(): boolean {
    return !!(process.env.VERCEL || process.env.NODE_ENV === 'production');
  }

  load() {
    if (this.isProduction) {
      return;
    }
    try {
      if (fs.existsSync(BACKUP_PATH)) {
        const fileContent = fs.readFileSync(BACKUP_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        this.data = {
          tenants: parsed.tenants || initialDB.tenants,
          products: parsed.products || initialDB.products,
          product_variants: parsed.product_variants || initialDB.product_variants,
          orders: parsed.orders || initialDB.orders,
          credentials: parsed.credentials || initialDB.credentials,
          users: parsed.users || initialDB.users,
          bot_settings: parsed.bot_settings || initialDB.bot_settings,
          points_history: parsed.points_history || initialDB.points_history,
          rental_payments: parsed.rental_payments || initialDB.rental_payments,
          tenant_audit_logs: parsed.tenant_audit_logs || initialDB.tenant_audit_logs,
        };
      } else {
        this.save();
      }
    } catch (e) {
      console.error("Failed to load local DB schema, fallback to in-memory: ", e);
    }
  }

  save() {
    if (this.isProduction) {
      return;
    }
    try {
      fs.writeFileSync(BACKUP_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error("Failed to write to file backup database: ", e);
    }
  }

  // Audits logger
  log(tenant_id: string, action: string, message: string) {
    const newLog: TenantAuditLog = {
      id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      tenant_id,
      action,
      message,
      created_at: new Date().toISOString()
    };
    this.data.tenant_audit_logs.unshift(newLog);
    this.save();
  }

  // Tenant Operations
  getTenants(): Tenant[] {
    return this.data.tenants;
  }

  getTenant(id: string): Tenant | undefined {
    return this.data.tenants.find(t => t.tenant_id === id);
  }

  updateTenant(id: string, updates: Partial<Tenant>): Tenant | null {
    const idx = this.data.tenants.findIndex(t => t.tenant_id === id);
    if (idx === -1) return null;
    this.data.tenants[idx] = { ...this.data.tenants[idx], ...updates };
    this.save();
    return this.data.tenants[idx];
  }

  createTenant(newT: Tenant): Tenant {
    this.data.tenants.push(newT);
    
    // Seed default bot settings for this tenant
    for (const d of defaultKeys) {
      this.data.bot_settings.push({
        tenant_id: newT.tenant_id,
        key: d.key,
        value: d.value,
        description: d.description
      });
    }

    this.save();
    return newT;
  }

  // Products Operations
  getProducts(tenantId: string): Product[] {
    return this.data.products.filter(p => p.tenant_id === tenantId);
  }

  getProductById(id: string, tenantId: string): Product | undefined {
    return this.data.products.find(p => p.id === id && p.tenant_id === tenantId);
  }

  createProduct(product: Omit<Product, 'id'>): Product {
    const newP: Product = {
      ...product,
      id: "prod_" + Date.now() + "_" + Math.floor(Math.random() * 100),
    };
    this.data.products.push(newP);
    this.save();
    return newP;
  }

  updateProduct(id: string, tenantId: string, updates: Partial<Product>): Product | null {
    const idx = this.data.products.findIndex(p => p.id === id && p.tenant_id === tenantId);
    if (idx === -1) return null;
    this.data.products[idx] = { ...this.data.products[idx], ...updates };
    this.save();
    return this.data.products[idx];
  }

  deleteProduct(id: string, tenantId: string): boolean {
    const sizeBefore = this.data.products.length;
    this.data.products = this.data.products.filter(p => !(p.id === id && p.tenant_id === tenantId));
    
    // Also delete product's variants and credentials
    this.data.product_variants = this.data.product_variants.filter(v => !(v.product_id === id && v.tenant_id === tenantId));
    this.data.credentials = this.data.credentials.filter(c => !(c.product_id === id && c.tenant_id === tenantId));

    const deleted = sizeBefore !== this.data.products.length;
    if (deleted) this.save();
    return deleted;
  }

  // Variants Operations
  getVariants(tenantId: string): ProductVariant[] {
    return this.data.product_variants.filter(v => v.tenant_id === tenantId);
  }

  createVariant(variant: Omit<ProductVariant, 'id'>): ProductVariant {
    const newV: ProductVariant = {
      ...variant,
      id: "var_" + Date.now() + "_" + Math.floor(Math.random() * 100),
    };
    this.data.product_variants.push(newV);
    
    // Recompute product stock count based on all its variants
    this.recalculateProductStock(variant.product_id, variant.tenant_id);

    this.save();
    return newV;
  }

  updateVariant(id: string, tenantId: string, updates: Partial<ProductVariant>): ProductVariant | null {
    const idx = this.data.product_variants.findIndex(v => v.id === id && v.tenant_id === tenantId);
    if (idx === -1) return null;
    this.data.product_variants[idx] = { ...this.data.product_variants[idx], ...updates };
    
    this.recalculateProductStock(this.data.product_variants[idx].product_id, tenantId);

    this.save();
    return this.data.product_variants[idx];
  }

  private recalculateProductStock(productId: string, tenantId: string) {
    const product = this.data.products.find(p => p.id === productId && p.tenant_id === tenantId);
    if (!product) return;

    if (product.auto_delivery) {
      // Stock is available unused credentials
      const unusedCredCount = this.data.credentials.filter(
        c => c.product_id === productId && c.tenant_id === tenantId && !c.is_used
      ).length;
      product.stock = unusedCredCount;
    } else {
      // Sum variant stocks if they exist
      const vars = this.data.product_variants.filter(v => v.product_id === productId && v.tenant_id === tenantId && v.active);
      if (vars.length > 0) {
        product.stock = vars.reduce((sum, v) => sum + v.stock, 0);
      }
    }
  }

  // Orders Operations
  getOrders(tenantId: string): Order[] {
    return this.data.orders.filter(o => o.tenant_id === tenantId);
  }

  getOrderById(id: string, tenantId: string): Order | undefined {
    return this.data.orders.find(o => o.id === id && o.tenant_id === tenantId);
  }

  updateOrderStatus(id: string, tenantId: string, status: Order['status'], feedback?: string): Order | null {
    const idx = this.data.orders.findIndex(o => o.id === id && o.tenant_id === tenantId);
    if (idx === -1) return null;
    
    const o = this.data.orders[idx];
    const oldStatus = o.status;
    o.status = status;
    if (status === 'completed') {
      o.approved_at = new Date().toISOString();
      
      // Auto Delivery delivery mechanism check if product is auto_delivery
      const prod = this.data.products.find(p => p.id === o.product_id && p.tenant_id === tenantId);
      if (prod && prod.auto_delivery) {
        // Find one unused credential for this product / variant if matched
        const credIdx = this.data.credentials.findIndex(
          c => c.product_id === o.product_id && 
               c.tenant_id === tenantId && 
               c.variant_id === o.variant_id && 
               !c.is_used
        );
        if (credIdx !== -1) {
          const cred = this.data.credentials[credIdx];
          cred.is_used = true;
          (cred as any).used_by_order_id = o.id;
          o.notes = (o.notes || "") + ` | Auto Deliver: ${cred.email}${cred.password ? ':****' : ''}`;
          // Decrease stock for product
          this.recalculateProductStock(o.product_id, tenantId);
        } else {
          o.notes = (o.notes || "") + " | Auto Deliver Warning: Out of available credentials/stock!";
        }
      }
    }
    
    this.save();
    return o;
  }

  // Stock and Credentials Operations
  getStocks(tenantId: string) {
    const products = this.getProducts(tenantId);
    const variants = this.getVariants(tenantId);
    const credentials = this.getCredentials(tenantId);

    return products.map(prod => {
      const prodVariants = variants.filter(v => v.product_id === prod.id);
      const totalCreds = credentials.filter(c => c.product_id === prod.id);
      const availableCreds = totalCreds.filter(c => !c.is_used).length;
      const deliveredCreds = totalCreds.filter(c => c.is_used).length;

      return {
        product: prod,
        variants: prodVariants,
        totalCredentials: totalCreds.length,
        availableCredentials: availableCreds,
        deliveredCount: deliveredCreds
      };
    });
  }

  getCredentials(tenantId: string): Credential[] {
    return this.data.credentials.filter(c => c.tenant_id === tenantId);
  }

  addCredentials(tenantId: string, productId: string, variantId: string | null, text: string): number {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let countAdded = 0;

    for (const line of lines) {
      let email: string;
      let password: string;
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        email = line.substring(0, colonIdx).trim();
        password = line.substring(colonIdx + 1).trim();
      } else {
        email = line;
        password = '';
      }

      const newCred: Credential = {
        id: "cred_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        tenant_id: tenantId,
        product_id: productId,
        variant_id: variantId || null,
        email,
        password,
        is_used: false,
        created_at: new Date().toISOString()
      };
      this.data.credentials.push(newCred);
      countAdded++;
    }

    // Refresh stock metrics
    this.recalculateProductStock(productId, tenantId);
    this.save();
    return countAdded;
  }

  updateCredentialVariant(credId: string, tenantId: string, variantId: string): Credential | null {
    const cred = this.data.credentials.find(c => c.id === credId && c.tenant_id === tenantId);
    if (!cred) return null;
    cred.variant_id = variantId;
    this.save();
    return cred;
  }

  // Users and Points
  getUsers(tenantId: string): User[] {
    return this.data.users.filter(u => u.tenant_id === tenantId);
  }

  // Settings
  getSettings(tenantId: string): BotSetting[] {
    const list = this.data.bot_settings.filter(s => s.tenant_id === tenantId);
    // If empty settings (i.e. new manual user), auto populate copy
    if (list.length === 0) {
      const pre: BotSetting[] = defaultKeys.map(d => ({
        tenant_id: tenantId,
        key: d.key,
        value: d.value,
        description: d.description
      }));
      this.data.bot_settings.push(...pre);
      this.save();
      return pre;
    }
    return list;
  }

  updateSetting(tenantId: string, key: string, value: string): BotSetting {
    let setting = this.data.bot_settings.find(s => s.tenant_id === tenantId && s.key === key);
    if (!setting) {
      const def = defaultKeys.find(d => d.key === key);
      setting = {
        tenant_id: tenantId,
        key,
        value,
        description: def ? def.description : "Custom Setting Description"
      };
      this.data.bot_settings.push(setting);
    } else {
      setting.value = value;
    }
    this.save();
    return setting;
  }

  // Audit Logs
  getAuditLogs(tenantId: string): TenantAuditLog[] {
    return this.data.tenant_audit_logs.filter(a => a.tenant_id === tenantId);
  }

  // Rental payments
  getRentalPayments(tenantId: string): RentalPayment[] {
    return this.data.rental_payments.filter(r => r.tenant_id === tenantId);
  }
}

// Global active instance of storage engine
export const db = new FileDatabase();
