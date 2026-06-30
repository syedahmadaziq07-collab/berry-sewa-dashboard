import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import multer from 'multer';
import WebSocket from 'ws';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

import { db, hashPassword, verifyPassword } from './server-db.js';
import { Tenant } from './types.js';

// Initialize Supabase Storage Client (Server-side only)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      realtime: { transport: WebSocket },
    })
  : null;

if (!supabase && process.env.NODE_ENV === 'production') {
  console.warn('[SUPABASE] WARNING: Running in production without Supabase configured!');
}

// Migration: ensure credentials table has variant_id column (best-effort)
(async () => {
  if (!supabase) return;
  try {
    // Migration: ensure berry_sessions table exists
    const { error: sessionsErr } = await supabase.from('berry_sessions').select('id').limit(0);
    const sessionsTableExists = !(sessionsErr && (sessionsErr.message?.includes('does not exist') || sessionsErr.message?.includes('relation')));
    if (!sessionsTableExists) {
      console.log('[MIGRATION] berry_sessions table missing — attempting auto-create...');
      const sql = 'create table if not exists public.berry_sessions (id text primary key, data jsonb not null, created_at timestamptz default now());';
      const ok = await supabase.rpc('exec_sql', { sql }).catch(() => null)
        || await supabase.rpc('exec', { query_text: sql }).catch(() => null);
      if (ok) {
        console.log('[MIGRATION] berry_sessions table created');
      } else {
        console.warn('[MIGRATION] Cannot auto-create berry_sessions table — sessions will NOT persist across cold starts. Create manually: CREATE TABLE IF NOT EXISTS public.berry_sessions (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());');
      }
    }

    const { error: variantErr } = await supabase.from('credentials').select('variant_id').limit(0);
    const variantExists = !(variantErr && variantErr.message?.includes('does not exist'));
    if (!variantExists) {
      console.log('[MIGRATION] credentials.variant_id missing — attempting auto-add...');
      const sql2 = 'alter table public.credentials add column if not exists variant_id bigint;';
      const ok2 = await supabase.rpc('exec_sql', { sql: sql2 }).catch(() => null)
        || await supabase.rpc('exec', { query_text: sql2 }).catch(() => null);
      if (ok2) {
        console.log('[MIGRATION] credentials.variant_id added');
      } else {
        console.log('[MIGRATION] Cannot auto-add credentials.variant_id — run manually if needed: ALTER TABLE public.credentials ADD COLUMN IF NOT EXISTS variant_id bigint;');
      }
    }

    // Migration: ensure products.delivery_note column exists
    const { error: prodNoteErr } = await supabase.from('products').select('delivery_note').limit(0);
    const prodNoteExists = !(prodNoteErr && prodNoteErr.message?.includes('does not exist'));
    if (!prodNoteExists) {
      console.log('[MIGRATION] products.delivery_note missing — attempting auto-add...');
      const sql = 'alter table public.products add column if not exists delivery_note text;';
      const ok = await supabase.rpc('exec_sql', { sql }).catch(() => null)
        || await supabase.rpc('exec', { query_text: sql }).catch(() => null);
      if (ok) {
        console.log('[MIGRATION] products.delivery_note added');
      } else {
        console.log('[MIGRATION] Cannot auto-add products.delivery_note — run manually: ALTER TABLE public.products ADD COLUMN IF NOT EXISTS delivery_note text;');
      }
    }

    // Migration: ensure product_variants.delivery_note column exists
    const { error: varNoteErr } = await supabase.from('product_variants').select('delivery_note').limit(0);
    const varNoteExists = !(varNoteErr && varNoteErr.message?.includes('does not exist'));
    if (!varNoteExists) {
      console.log('[MIGRATION] product_variants.delivery_note missing — attempting auto-add...');
      const sql2 = 'alter table public.product_variants add column if not exists delivery_note text;';
      const ok2 = await supabase.rpc('exec_sql', { sql: sql2 }).catch(() => null)
        || await supabase.rpc('exec', { query_text: sql2 }).catch(() => null);
      if (ok2) {
        console.log('[MIGRATION] product_variants.delivery_note added');
      } else {
        console.log('[MIGRATION] Cannot auto-add product_variants.delivery_note — run manually: ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS delivery_note text;');
      }
    }

    // Check other columns
    const colCheck = async (col: string) => {
      const { error } = await supabase.from('credentials').select(col).limit(0);
      return !(error && error.message?.includes('does not exist'));
    };
    const emailExists = await colCheck('email');
    const passwordExists = await colCheck('password');
    const valExists = await colCheck('value');
    const usedByExists = await colCheck('used_by_order_id');

    console.log(`[CREDENTIALS_SCHEMA] email=${emailExists} password=${passwordExists} variant_id=${variantExists} value=${valExists} used_by_order_id=${usedByExists}`);
  } catch {
    // ignore
  }
})();

// Supabase query helper for tenant-scoped read operations
async function supabaseGet(tenantId: string, table: string, select?: string): Promise<any[] | null> {
  if (!supabase) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[SUPABASE] ${table} query skipped — no Supabase configured in production`);
    }
    return null;
  }
  const { data, error } = await supabase
    .from(table)
    .select(select || '*')
    .eq('tenant_id', tenantId);
  if (error) {
    console.error(`[SUPABASE] ${table} query error:`, error.message);
    return null;
  }
  return data || [];
}

// Initialize Multer for safe memory storage file uploading
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB LIMIT
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and WEBP images are allowed'));
    }
  }
});

// Session manager — Supabase in production, in-memory Map + JSON fallback for local dev
const sessions = new Map<string, { role: 'tenant' | 'master'; tenant_id?: string; username?: string }>();
const SESSION_FILE = path.join(process.cwd(), '.berry_sessions.json');

function loadSessionsLocal() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      for (const [k, v] of Object.entries(raw)) {
        sessions.set(k, v as any);
      }
      console.log(`[SESSION] Loaded ${sessions.size} sessions from disk`);
    }
  } catch (e) {
    console.warn('[SESSION] Failed to load sessions from disk');
  }
}

function saveSessionsLocal() {
  try {
    const obj: Record<string, any> = {};
    for (const [k, v] of sessions.entries()) obj[k] = v;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[SESSION] Failed to save sessions to disk');
  }
}

let _sessionsTableMissing = false;

async function getSessionById(sessionId: string): Promise<{ role: 'tenant' | 'master'; tenant_id?: string; username?: string } | null> {
  if (supabase && !_sessionsTableMissing) {
    const { data, error } = await supabase.from('berry_sessions').select('data').eq('id', sessionId).maybeSingle();
    if (error) {
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        _sessionsTableMissing = true;
        console.warn('[SESSION] berry_sessions table missing — sessions will NOT persist across cold starts. Create table manually in Supabase SQL Editor: CREATE TABLE IF NOT EXISTS public.berry_sessions (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());');
      } else {
        console.warn('[SESSION] Supabase lookup error:', error.message);
      }
      return sessions.get(sessionId) || null;
    }
    return data?.data || null;
  }
  return sessions.get(sessionId) || null;
}

async function setSession(sessionId: string, data: { role: 'tenant' | 'master'; tenant_id?: string; username?: string }) {
  sessions.set(sessionId, data);
  saveSessionsLocal();
  if (supabase && !_sessionsTableMissing) {
    const { error } = await supabase.from('berry_sessions').upsert({ id: sessionId, data }, { onConflict: 'id' });
    if (error) {
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        _sessionsTableMissing = true;
        console.warn('[SESSION] berry_sessions table missing — session saved locally only (will not persist across cold starts).');
      } else {
        console.warn('[SESSION] Supabase upsert error:', error.message);
      }
    }
  }
}

async function deleteSession(sessionId: string) {
  sessions.delete(sessionId);
  saveSessionsLocal();
  if (supabase && !_sessionsTableMissing) {
    const { error } = await supabase.from('berry_sessions').delete().eq('id', sessionId);
    if (error) {
      if (!error.message?.includes('does not exist') && !error.message?.includes('relation')) {
        console.warn('[SESSION] Supabase delete error:', error.message);
      }
    }
  }
}

loadSessionsLocal();

// Secret key configurations
const MASTER_ADMIN_SECRET = process.env.MASTER_ADMIN_SECRET || 'berry_master_secret_2026';

const app = express();

app.use(cors({
  origin: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());
app.use(cookieParser());

// Request logger for debugging (Vercel logs)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

// GET /api/health
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ ok: true, service: "berry-rental-dashboard" });
});

// Helpers for calculating days remaining
function getDaysRemaining(rentEndStr: string): number {
  const diffTime = new Date(rentEndStr).getTime() - new Date().getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Session Auth Middlewares
async function getSession(req: Request) {
  const sessionId = req.cookies.berry_session_id;
  if (!sessionId) return null;
  return getSessionById(sessionId);
}

async function requireTenantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getSession(req);
    if (!session || session.role !== 'tenant' || !session.tenant_id) {
      res.status(401).json({ error: 'Unauthenticated tenant access' });
      return;
    }
    
    // Double-check if tenant was suspended, disabled or expired in real-time
    const tenant = db.getTenant(session.tenant_id);
    if (!tenant) {
      res.status(401).json({ error: 'Tenant no longer exists' });
      return;
    }
    if (!tenant.dashboard_enabled) {
      res.status(403).json({ error: 'Dashboard access is disabled' });
      return;
    }
    if (tenant.status === 'suspended') {
      res.status(403).json({ error: 'Tenant suspended' });
      return;
    }
    
    // Attach tenant context
    (req as any).tenant_id = session.tenant_id;
    next();
  } catch (err: any) {
    console.error('[AUTH_MIDDLEWARE_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function requireMasterAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getSession(req);
    if (!session || session.role !== 'master') {
      res.status(401).json({ error: 'Unauthenticated master access' });
      return;
    }
    next();
  } catch (err: any) {
    console.error('[AUTH_MIDDLEWARE_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// -------------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------------

// GET /api/auth/me
app.get('/api/auth/me', async (req: Request, res: Response) => {
  try {
    const session = await getSession(req);
    if (!session) {
      res.status(401).json({ isAuthenticated: false });
      return;
    }

    if (session.role === 'tenant' && session.tenant_id) {
      const tenant = db.getTenant(session.tenant_id);
      if (!tenant || tenant.status === 'suspended' || !tenant.dashboard_enabled) {
        res.status(401).json({ isAuthenticated: false, error: 'Session restricted or terminated' });
        return;
      }
      res.json({
        isAuthenticated: true,
        role: 'tenant',
        tenant_id: tenant.tenant_id,
        name: tenant.name,
        bot_username: tenant.bot_username,
        status: tenant.status,
        password_reset_required: tenant.dashboard_password_reset_required
      });
    } else if (session.role === 'master') {
      res.json({
        isAuthenticated: true,
        role: 'master',
        username: 'Master Owner'
      });
    } else {
      res.status(401).json({ isAuthenticated: false });
    }
  } catch (err: any) {
    console.error('[AUTH_ME_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error', isAuthenticated: false });
  }
});

// POST /api/auth/tenant-login
app.post('/api/auth/tenant-login', async (req: Request, res: Response) => {
  try {
    const { tenant_id, password } = req.body;

    if (!tenant_id || !password) {
      res.status(400).json({ error: 'Tenant ID and Password are required.' });
      return;
    }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Step 1: Try Supabase first (real UUID tenant lookup)
  let tenantData: Record<string, any> | null = null;

  if (supabase && uuidRegex.test(tenant_id)) {
    const { data, error } = await supabase
      .from('tenants')
      .select('id,name,bot_username,owner_telegram_id,owner_username,status,rent_start,rent_end')
      .eq('id', tenant_id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('[TENANT] Supabase lookup error:', error);
    }
    if (data) {
      tenantData = data;
    }
  }

  // Step 2: If Supabase didn't find it, check local DB (backward compat for seed data)
  if (!tenantData) {
    const localTenant = db.getTenant(tenant_id);
    if (localTenant) {
      tenantData = {
        id: localTenant.tenant_id,
        name: localTenant.name,
        bot_username: localTenant.bot_username,
        owner_telegram_id: localTenant.owner_telegram_id,
        owner_username: localTenant.owner_username,
        status: localTenant.status,
        rent_start: localTenant.rent_start,
        rent_end: localTenant.rent_end,
      };
    }
  }

  if (!tenantData) {
    res.status(401).json({ error: 'Tenant not found.' });
    return;
  }

  const resolvedId = tenantData.id;
  const resolvedName = tenantData.name;

  // Ensure tenant exists in local DB (create if Supabase-only)
  let tenant = db.getTenant(resolvedId);
  if (!tenant) {
    const now = new Date().toISOString();
    tenant = db.createTenant({
      tenant_id: resolvedId,
      name: tenantData.name || '',
      bot_username: tenantData.bot_username || '',
      owner_telegram_id: String(tenantData.owner_telegram_id || ''),
      owner_username: tenantData.owner_username || '',
      monthly_price: 0,
      status: tenantData.status || 'active',
      rent_start: tenantData.rent_start || now,
      rent_end: tenantData.rent_end || now,
      dashboard_enabled: true,
      dashboard_secret_hash: null,
      dashboard_password_set_at: null,
      dashboard_first_login_at: null,
      dashboard_last_login_at: null,
      dashboard_password_reset_required: false,
      service_url: '',
      notes: '',
      created_at: now,
    });
  }

  if (!tenant.dashboard_enabled) {
    res.status(403).json({ error: 'Dashboard access has been disabled for this store.' });
    return;
  }

  if (tenant.status === 'suspended') {
    res.status(403).json({ error: 'Tenant bot rental suspended.' });
    return;
  }

  // Check Expiration
  const daysLeft = getDaysRemaining(tenant.rent_end);
  if (tenant.status === 'expired' || daysLeft <= 0) {
    // Automatically set status to expired if days elapsed
    if (tenant.status !== 'expired') {
      db.updateTenant(resolvedId, { status: 'expired' });
    }
    res.status(403).json({ error: 'Bot rental has expired. Please contact administration to renew.' });
    return;
  }

  // Check first time login (hash is null)
  if (tenant.dashboard_secret_hash === null) {
    const hash = hashPassword(password);
    const now = new Date().toISOString();
    db.updateTenant(resolvedId, {
      dashboard_secret_hash: hash,
      dashboard_password_set_at: now,
      dashboard_first_login_at: tenant.dashboard_first_login_at || now,
      dashboard_last_login_at: now,
      dashboard_password_reset_required: false
    });
    
    db.log(resolvedId, "FIRST_TIME_PASSWORD_SETUP", "Customer completed first-time login and created dashboard credentials");

    // Success login
    const sessionId = 'sess_' + crypto.randomUUID();
    await setSession(sessionId, { role: 'tenant', tenant_id: resolvedId });
    res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
    res.json({ status: 'success', role: 'tenant', tenant_id: resolvedId, name: tenant.name, message: 'Password set and logged in matches successfully.' });
    return;
  }

  // Dashboard password reset required
  if (tenant.dashboard_password_reset_required) {
    const hash = hashPassword(password);
    const now = new Date().toISOString();
    db.updateTenant(resolvedId, {
      dashboard_secret_hash: hash,
      dashboard_password_set_at: now,
      dashboard_last_login_at: now,
      dashboard_password_reset_required: false
    });
    db.log(resolvedId, "PASSWORD_RESET_COMPLETED", "Owner set new dashboard password following reset instruction");

    const sessionId = 'sess_' + crypto.randomUUID();
    await setSession(sessionId, { role: 'tenant', tenant_id: resolvedId });
    res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
    res.json({ status: 'success', role: 'tenant', tenant_id: resolvedId, name: tenant.name });
    return;
  }

  // Traditional password verify
  if (!verifyPassword(password, tenant.dashboard_secret_hash)) {
    res.status(401).json({ error: 'Invalid password. If this is a reset, enter your new secret.' });
    return;
  }

  // Update last login
  const now = new Date().toISOString();
  db.updateTenant(resolvedId, { dashboard_last_login_at: now });
  db.log(resolvedId, "LOGIN_SUCCESS", "Dashboard user logged in successfully");

  const sessionId = 'sess_' + crypto.randomUUID();
  await setSession(sessionId, { role: 'tenant', tenant_id: resolvedId });
  res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
  res.json({ status: 'success', role: 'tenant', tenant_id: resolvedId, name: tenant.name });
  } catch (err: any) {
    console.error('[LOGIN_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/master-login
app.post('/api/auth/master-login', async (req: Request, res: Response) => {
  try {
    const { master_secret } = req.body;

    if (!master_secret) {
      res.status(400).json({ error: 'Master secret key is required.' });
      return;
    }

    if (master_secret !== MASTER_ADMIN_SECRET) {
      res.status(401).json({ error: 'Incorrect master secret admin credentials.' });
      return;
    }

    const sessionId = 'master_' + crypto.randomUUID();
    await setSession(sessionId, { role: 'master' });
    res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
    res.json({ status: 'success', role: 'master', username: 'Master Owner' });
  } catch (err: any) {
    console.error('[MASTER_LOGIN_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies.berry_session_id;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.clearCookie('berry_session_id', { path: '/' });
    res.json({ status: 'success', message: 'Logged out successfully' });
  } catch (err: any) {
    console.error('[LOGOUT_ERROR]', err?.message, err?.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------------------------------------------------------
// TENANT ADMIN API (All require requireTenantAuth and strictly scope to req.tenant_id)
// -------------------------------------------------------------------

// GET /api/tenant/overview
app.get('/api/tenant/overview', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const tenant = db.getTenant(tenantId);

  let products: any[] = [];
  let orders: any[] = [];
  let users: any[] = [];
  let settings: any[] = [];

  if (supabase) {
    const [p, o, u, s] = await Promise.all([
      supabaseGet(tenantId, 'products'),
      supabaseGet(tenantId, 'orders'),
      supabaseGet(tenantId, 'users'),
      supabaseGet(tenantId, 'bot_settings'),
    ]);
    if (p) products = p.map(mapProductRow);
    if (o) orders = o;
    if (u) users = u;
    if (s) settings = s;
  }

  // Fallback to local DB if Supabase returned nothing or is not configured
  if (products.length === 0 && orders.length === 0) {
    products = db.getProducts(tenantId);
    orders = db.getOrders(tenantId);
    users = db.getUsers(tenantId);
    settings = db.getSettings(tenantId);
  }

  const logs = db.getAuditLogs(tenantId).slice(0, 5);

  // Stats calculate
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);

  const todayOrders = orders.filter((o: any) => new Date(o.created_at) >= todayStart);
  const todayRevenue = todayOrders
    .filter((o: any) => o.status === 'completed')
    .reduce((sum: number, o: any) => sum + (o.amount || 0), 0);

  const pendingCount = orders.filter((o: any) => o.status === 'pending').length;
  const waitingApprovalCount = orders.filter((o: any) => o.status === 'waiting_approval').length;
  const totalCompletedCount = orders.filter((o: any) => o.status === 'completed').length;

  const totalRevenue = orders
    .filter((o: any) => o.status === 'completed')
    .reduce((sum: number, o: any) => sum + (o.amount || 0), 0);

  // Group by last 7 days revenue for Recharts
  const daysMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    daysMap[dateStr] = 0;
  }

  for (const o of orders) {
    if (o.status === 'completed') {
      const dateStr = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (dateStr in daysMap) {
        daysMap[dateStr] += (o.amount || 0);
      }
    }
  }

  const chartData = Object.keys(daysMap).map(key => ({
    date: key,
    revenue: parseFloat(daysMap[key].toFixed(2))
  }));

  // Top products
  const productSalesCount: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === 'completed') {
      productSalesCount[o.product_id] = (productSalesCount[o.product_id] || 0) + 1;
    }
  }

  const topProducts = Object.keys(productSalesCount).map(pId => {
    const p = products.find((prod: any) => prod.id === pId);
    return {
      id: pId,
      name: p ? p.name : "Unknown Product",
      salesCount: productSalesCount[pId],
      revenue: productSalesCount[pId] * (p ? (p.price || 0) : 0)
    };
  }).sort((a,b) => b.salesCount - a.salesCount).slice(0, 3);

  // Warning metrics
  const warnings: string[] = [];
  const lowStockProducts = products.filter((p: any) => (p.stock === 0 || p.stock === '0') && p.active !== false);
  if (lowStockProducts.length > 0) {
    warnings.push(`${lowStockProducts.length} active products are currently out of stock`);
  }

  // Settings payment QR and banner check
  const qrSetting = settings.find((s: any) => s.key === 'payment_qr_file_id')?.value;
  const qrUrlSetting = settings.find((s: any) => s.key === 'payment_qr_url')?.value;
  const bannerSetting = settings.find((s: any) => s.key === 'banner_file_id')?.value;
  const bannerUrlSetting = settings.find((s: any) => s.key === 'banner_url')?.value;

  if (!qrSetting && !qrUrlSetting) {
    warnings.push("Payment QR code is missing in Bot Settings. Unconfirmed payments will block users.");
  }
  if (!bannerSetting && !bannerUrlSetting) {
    warnings.push("Shop Welcome Banner is missing in Bot Settings.");
  }

  res.json({
    tenant: {
      tenant_id: tenant?.tenant_id,
      name: tenant?.name,
      bot_username: tenant?.bot_username,
      status: tenant?.status,
      rent_end: tenant?.rent_end,
      days_left: tenant ? getDaysRemaining(tenant.rent_end) : 0
    },
    todayRevenue,
    pendingOrdersCount: pendingCount,
    waitingApprovalCount,
    totalCompletedCount,
    totalUsersCount: users.length,
    totalRevenue,
    chartData,
    topProducts,
    warnings,
    recentLogs: logs
  });
});

// Helper: map Supabase product row to frontend format
function mapProductRow(row: any): any {
  if (!row) return row;
  const r: any = { ...row };
  if ('is_active' in r) {
    r.active = r.is_active;
    delete r.is_active;
  }
  return r;
}

// Helper: map Supabase variant row to frontend format (variant_name -> name)
function mapVariantRow(row: any): any {
  if (!row) return row;
  const r: any = { ...row };
  if ('variant_name' in r) {
    r.name = r.variant_name;
  }
  // product_variants has no active/is_active column
  delete r.active;
  delete r.is_active;
  return r;
}

// Helper: build product payload for Supabase, mapping frontend fields
function productToSupabase(body: any): any {
  const p: any = { ...body };
  // Stripping id/created_at — let Supabase handle these
  delete p.id;
  delete p.created_at;
  // Map camelCase fields from frontend to snake_case
  if ('basePrice' in p) {
    p.price = Number(p.basePrice);
    delete p.basePrice;
  }
  if ('base_price' in p) {
    p.price = Number(p.base_price);
    delete p.base_price;
  }
  if ('accountType' in p) {
    p.account_type = p.accountType;
    delete p.accountType;
  }
  if ('autoDelivery' in p && !('auto_delivery' in p)) {
    p.auto_delivery = !!p.autoDelivery;
    delete p.autoDelivery;
  }
  if ('variantName' in p) {
    p.variant_name = p.variantName;
    delete p.variantName;
  }
  // Map active -> is_active + status
  if ('active' in p) {
    p.is_active = !!p.active;
    p.status = p.is_active ? 'active' : 'inactive';
    delete p.active;
  }
  return p;
}

// Helper: build variant payload for Supabase, mapping frontend fields
function variantToSupabase(body: any): any {
  const p: any = { ...body };
  // Stripping id/created_at — let Supabase handle these
  delete p.id;
  delete p.created_at;
  if ('name' in p) {
    p.variant_name = p.name;
    delete p.name;
  }
  // product_variants has no active/is_active columns
  delete p.active;
  delete p.is_active;
  return p;
}

// GET /api/tenant/bot-health
app.get('/api/tenant/bot-health', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Tenant record
    const tenant = db.getTenant(tenantId);
    const tenantInfo = {
      tenant_id: tenantId,
      exists: !!tenant,
      status: tenant?.status || 'unknown',
      rent_end: tenant?.rent_end || null,
      active: tenant?.status === 'active',
    };
    if (!tenant) errors.push('Tenant record not found');
    else if (tenant.status !== 'active') errors.push(`Tenant status is "${tenant.status}"`);

    // Fetch all Supabase data in parallel
    let supabaseSettings: any[] | null = null;
    let supabaseProducts: any[] | null = null;
    let supabaseVariants: any[] | null = null;
    let supabaseCredentials: any[] | null = null;
    let nullTenantProducts = 0;
    let tenantIdMismatchVariants = 0;

    if (supabase) {
      const results = await Promise.all([
        supabaseGet(tenantId, 'bot_settings'),
        supabaseGet(tenantId, 'products'),
        supabaseGet(tenantId, 'product_variants'),
        supabaseGet(tenantId, 'credentials'),
        supabase.from('products').select('id', { count: 'exact', head: true }).is('tenant_id', null),
        supabase.from('product_variants').select('id', { count: 'exact', head: true }).neq('tenant_id', tenantId),
      ]);
      supabaseSettings = results[0];
      supabaseProducts = results[1];
      supabaseVariants = results[2];
      supabaseCredentials = results[3];
      nullTenantProducts = (results[4] as any)?.count || 0;
      tenantIdMismatchVariants = (results[5] as any)?.count || 0;
    }

    // 2. Bot Settings
    const botSettings: any[] = supabaseSettings || db.getSettings(tenantId);
    const qrUrl = botSettings.find((s: any) => s.key === 'payment_qr_url')?.value || '';
    const qrFileId = botSettings.find((s: any) => s.key === 'payment_qr_file_id')?.value || '';
    const bannerUrl = botSettings.find((s: any) => s.key === 'banner_url')?.value || '';
    const bannerFileId = botSettings.find((s: any) => s.key === 'banner_file_id')?.value || '';

    if (botSettings.length === 0) warnings.push('No bot_settings found — store not configured');
    if (!qrUrl && !qrFileId) warnings.push('Payment QR not configured');
    if (!bannerUrl && !bannerFileId) warnings.push('Shop banner not configured');

    // 3. Products
    const products: any[] = supabaseProducts ? supabaseProducts.map(mapProductRow) : db.getProducts(tenantId);
    const activeProducts = products.filter((p: any) => p.active !== false);
    const latestProducts = products.slice(-5).reverse();

    if (nullTenantProducts > 0) errors.push(`${nullTenantProducts} products with null tenant_id`);
    if (products.length === 0) errors.push('No products found');
    else if (activeProducts.length === 0) errors.push('No active products');

    // 4. Product Variants
    const variants: any[] = supabaseVariants ? supabaseVariants.map(mapVariantRow) : db.getVariants(tenantId);
    const variantsWithStock = variants.filter((v: any) => (v.stock || 0) > 0);
    const zeroStockVariants = variants.filter((v: any) => !v.stock || v.stock === 0);

    let orphanCount = 0;
    const productIds = new Set(products.map((p: any) => p.id));
    if (supabaseVariants) {
      orphanCount = supabaseVariants.filter((v: any) => !productIds.has(v.product_id)).length;
    } else {
      orphanCount = variants.filter((v: any) => !productIds.has(v.product_id)).length;
    }

    if (tenantIdMismatchVariants > 0) errors.push(`${tenantIdMismatchVariants} variants with mismatched tenant_id`);
    if (variants.length === 0) errors.push('No variants found');
    else if (variantsWithStock.length === 0) errors.push('No variants with stock > 0');
    if (orphanCount > 0) errors.push(`${orphanCount} orphan variants (no matching product)`);

    // 5. Credentials
    const creds: any[] = supabaseCredentials || db.getCredentials(tenantId);
    const availableCreds = creds.filter((c: any) => !c.is_used).length;

    // 6. Compatibility status
    let compatibility: 'OK' | 'NEED_SETUP' | 'ERROR' = 'OK';
    if (errors.length > 0) {
      compatibility = 'ERROR';
    } else if (warnings.length > 0 || !qrUrl || !bannerUrl || products.length === 0 || activeProducts.length === 0 || variantsWithStock.length === 0) {
      compatibility = 'NEED_SETUP';
    }

    console.log(`[BOT_HEALTH] tenant_id=${tenantId} status=${compatibility} warnings=${warnings.length} errors=${errors.length}`);
    if (warnings.length > 0) console.log(`[BOT_HEALTH] warnings:`, warnings.join('; '));
    if (errors.length > 0) console.log(`[BOT_HEALTH] errors:`, errors.join('; '));

    res.json({
      tenant: tenantInfo,
      bot_settings: {
        total_count: botSettings.length,
        payment_qr_url_configured: !!qrUrl,
        banner_url_configured: !!bannerUrl,
        payment_qr_file_id: qrFileId,
        banner_file_id: bannerFileId,
      },
      products: {
        total_count: products.length,
        active_count: activeProducts.length,
        latest: latestProducts.map((p: any) => ({ id: p.id, name: p.name, price: p.price, active: p.active })),
        null_tenant_id_count: nullTenantProducts,
      },
      product_variants: {
        total_count: variants.length,
        with_stock_count: variantsWithStock.length,
        tenant_id_mismatch_count: tenantIdMismatchVariants,
        orphan_count: orphanCount,
        zero_stock_count: zeroStockVariants.length,
      },
      credentials: {
        total_count: creds.length,
        available_count: availableCreds,
      },
      compatibility,
      warnings,
      errors,
    });
  } catch (err: any) {
    console.error(`[BOT_HEALTH] error for tenant_id=${tenantId}:`, err.message || err);
    res.status(500).json({
      compatibility: 'ERROR',
      errors: [err.message || 'Internal error during health check'],
      warnings: [],
    });
  }
});

// GET /api/tenant/products
app.get('/api/tenant/products', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  if (!supabase) {
    res.json(db.getProducts(tenantId));
    return;
  }
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('[SUPABASE] products query error:', error.message);
    res.status(500).json({ error: `Supabase query failed: ${error.message}` });
    return;
  }
  // Also fetch variants for this tenant to attach to products
  const { data: variants } = await supabase
    .from('product_variants')
    .select('*')
    .eq('tenant_id', tenantId);

  const mapped = (products || []).map(mapProductRow);
  const mappedVars = (variants || []).map(mapVariantRow);

  const activeCount = mapped.filter((p: any) => p.active !== false).length;
  const inactiveCount = mapped.filter((p: any) => p.active === false).length;
  console.log(`[PRODUCT_LIST] tenant=${tenantId} total=${mapped.length} active=${activeCount} inactive=${inactiveCount}`);

  // Attach linked variants to each product
  const result = mapped.map((p: any) => ({
    ...p,
    variants: mappedVars.filter((v: any) => v.product_id === p.id),
  }));

  res.json(result);
});

// POST /api/tenant/products
app.post('/api/tenant/products', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const body = req.body;

  // Safety: strip fields Supabase should auto-generate
  delete body.id;
  delete body.created_at;

  const { name, price, duration, description } = body;

  if (!name || price === undefined) {
    res.status(400).json({ error: 'Name and price are required fields' });
    return;
  }

  // Build product payload matching exact products schema
  const activeFlag = body.active !== undefined ? !!body.active : true;
  const productPrice = Number(body.price || body.basePrice || body.base_price || 0);
  const productPayload = {
    tenant_id: tenantId,
    name,
    description: description || body.description || '',
    delivery_note: body.delivery_note || '',
    price: productPrice,
    stock: Number(body.stock || 0),
    duration: duration || '',
    is_active: activeFlag,
    account_type: body.account_type || body.accountType || '',
    auto_delivery: body.auto_delivery !== undefined ? !!body.auto_delivery : body.autoDelivery !== undefined ? !!body.autoDelivery : true,
    variants: [],
    status: activeFlag ? 'active' : 'inactive',
  };

  console.log('[PRODUCT_CREATE] === PRODUCT CREATE START ===');
  console.log('[PRODUCT_CREATE] session tenant_id:', tenantId);
  console.log('[PRODUCT_CREATE] request body:', JSON.stringify(body));
  console.log('[PRODUCT_CREATE] final product payload:', JSON.stringify(productPayload));

  // Dev mode fallback
  if (!supabase) {
    const product = db.createProduct({ ...productPayload, active: productPayload.is_active });
    console.log('[PRODUCT_CREATE] Dev mode — saved product to local DB, id:', product.id);
    // Dev mode: also create default variant
    const defaultVariant = db.createVariant({
      tenant_id: tenantId,
      product_id: product.id,
      name: duration || name,
      price: productPrice,
      stock: Number(body.stock || 0),
      active: true,
    });
    console.log('[PRODUCT_CREATE] Dev mode — saved default variant, id:', defaultVariant.id);
    db.log(tenantId, 'PRODUCT_CREATE', `Created product: "${name}" [ID: ${product.id}] with variant`);
    res.status(201).json({ ...product, variants: [defaultVariant] });
    return;
  }

  // --- Production: Insert product into Supabase ---
  // Final safety: verify no id field leaked into payload
  if ('id' in productPayload) {
    console.error('[PRODUCT_CREATE] CRITICAL: id found in productPayload! Deleting...');
    delete (productPayload as any).id;
  }
  console.log('[PRODUCT_CREATE] Final insert payload (no id):', JSON.stringify(productPayload));

  const { data: createdProduct, error: productError } = await supabase
    .from('products')
    .insert(productPayload)
    .select()
    .single();

  if (productError) {
    console.error('[PRODUCT_CREATE] Supabase product insert error:', JSON.stringify(productError));
    res.status(500).json({
      error: `Supabase product insert failed: ${productError.message}`,
      details: productError,
    });
    return;
  }

  console.log('[PRODUCT_CREATE] Supabase product insert success, id:', createdProduct.id);
  console.log('[PRODUCT_CREATE] Supabase product returned data:', JSON.stringify(createdProduct));

  // --- Auto-create a default variant row for the Telegram bot ---
  const productIdNum = Number(createdProduct.id);
  const variantPayload = {
    tenant_id: tenantId,
    product_id: productIdNum,
    variant_name: duration || body.variant_name || body.variantName || name,
    stock: Number(body.stock || 0),
    price: productPrice,
    description: description || '',
  };

  console.log('[PRODUCT_CREATE] Creating default variant payload:', JSON.stringify(variantPayload));
  if ('id' in variantPayload) {
    console.error('[PRODUCT_CREATE] CRITICAL: id found in variantPayload! Deleting...');
    delete (variantPayload as any).id;
  }

  const { data: createdVariant, error: variantError } = await supabase
    .from('product_variants')
    .insert(variantPayload)
    .select()
    .single();

  if (variantError) {
    console.error('[PRODUCT_CREATE] Supabase variant insert error:', JSON.stringify(variantError));
    // Log variant error but don't fail the request — product was already created
    console.log('[PRODUCT_CREATE] Product created but variant insert failed — manual variant creation needed');
  } else {
    console.log('[PRODUCT_CREATE] Supabase variant insert success, id:', createdVariant.id);
    console.log('[PRODUCT_CREATE] Supabase variant returned data:', JSON.stringify(createdVariant));
  }

  console.log('[PRODUCT_CREATE] === PRODUCT CREATE END ===');

  db.log(tenantId, 'PRODUCT_CREATE', `Created product: "${name}" [ID: ${createdProduct.id}]`);

  const mappedProduct = mapProductRow(createdProduct);
  if (createdVariant) {
    mappedProduct.variants = [mapVariantRow(createdVariant)];
  }
  res.status(201).json(mappedProduct);
});

// PATCH /api/tenant/products/:id
app.patch('/api/tenant/products/:id', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = Number(req.params.id);

  if (!supabase) {
    const product = db.getProductById(String(productId), tenantId);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const updated = db.updateProduct(String(productId), tenantId, req.body);
    db.log(tenantId, 'PRODUCT_UPDATE', `Updated product parameters: "${updated?.name}"`);
    res.json(updated);
    return;
  }

  const payload = productToSupabase(req.body);
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('[PRODUCT_UPDATE] Supabase error:', error.message);
    res.status(500).json({ error: `Supabase update failed: ${error.message}` });
    return;
  }

  if (!data) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  // Sync stock to linked product_variants if stock changed
  if (payload.stock !== undefined) {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, stock')
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);

    if (variants && variants.length > 0) {
      for (const v of variants) {
        await supabase
          .from('product_variants')
          .update({ stock: Number(payload.stock) })
          .eq('id', v.id);
      }
      console.log(`[PRODUCT_UPDATE] Synced stock=${payload.stock} to ${variants.length} variant(s) for product ${productId}`);
    }
  }

  db.log(tenantId, 'PRODUCT_UPDATE', `Updated product: "${data.name}"`);
  res.json(mapProductRow(data));
});

// DELETE /api/tenant/products/:id
app.delete('/api/tenant/products/:id', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = Number(req.params.id);

  try {
    if (!supabase) {
      const product = db.getProductById(String(productId), tenantId);
      if (!product) {
        res.status(404).json({ ok: false, error: 'Product not found' });
        return;
      }
      const orderCount = db.getOrders(tenantId).filter((o: any) => o.product_id === String(productId)).length;

      if (orderCount > 0) {
        db.updateProduct(String(productId), tenantId, { active: false, status: 'deleted' });
        db.log(tenantId, 'PRODUCT_DELETE', `Soft deleted product: "${product.name}" (has ${orderCount} orders)`);
        console.log(`[PRODUCT_DELETE] tenant_id=${tenantId} product_id=${productId} orders_count=${orderCount} action=soft_deleted`);
        res.json({ ok: true, mode: 'soft_deleted', message: 'Product has existing orders, so it was deleted from the dashboard and hidden from the bot, while order history was kept safe.' });
        return;
      }

      db.deleteProduct(String(productId), tenantId);
      db.log(tenantId, 'PRODUCT_DELETE', `Hard deleted product: "${product.name}"`);
      console.log(`[PRODUCT_DELETE] tenant_id=${tenantId} product_id=${productId} orders_count=0 action=hard_deleted`);
      res.json({ ok: true, mode: 'deleted' });
      return;
    }

    // Supabase path

    // 1. Check orders count for this product
    const { count: orderCount, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);

    if (countError) {
      console.error('[PRODUCT_DELETE] Supabase orders count error:', countError.message);
      res.status(500).json({ ok: false, error: `Failed to check orders: ${countError.message}`, details: countError });
      return;
    }

    if (orderCount && orderCount > 0) {
      // 2a. Has orders → soft delete (hidden, never shown again in dashboard)
      const { error: softDeleteError } = await supabase
        .from('products')
        .update({ is_active: false, status: 'deleted' })
        .eq('id', productId)
        .eq('tenant_id', tenantId);

      if (softDeleteError) {
        console.error('[PRODUCT_DELETE] Supabase soft delete error:', softDeleteError.message);
        res.status(500).json({ ok: false, error: `Failed to soft delete product: ${softDeleteError.message}`, details: softDeleteError });
        return;
      }

      db.log(tenantId, 'PRODUCT_DELETE', `Soft deleted product ID: ${productId} (has ${orderCount} orders)`);
      console.log(`[PRODUCT_DELETE] tenant_id=${tenantId} product_id=${productId} orders_count=${orderCount} action=soft_deleted`);
      res.json({ ok: true, mode: 'soft_deleted', message: 'Product has existing orders, so it was deleted from the dashboard and hidden from the bot, while order history was kept safe.' });
      return;
    }

    // 2b. No orders → hard delete

    // Delete linked variants first
    const { error: varDeleteError } = await supabase
      .from('product_variants')
      .delete()
      .eq('product_id', productId)
      .eq('tenant_id', tenantId);

    if (varDeleteError) {
      console.error('[PRODUCT_DELETE] Supabase variant delete error:', varDeleteError.message);
      res.status(500).json({ ok: false, error: `Failed to delete variants: ${varDeleteError.message}`, details: varDeleteError });
      return;
    }

    // Delete product
    const { error: prodDeleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('tenant_id', tenantId);

    if (prodDeleteError) {
      console.error('[PRODUCT_DELETE] Supabase product delete error:', prodDeleteError.message);
      res.status(500).json({ ok: false, error: `Failed to delete product: ${prodDeleteError.message}`, details: prodDeleteError });
      return;
    }

    db.log(tenantId, 'PRODUCT_DELETE', `Hard deleted product ID: ${productId}`);
    console.log(`[PRODUCT_DELETE] tenant_id=${tenantId} product_id=${productId} orders_count=0 action=hard_deleted`);
    res.json({ ok: true, mode: 'deleted' });
  } catch (err: any) {
    console.error(`[PRODUCT_DELETE] error for tenant_id=${tenantId}:`, err.message || err);
    res.status(500).json({ ok: false, error: err.message || 'Internal error during product deletion', details: err });
  }
});

// POST /api/tenant/products/:id/stock
app.post('/api/tenant/products/:id/stock', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = Number(req.params.id);
  const { quantity, mode } = req.body;

  if (quantity === undefined || quantity === null || !['add', 'set'].includes(mode)) {
    res.status(400).json({ error: 'quantity and mode (add|set) are required' });
    return;
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty < 0) {
    res.status(400).json({ error: 'quantity must be a non-negative number' });
    return;
  }

  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  // Fetch current product stock
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, stock, tenant_id')
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !product) {
    console.error('[STOCK_UPDATE] product fetch error:', fetchErr?.message);
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const oldStock = Number(product.stock) || 0;
  const newStock = mode === 'add' ? oldStock + qty : qty;

  console.log('[STOCK_UPDATE] === START ===', {
    tenant_id: tenantId,
    product_id: productId,
    old_stock: oldStock,
    new_stock: newStock,
    mode,
    quantity: qty,
  });

  // Update products.stock
  const { error: prodUpdateErr } = await supabase
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId)
    .eq('tenant_id', tenantId);

  if (prodUpdateErr) {
    console.error('[STOCK_UPDATE] product update error:', prodUpdateErr.message);
    res.status(500).json({ error: `Failed to update product stock: ${prodUpdateErr.message}` });
    return;
  }

  // Update linked product_variants.stock
  const { data: variants, error: varFetchErr } = await supabase
    .from('product_variants')
    .select('id, stock')
    .eq('product_id', productId)
    .eq('tenant_id', tenantId);

  if (varFetchErr) {
    console.error('[STOCK_UPDATE] variant fetch error:', varFetchErr.message);
  } else if (variants && variants.length > 0) {
    for (const v of variants) {
      const oldVarStock = Number(v.stock) || 0;
      const newVarStock = mode === 'add' ? oldVarStock + qty : qty;
      const { error: varUpdateErr } = await supabase
        .from('product_variants')
        .update({ stock: newVarStock })
        .eq('id', v.id)
        .eq('tenant_id', tenantId);

      if (varUpdateErr) {
        console.error('[STOCK_UPDATE] variant update error:', varUpdateErr.message, { variant_id: v.id });
      } else {
        console.log('[STOCK_UPDATE] variant updated', { variant_id: v.id, old_stock: oldVarStock, new_stock: newVarStock });
      }
    }
  }

  console.log('[STOCK_UPDATE] === DONE ===', {
    tenant_id: tenantId,
    product_id: productId,
    old_stock: oldStock,
    new_stock: newStock,
    mode,
    variants_updated: variants?.length || 0,
  });

  db.log(tenantId, 'STOCK_UPDATE', `Stock ${mode} for product ${productId}: ${oldStock} -> ${newStock}`);

  res.json({
    success: true,
    product_id: productId,
    old_stock: oldStock,
    new_stock: newStock,
    mode,
    variants_updated: variants?.length || 0,
  });
});

// POST /api/tenant/products/:id/activate
app.post('/api/tenant/products/:id/activate', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = Number(req.params.id);

  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .update({ is_active: true, status: 'active' })
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('[PRODUCT_ACTIVATE] Supabase error:', error.message);
    res.status(500).json({ error: `Activation failed: ${error.message}` });
    return;
  }

  if (!data) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.log(tenantId, 'PRODUCT_ACTIVATE', `Activated product ID: ${productId} - "${data.name}"`);
  console.log('[PRODUCT_ACTIVATE] Activated:', { product_id: productId, name: data.name });
  res.json(mapProductRow(data));
});

// POST /api/tenant/products/:id/deactivate
app.post('/api/tenant/products/:id/deactivate', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = Number(req.params.id);

  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .update({ is_active: false, status: 'inactive' })
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('[PRODUCT_DEACTIVATE] Supabase error:', error.message);
    res.status(500).json({ error: `Deactivation failed: ${error.message}` });
    return;
  }

  if (!data) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.log(tenantId, 'PRODUCT_DEACTIVATE', `Deactivated product ID: ${productId} - "${data.name}"`);
  console.log('[PRODUCT_DEACTIVATE] Deactivated:', { product_id: productId, name: data.name });
  res.json(mapProductRow(data));
});

// GET /api/tenant/variants
app.get('/api/tenant/variants', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  if (!supabase) {
    res.json(db.getVariants(tenantId));
    return;
  }
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('[SUPABASE] product_variants query error:', error.message);
    res.status(500).json({ error: `Supabase query failed: ${error.message}` });
    return;
  }
  res.json((data || []).map(mapVariantRow));
});

// POST /api/tenant/variants
app.post('/api/tenant/variants', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { product_id, name, price, stock, description, delivery_note } = req.body;

  if (!product_id || !name || price === undefined) {
    res.status(400).json({ error: 'Product ID, variation name, and price are required' });
    return;
  }

  const variantPayload = {
    tenant_id: tenantId,
    product_id: Number(product_id),
    variant_name: name,
    price: Number(price) || 0,
    stock: Number(stock || 0),
    description: description || '',
    delivery_note: delivery_note || '',
  };

  console.log('[VARIANT_CREATE] session tenant_id:', tenantId);
  console.log('[VARIANT_CREATE] request body:', JSON.stringify(req.body));
  console.log('[VARIANT_CREATE] product_id:', product_id);
  console.log('[VARIANT_CREATE] final payload:', JSON.stringify(variantPayload));

  if (!supabase) {
    const product = db.getProductById(product_id, tenantId);
    if (!product) {
      res.status(404).json({ error: 'Matching product not found' });
      return;
    }
    const vari = db.createVariant({
      tenant_id: tenantId,
      product_id,
      name: variantPayload.variant_name,
      price: variantPayload.price,
      stock: variantPayload.stock,
      description: variantPayload.description,
      delivery_note: variantPayload.delivery_note,
      active: true,
    });
    console.log('[VARIANT_CREATE] Dev mode — saved to local DB, id:', vari.id);
    db.log(tenantId, 'VARIANT_CREATE', `Created variant "${name}" for product "${product.name}"`);
    res.json(vari);
    return;
  }

  // Verify product exists in Supabase before creating variant
  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', Number(product_id))
    .eq('tenant_id', tenantId)
    .single();

  if (!product) {
    res.status(404).json({ error: 'Matching product not found in Supabase' });
    return;
  }

  // Check if product has only one default variant with stock 0 — update it instead of creating duplicate
  const { data: existingVariants } = await supabase
    .from('product_variants')
    .select('id, stock')
    .eq('product_id', Number(product_id))
    .eq('tenant_id', tenantId);

  if (existingVariants && existingVariants.length === 1 && Number(existingVariants[0].stock) === 0) {
    // Update the default variant instead of inserting a new one
    const defaultVariantId = existingVariants[0].id;
    console.log('[VARIANT_CREATE] Replacing default variant (id:', defaultVariantId, ') — single variant with stock 0');

    const { data: updated, error: updateError } = await supabase
      .from('product_variants')
      .update(variantPayload)
      .eq('id', defaultVariantId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      console.error('[VARIANT_CREATE] Supabase update error:', JSON.stringify(updateError));
      res.status(500).json({ error: `Supabase variant update failed: ${updateError.message}` });
      return;
    }

    console.log('[VARIANT_CREATE] Supabase update success, variant id:', updated.id);
    db.log(tenantId, 'VARIANT_CREATE', `Updated default variant to "${variantPayload.variant_name}" for product "${product.name}"`);
    res.json(mapVariantRow(updated));
    return;
  }

  const { data, error } = await supabase
    .from('product_variants')
    .insert(variantPayload)
    .select()
    .single();

  if (error) {
    console.error('[VARIANT_CREATE] Supabase error:', JSON.stringify(error));
    res.status(500).json({ error: `Supabase insert failed: ${error.message}` });
    return;
  }

  console.log('[VARIANT_CREATE] Supabase success, variant id:', data.id);
  console.log('[VARIANT_CREATE] Supabase returned data:', JSON.stringify(data));
  db.log(tenantId, 'VARIANT_CREATE', `Created variant "${variantPayload.variant_name}" for product "${product.name}"`);
  res.json(mapVariantRow(data));
});

// DELETE /api/tenant/variants/:id
app.delete('/api/tenant/variants/:id', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const variantId = Number(req.params.id);

  if (!supabase) {
    const lists = db.getVariants(tenantId);
    const exists = lists.find((v: any) => v.id === String(variantId));
    if (!exists) {
      res.status(404).json({ error: 'Variant not found' });
      return;
    }
    db.deleteVariant(String(variantId), tenantId);
    db.log(tenantId, 'VARIANT_DELETE', `Deleted variant ID: ${variantId}`);
    res.json({ message: 'Variant deleted' });
    return;
  }

  // Verify variant exists and belongs to this tenant
  const { data: variant } = await supabase
    .from('product_variants')
    .select('id, variant_name')
    .eq('id', variantId)
    .eq('tenant_id', tenantId)
    .single();

  if (!variant) {
    res.status(404).json({ error: 'Variant not found' });
    return;
  }

  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[VARIANT_DELETE] Supabase error:', error.message);
    res.status(500).json({ error: `Supabase delete failed: ${error.message}` });
    return;
  }

  console.log('[VARIANT_DELETE] Deleted variant:', variantId);
  db.log(tenantId, 'VARIANT_DELETE', `Deleted variant "${variant.variant_name}" [ID: ${variantId}]`);
  res.json({ message: 'Variant deleted' });
});

// PATCH /api/tenant/variants/:id
app.patch('/api/tenant/variants/:id', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const variantId = Number(req.params.id);

  if (!supabase) {
    const lists = db.getVariants(tenantId);
    const exists = lists.find((v: any) => v.id === String(variantId));
    if (!exists) {
      res.status(404).json({ error: 'Variant not found' });
      return;
    }
    const updated = db.updateVariant(String(variantId), tenantId, req.body);
    db.log(tenantId, 'VARIANT_UPDATE', `Updated variant parameters: "${updated?.name}"`);
    res.json(updated);
    return;
  }

  const { data, error } = await supabase
    .from('product_variants')
    .update(variantToSupabase(req.body))
    .eq('id', variantId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('[VARIANT_UPDATE] Supabase error:', error.message);
    res.status(500).json({ error: `Supabase update failed: ${error.message}` });
    return;
  }

  if (!data) {
    res.status(404).json({ error: 'Variant not found' });
    return;
  }

  db.log(tenantId, 'VARIANT_UPDATE', `Updated variant ID: ${variantId}`);
  res.json(mapVariantRow(data));
});

// GET /api/tenant/orders
app.get('/api/tenant/orders', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { status, search } = req.query;

  let list: any[] = [];
  if (supabase) {
    const data = await supabaseGet(tenantId, 'orders');
    if (data) list = data;
  }
  if (list.length === 0) {
    list = db.getOrders(tenantId);
  }

  if (status && status !== 'all') {
    list = list.filter(o => o.status === status);
  }

  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(o => 
      o.id.toLowerCase().includes(s) || 
      o.payer_username.toLowerCase().includes(s) ||
      (o.notes && o.notes.toLowerCase().includes(s))
    );
  }

  res.json(list);
});

// GET /api/tenant/orders/:id
app.get('/api/tenant/orders/:id', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const orderId = req.params.id;

  let order: any = null;
  if (supabase) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', orderId)
      .single();
    if (!error && data) order = data;
  }
  if (!order) {
    order = db.getOrderById(orderId, tenantId);
  }

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json(order);
});

// PATCH /api/tenant/orders/:id
app.patch('/api/tenant/orders/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const orderId = req.params.id;
  const { status, notes } = req.body;

  const order = db.getOrderById(orderId, tenantId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (!status || !['completed', 'rejected', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'Invalid order state conversion requested.' });
    return;
  }

  const updated = db.updateOrderStatus(orderId, tenantId, status);
  if (updated && notes) {
    updated.notes = (updated.notes || "") + " | Admin Note: " + notes;
  }

  db.log(tenantId, `ORDER_STATUS_PORT_${status.toUpperCase()}`, `Order ID: #${orderId} marked ${status}`);
  res.json(updated);
});

// GET /api/tenant/sales
app.get('/api/tenant/sales', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  let orders: any[] = [];
  let products: any[] = [];

  if (supabase) {
    const [o, p] = await Promise.all([
      supabaseGet(tenantId, 'orders'),
      supabaseGet(tenantId, 'products'),
    ]);
    if (o) orders = o;
    if (p) products = p;
  }
  if (orders.length === 0) {
    orders = db.getOrders(tenantId);
    products = db.getProducts(tenantId);
  }

  orders = orders.filter((o: any) => o.status === 'completed');

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const avgOrderValue = orders.length > 0 ? (totalRevenue / orders.length) : 0;

  // Revenue trend grouped by day (last 15 days)
  const dailyRev: Record<string, { date: string; revenue: number; orders: number }> = {};
  for (let i = 14; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const code = d.toISOString().split('T')[0];
    const display = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyRev[code] = { date: display, revenue: 0, orders: 0 };
  }

  for (const o of orders) {
    const code = o.created_at.split('T')[0];
    if (code in dailyRev) {
      dailyRev[code].revenue += o.amount;
      dailyRev[code].orders += 1;
    }
  }

  const trend = Object.values(dailyRev);

  // Group breakdown by product
  const productGroup: Record<string, { name: string; units: number; revenue: number }> = {};
  for (const o of orders) {
    if (!productGroup[o.product_id]) {
      const p = products.find(prod => prod.id === o.product_id);
      productGroup[o.product_id] = {
        name: p ? p.name : "Deleted Product",
        units: 0,
        revenue: 0
      };
    }
    productGroup[o.product_id].units += 1;
    productGroup[o.product_id].revenue += o.amount;
  }

  res.json({
    totalCompletedOrders: orders.length,
    revenue: parseFloat(totalRevenue.toFixed(2)),
    averageOrderValue: parseFloat(avgOrderValue.toFixed(2)),
    dailyTrend: trend,
    productBreakdown: Object.values(productGroup).sort((a,b) => b.revenue - a.revenue)
  });
});

// GET /api/tenant/stocks
app.get('/api/tenant/stocks', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  let products: any[] = [];
  let variants: any[] = [];
  let credentials: any[] = [];

  if (supabase) {
    const [p, v, c] = await Promise.all([
      supabaseGet(tenantId, 'products'),
      supabaseGet(tenantId, 'product_variants'),
      supabaseGet(tenantId, 'credentials'),
    ]);
    if (p) products = p.map(mapProductRow);
    if (v) variants = v.map(mapVariantRow);
    if (c) credentials = c;
  }

  if (products.length === 0) {
    const stocks = db.getStocks(tenantId);
    res.json(stocks);
    return;
  }

  const result = products.map((prod: any) => {
    const prodVariants = variants.filter((v: any) => v.product_id === prod.id);
    const totalCreds = credentials.filter((c: any) => c.product_id === prod.id);
    const availableCreds = totalCreds.filter((c: any) => !c.is_used).length;
    const deliveredCreds = totalCreds.filter((c: any) => c.is_used).length;

    return {
      product: prod,
      variants: prodVariants,
      totalCredentials: totalCreds.length,
      availableCredentials: availableCreds,
      deliveredCount: deliveredCreds
    };
  });

  res.json(result);
});

// PATCH /api/tenant/stocks/:id
app.patch('/api/tenant/stocks/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const id = req.params.id; // product or variant id
  const { stock, type } = req.body; // type is 'product' or 'variant'

  if (stock === undefined) {
    res.status(400).json({ error: 'Stock qty required' });
    return;
  }

  const num = parseInt(stock) || 0;
  if (type === 'variant') {
    const upgraded = db.updateVariant(id, tenantId, { stock: num });
    res.json(upgraded);
  } else {
    const upgraded = db.updateProduct(id, tenantId, { stock: num });
    res.json(upgraded);
  }
});

// GET /api/tenant/credentials
app.get('/api/tenant/credentials', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  let creds: any[] | null = null;
  if (supabase) {
    creds = await supabaseGet(tenantId, 'credentials');
  }
  res.json(creds || db.getCredentials(tenantId) || []);
});

// POST /api/tenant/credentials
app.post('/api/tenant/credentials', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { product_id, variant_id, raw_text } = req.body;

  if (!product_id || !raw_text) {
    res.status(400).json({ error: 'Product ID and credential values text block are required' });
    return;
  }

  const pairs = raw_text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

  // Write to Supabase if available
  if (supabase) {
    const rows = pairs.map((line: string) => {
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
      return {
        tenant_id: tenantId,
        product_id: Number(product_id),
        variant_id: variant_id ? Number(variant_id) : null,
        email,
        password,
        is_used: false,
      };
    });
    const { error: insertError } = await supabase.from('credentials').insert(rows);
    if (insertError) {
      console.error('[SUPABASE] credentials insert error:', insertError.message);
      res.status(500).json({ error: `Supabase insert failed: ${insertError.message}` });
      return;
    }
  }

  // Also write to local DB
  const added = db.addCredentials(tenantId, product_id, variant_id || null, raw_text);
  db.log(tenantId, 'CREDENTIALS_BULK', `Bulk uploaded ${added} credentials for product ID: #${product_id}`);
  res.json({ status: 'success', count_added: added });
});

// PATCH /api/tenant/credentials/:id/assign-variant
app.patch('/api/tenant/credentials/:id/assign-variant', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const credId = req.params.id;
  const { variant_id } = req.body;

  if (!variant_id) {
    res.status(400).json({ error: 'variant_id is required' });
    return;
  }

  if (supabase) {
    const { error } = await supabase
      .from('credentials')
      .update({ variant_id: Number(variant_id) })
      .eq('id', Number(credId))
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('[SUPABASE] credentials variant assign error:', error.message);
      res.status(500).json({ error: `Supabase update failed: ${error.message}` });
      return;
    }
  }

  const updated = db.updateCredentialVariant(credId, tenantId, variant_id);
  if (!updated) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }

  db.log(tenantId, 'CREDENTIALS_ASSIGN', `Assigned credential ID: ${credId} to variant ID: ${variant_id}`);
  res.json({ ok: true });
});

// GET /api/tenant/settings
app.get('/api/tenant/settings', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  let settings: any[] | null = null;
  if (supabase) {
    settings = await supabaseGet(tenantId, 'bot_settings');
  }
  res.json(settings || db.getSettings(tenantId) || []);
});

// PATCH /api/tenant/settings/:key
app.patch('/api/tenant/settings/:key', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const key = req.params.key;
  const { value } = req.body;

  if (value === undefined) {
    res.status(400).json({ error: 'Setting value required' });
    return;
  }

  // Update in Supabase if available
  if (supabase) {
    const { data: updateData, error: updateError } = await supabase
      .from('bot_settings')
      .update({ value })
      .eq('tenant_id', tenantId)
      .eq('key', key)
      .select();

    if (updateError) {
      console.error(`[SUPABASE] bot_settings update error for ${key}:`, updateError.message);
    } else if (!updateData || updateData.length === 0) {
      // No existing row, insert
      const { error: insertError } = await supabase
        .from('bot_settings')
        .insert({ tenant_id: tenantId, key, value });
      if (insertError) {
        console.error(`[SUPABASE] bot_settings insert error for ${key}:`, insertError.message);
      }
    }
  }

  const setting = db.updateSetting(tenantId, key, value);
  db.log(tenantId, 'SETTING_UPDATE', `Modified configuration key: "${key}"`);
  res.json(setting);
});

// POST /api/tenant/media/payment-qr
app.post('/api/tenant/media/payment-qr', requireTenantAuth, (req: Request, res: Response) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'File upload limit exceeded or invalid file type' });
      return;
    }
    const tenantId = (req as any).tenant_id;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }
    
    try {
      let finalUrl = '';
      if (supabase) {
        // Upload to Supabase Storage
        const ext = path.extname(file.originalname).substring(1) || 'png';
        const filePath = `${tenantId}/payment-qr-${Date.now()}.${ext}`;
        const { data, error } = await supabase.storage
          .from('tenant-assets')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });
        if (error) {
          throw error;
        }
        const { data: { publicUrl } } = supabase.storage
          .from('tenant-assets')
          .getPublicUrl(filePath);
        finalUrl = publicUrl;
      } else {
        // Mock fallback using standard base64 Data URL for AI Studio workspace compatibility
        finalUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      }

      db.updateSetting(tenantId, 'payment_qr_url', finalUrl);
      db.log(tenantId, 'MEDIA_UPLOAD', `Uploaded new Payment QR image`);
      res.json({
        status: 'success',
        url: finalUrl,
        warning: supabase ? undefined : 'Supabase storage not set; default local fallback used'
      });
    } catch (uploadError: any) {
      res.status(500).json({ error: uploadError.message || 'Error occurred while saving image to storage service' });
    }
  });
});

// POST /api/tenant/media/banner
app.post('/api/tenant/media/banner', requireTenantAuth, (req: Request, res: Response) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'File upload limit exceeded or invalid file type' });
      return;
    }
    const tenantId = (req as any).tenant_id;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }
    
    try {
      let finalUrl = '';
      if (supabase) {
        // Upload to Supabase Storage
        const ext = path.extname(file.originalname).substring(1) || 'png';
        const filePath = `${tenantId}/banner-${Date.now()}.${ext}`;
        const { data, error } = await supabase.storage
          .from('tenant-assets')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });
        if (error) {
          throw error;
        }
        const { data: { publicUrl } } = supabase.storage
          .from('tenant-assets')
          .getPublicUrl(filePath);
        finalUrl = publicUrl;
      } else {
        // Mock fallback using standard base64 Data URL for AI Studio workspace compatibility
        finalUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      }

      db.updateSetting(tenantId, 'banner_url', finalUrl);
      db.log(tenantId, 'MEDIA_UPLOAD', `Uploaded new Shop Banner image`);
      res.json({
        status: 'success',
        url: finalUrl,
        warning: supabase ? undefined : 'Supabase storage not set; default local fallback used'
      });
    } catch (uploadError: any) {
      res.status(500).json({ error: uploadError.message || 'Error occurred while saving image to storage service' });
    }
  });
});

// DELETE /api/tenant/media/payment-qr
app.delete('/api/tenant/media/payment-qr', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  try {
    const oldSetting = db.getSettings(tenantId).find(s => s.key === 'payment_qr_url');
    if (oldSetting && oldSetting.value && supabase) {
      const url = oldSetting.value;
      if (url.includes('tenant-assets/')) {
        const filePath = url.split('tenant-assets/')[1]?.split('?')[0];
        if (filePath) {
          await supabase.storage.from('tenant-assets').remove([filePath]);
        }
      }
    }
    db.updateSetting(tenantId, 'payment_qr_url', '');
    db.log(tenantId, 'MEDIA_DELETE', `Deleted Payment QR image`);
    res.json({ status: 'success' });
  } catch (deleteError: any) {
    res.status(500).json({ error: deleteError.message || 'Error deleting file from storage' });
  }
});

// DELETE /api/tenant/media/banner
app.delete('/api/tenant/media/banner', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  try {
    const oldSetting = db.getSettings(tenantId).find(s => s.key === 'banner_url');
    if (oldSetting && oldSetting.value && supabase) {
      const url = oldSetting.value;
      if (url.includes('tenant-assets/')) {
        const filePath = url.split('tenant-assets/')[1]?.split('?')[0];
        if (filePath) {
          await supabase.storage.from('tenant-assets').remove([filePath]);
        }
      }
    }
    db.updateSetting(tenantId, 'banner_url', '');
    db.log(tenantId, 'MEDIA_DELETE', `Deleted Shop Banner image`);
    res.json({ status: 'success' });
  } catch (deleteError: any) {
    res.status(500).json({ error: deleteError.message || 'Error deleting file from storage' });
  }
});

// POST /api/tenant/assets/upload - Unified asset upload for payment QR and banner
app.post('/api/tenant/assets/upload', requireTenantAuth, (req: Request, res: Response) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ ok: false, error: err.message || 'File upload limit exceeded or invalid file type' });
      return;
    }
    const tenantId = (req as any).tenant_id;
    const file = req.file;
    const assetType = req.body.assetType;

    if (!file) {
      res.status(400).json({ ok: false, error: 'No file uploaded' });
      return;
    }
    if (!assetType || !['payment_qr', 'banner'].includes(assetType)) {
      res.status(400).json({ ok: false, error: 'Invalid assetType. Must be "payment_qr" or "banner"' });
      return;
    }

    const isQR = assetType === 'payment_qr';
    const prefix = isQR ? 'payment-qr' : 'banner';
    const settingKey = isQR ? 'payment_qr_url' : 'banner_url';
    const fileIdKey = isQR ? 'payment_qr_file_id' : 'banner_file_id';

    try {
      let finalUrl = '';
      console.log(`[ASSET_UPLOAD] tenant_id=${tenantId} assetType=${assetType} file=${file.originalname} type=${file.mimetype} size=${file.size}`);

      if (supabase) {
        const ext = path.extname(file.originalname).substring(1) || 'png';
        const filePath = `${tenantId}/${prefix}-${Date.now()}.${ext}`;
        console.log(`[ASSET_UPLOAD] storage path=${filePath}`);

        const { error: uploadError } = await supabase.storage
          .from('tenant-assets')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (uploadError) {
          console.error(`[ASSET_UPLOAD] storage upload error:`, uploadError.message);
          if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
            res.status(500).json({ ok: false, error: 'Supabase storage bucket tenant-assets does not exist' });
            return;
          }
          res.status(500).json({ ok: false, error: `Storage upload error: ${uploadError.message}` });
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('tenant-assets')
          .getPublicUrl(filePath);

        if (!publicUrl) {
          res.status(500).json({ ok: false, error: 'Failed to get public URL for uploaded file' });
          return;
        }

        finalUrl = publicUrl;
        console.log(`[ASSET_UPLOAD] public URL=${finalUrl}`);

        // Update bot_settings in Supabase: set URL value
        const { data: updateUrlData, error: updateUrlError } = await supabase
          .from('bot_settings')
          .update({ value: finalUrl })
          .eq('tenant_id', tenantId)
          .eq('key', settingKey)
          .select();

        if (updateUrlError) {
          console.error(`[ASSET_UPLOAD] bot_settings update error for ${settingKey}:`, updateUrlError.message);
        } else if (!updateUrlData || updateUrlData.length === 0) {
          // No row existed, insert it
          const { error: insertUrlError } = await supabase
            .from('bot_settings')
            .insert({ tenant_id: tenantId, key: settingKey, value: finalUrl, description: (isQR ? 'Public URL of store payment QR image' : 'Public URL of shop welcome banner image') });
          if (insertUrlError) {
            console.error(`[ASSET_UPLOAD] bot_settings insert error for ${settingKey}:`, insertUrlError.message);
          }
        }

        // Clear file_id in Supabase
        const { data: clearFileData, error: clearFileError } = await supabase
          .from('bot_settings')
          .update({ value: '' })
          .eq('tenant_id', tenantId)
          .eq('key', fileIdKey)
          .select();

        if (clearFileError) {
          console.error(`[ASSET_UPLOAD] bot_settings update error for ${fileIdKey}:`, clearFileError.message);
        } else if (!clearFileData || clearFileData.length === 0) {
          const { error: insertFileError } = await supabase
            .from('bot_settings')
            .insert({ tenant_id: tenantId, key: fileIdKey, value: '', description: (isQR ? 'Telegram File ID for payment QR code' : 'Telegram File ID for shop welcome banner') });
          if (insertFileError) {
            console.error(`[ASSET_UPLOAD] bot_settings insert error for ${fileIdKey}:`, insertFileError.message);
          }
        }

        console.log(`[ASSET_UPLOAD] bot_settings update result: ${settingKey}=${finalUrl}, ${fileIdKey}=""`);
      } else {
        finalUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      }

      // Always update local FileDatabase as fallback
      db.updateSetting(tenantId, settingKey, finalUrl);
      db.updateSetting(tenantId, fileIdKey, '');
      db.log(tenantId, 'MEDIA_UPLOAD', `Uploaded new ${isQR ? 'Payment QR' : 'Banner'} image`);

      console.log(`[ASSET_UPLOAD] complete for tenant_id=${tenantId} key=${settingKey}`);
      res.json({ ok: true, key: settingKey, url: finalUrl });
    } catch (uploadError: any) {
      console.error(`[ASSET_UPLOAD] unexpected error:`, uploadError.message || uploadError);
      res.status(500).json({ ok: false, error: uploadError.message || 'Error uploading file' });
    }
  });
});

// GET /api/tenant/rental
app.get('/api/tenant/rental', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const tenant = db.getTenant(tenantId);
  const payments = db.getRentalPayments(tenantId);

  res.json({
    tenant,
    payments,
    days_left: tenant ? getDaysRemaining(tenant.rent_end) : 0
  });
});

// GET /api/tenant/health
app.get('/api/tenant/health', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const tenant = db.getTenant(tenantId);

  let products: any[] = [];
  let credentials: any[] = [];
  let settings: any[] = [];

  if (supabase) {
    const [p, c, s] = await Promise.all([
      supabaseGet(tenantId, 'products'),
      supabaseGet(tenantId, 'credentials'),
      supabaseGet(tenantId, 'bot_settings'),
    ]);
    if (p) products = p.map(mapProductRow);
    if (c) credentials = c;
    if (s) settings = s;
  }

  if (products.length === 0) {
    products = db.getProducts(tenantId);
    credentials = db.getCredentials(tenantId);
    settings = db.getSettings(tenantId);
  }

  // Health calculate
  // heartbeats older than 10 mins are offline
  // We simulate last heartbeat as now minus 3 minutes
  const lastHeartbeat = new Date();
  lastHeartbeat.setMinutes(lastHeartbeat.getMinutes() - 3);

  const qrVal = settings.find(s => s.key === 'payment_qr_file_id')?.value;
  const qrUrl = settings.find(s => s.key === 'payment_qr_url')?.value;
  const bannerVal = settings.find(s => s.key === 'banner_file_id')?.value;
  const bannerUrl = settings.find(s => s.key === 'banner_url')?.value;

  const hasProducts = products.length > 0;
  const hasPaymentQR = !!qrVal || !!qrUrl;
  const hasBanner = !!bannerVal || !!bannerUrl;
  const hasCredentials = credentials.length > 0;
  const rentalActive = tenant ? (tenant.status === 'active' || tenant.status === 'trial') : false;

  res.json({
    bot_status: 'online', // Simulated status
    last_heartbeat_at: lastHeartbeat.toISOString(),
    service_url: tenant?.service_url || 'https://central.berrystore.com',
    setup_checklist: {
      has_products: hasProducts,
      has_payment_qr: hasPaymentQR,
      has_banner: hasBanner,
      has_credentials: hasCredentials,
      rental_active: rentalActive
    }
  });
});

// GET /api/debug/tenant-data
app.get('/api/debug/tenant-data', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  let products: any[] = [];
  let variants: any[] = [];
  let source = 'memory';
  let error: string | null = null;

  if (supabase) {
    source = 'supabase';
    try {
      const { data: p, error: pe } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId);
      if (pe) {
        error = `products query error: ${pe.message}`;
      } else {
        products = (p || []).map(mapProductRow);
      }
    } catch (e: any) {
      error = `products query exception: ${e.message}`;
    }

    try {
      const { data: v, error: ve } = await supabase
        .from('product_variants')
        .select('*')
        .eq('tenant_id', tenantId);
      if (ve && !error) {
        error = `product_variants query error: ${ve.message}`;
      } else {
        variants = (v || []).map(mapVariantRow);
      }
    } catch (e: any) {
      if (!error) error = `product_variants query exception: ${e.message}`;
    }
  }

  if (products.length === 0 && variants.length === 0 && !supabase) {
    products = db.getProducts(tenantId);
    variants = db.getVariants(tenantId);
  }

  res.json({
    session_tenant_id: tenantId,
    source,
    products_count: products.length,
    product_variants_count: variants.length,
    latest_5_products: products.slice(-5).map((p: any) => ({
      id: p.id,
      tenant_id: p.tenant_id,
      name: p.name,
      price: p.price,
      duration: p.duration,
      is_active: p.is_active,
      active: p.active,
      status: p.status,
    })),
    latest_5_variants: variants.slice(-5).map((v: any) => ({
      id: v.id,
      product_id: v.product_id,
      tenant_id: v.tenant_id,
      name: v.name,
      price: v.price,
      stock: v.stock,
    })),
    supabase_error: error,
    supabase_configured: !!supabase,
  });
});

// POST /api/tenant/broadcast
app.post('/api/tenant/broadcast', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    res.status(400).json({ error: 'Message content is empty' });
    return;
  }

  let users: any[] = [];
  if (supabase) {
    const data = await supabaseGet(tenantId, 'users');
    if (data) users = data;
  }
  if (users.length === 0) {
    users = db.getUsers(tenantId);
  }
  
  db.log(tenantId, 'BROADCAST_TRIGGER', `Triggered Telegram notification broadcast to total recipients: ${users.length} bot users`);
  res.json({
    status: 'success',
    recipients_count: users.length,
    message: 'Broadcast initiated successfully on Telegram'
  });
});


// -------------------------------------------------------------------
// MASTER OWNER API (Require requireMasterAuth)
// -------------------------------------------------------------------

// GET /api/master/overview
app.get('/api/master/overview', requireMasterAuth, (req: Request, res: Response) => {
  const tenants = db.getTenants();
  
  const total = tenants.length;
  const active = tenants.filter(t => t.status === 'active').length;
  const trial = tenants.filter(t => t.status === 'trial').length;
  const expired = tenants.filter(t => t.status === 'expired').length;
  const suspended = tenants.filter(t => t.status === 'suspended').length;
  
  // Offline count: say Omega Keys because suspended, and let's say Alfa is offline
  const offline = tenants.filter(t => t.status === 'expired' || t.status === 'suspended').length;
  
  const expiringSoon = tenants.filter(t => {
    const days = getDaysRemaining(t.rent_end);
    return t.status === 'active' && days > 0 && days <= 7;
  }).length;

  const totalMonthlyPremiumRevenue = tenants
    .filter(t => t.status === 'active' || t.status === 'trial')
    .reduce((sum, t) => sum + t.monthly_price, 0);

  const warnings: string[] = [];
  if (offline > 0) warnings.push(`${offline} Telegram bot gateways are currently offline.`);
  if (expiringSoon > 0) warnings.push(`${expiringSoon} bot rentals are expiring within 7 days.`);

  res.json({
    totalTenants: total,
    activeTenants: active,
    trialTenants: trial,
    expiredTenants: expired,
    suspendedTenants: suspended,
    offlineBots: offline,
    expiringSoonCount: expiringSoon,
    totalRentalRevenue: parseFloat(totalMonthlyPremiumRevenue.toFixed(2)),
    systemWarnings: warnings
  });
});

// GET /api/master/tenants
app.get('/api/master/tenants', requireMasterAuth, (req: Request, res: Response) => {
  const tenants = db.getTenants().map(t => {
    const orders = db.getOrders(t.tenant_id);
    const users = db.getUsers(t.tenant_id);

    const totalRevenue = orders
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + o.amount, 0);

    return {
      ...t,
      days_left: getDaysRemaining(t.rent_end),
      stats: {
        total_ordersCount: orders.length,
        total_usersCount: users.length,
        revenue: totalRevenue
      }
    };
  });
  res.json(tenants);
});

// POST /api/master/tenants
app.post('/api/master/tenants', requireMasterAuth, async (req: Request, res: Response) => {
  const { store_name, bot_username, owner_telegram_id, owner_username, monthly_price, duration_months, service_url, notes } = req.body;

  if (!store_name || !bot_username || !owner_telegram_id || !monthly_price || !duration_months) {
    res.status(400).json({ error: 'Missing required configuration parameters' });
    return;
  }

  const rentStart = new Date();
  const rentEnd = new Date();
  rentEnd.setMonth(rentEnd.getMonth() + parseInt(duration_months));

  const ownerTelegramId = String(owner_telegram_id);

  // Generate tenant UUID — try Supabase first, fall back to local
  let tenantUuid: string;

  if (supabase) {
    const supabasePayload: Record<string, any> = {
      name: store_name,
      bot_username,
      owner_telegram_id: ownerTelegramId,
      owner_username: owner_username || '',
      status: 'active',
      monthly_price: parseFloat(monthly_price) || 0,
      rent_start: rentStart.toISOString(),
      rent_end: rentEnd.toISOString(),
      notes: notes || '',
    };

    const { data, error } = await supabase
      .from('tenants')
      .insert(supabasePayload)
      .select('id,name,bot_username,owner_telegram_id,owner_username,status,rent_start,rent_end')
      .single();

    if (error) {
      console.error('[TENANT] Supabase insert error:', error);
      res.status(500).json({ error: `Supabase error: ${error.message}` });
      return;
    }

    tenantUuid = data.id;

    // Seed default bot_settings in Supabase
    const defaultBotSettings = [
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
      { key: 'banner_url', value: '', description: 'Public URL of shop welcome banner image' },
    ];
    const settingsRows = defaultBotSettings.map(s => ({
      tenant_id: tenantUuid,
      key: s.key,
      value: s.value,
      description: s.description,
    }));
    const { error: settingsError } = await supabase
      .from('bot_settings')
      .insert(settingsRows);
    if (settingsError) {
      console.error('[TENANT] Supabase bot_settings seed error:', settingsError.message);
      // do not fail — product was created, settings can be seeded later
    } else {
      console.log('[TENANT] Seeded default bot_settings for tenant:', tenantUuid);
    }
  } else {
    tenantUuid = crypto.randomUUID();
  }

  const newTenant: Tenant = {
    tenant_id: tenantUuid,
    name: store_name,
    bot_username,
    owner_telegram_id: ownerTelegramId,
    owner_username: owner_username || '',
    monthly_price: parseFloat(monthly_price) || 0,
    status: 'active',
    rent_start: rentStart.toISOString(),
    rent_end: rentEnd.toISOString(),
    dashboard_enabled: true,
    dashboard_secret_hash: null,
    dashboard_password_set_at: null,
    dashboard_first_login_at: null,
    dashboard_last_login_at: null,
    dashboard_password_reset_required: false,
    service_url: service_url || '',
    notes: notes || '',
    created_at: rentStart.toISOString()
  };

  const created = db.createTenant(newTenant);
  db.log(tenantUuid, 'TENANT_PROVISION', `Admin provisioned new tenant bot store: "${store_name}"`);

  res.status(201).json(created);
});

// GET /api/master/tenants/:tenant_id
app.get('/api/master/tenants/:tenant_id', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const orders = db.getOrders(tId);
  const products = db.getProducts(tId);
  const credentials = db.getCredentials(tId);
  const users = db.getUsers(tId);

  const rev = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.amount, 0);

  res.json({
    tenant: {
      ...tenant,
      days_left: getDaysRemaining(tenant.rent_end)
    },
    analytics: {
      totalOrders: orders.length,
      totalRevenue: rev,
      productsCount: products.length,
      credentialsCount: credentials.length,
      usersCount: users.length,
      recentOrders: orders.slice(0, 5)
    }
  });
});

// PATCH /api/master/tenants/:tenant_id
app.patch('/api/master/tenants/:tenant_id', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, req.body);
  db.log(tId, 'TENANT_META_UPDATE', `Master admin updated tenant configuration metadata`);
  res.json(updated);
});

// POST /api/master/tenants/:tenant_id/extend
app.post('/api/master/tenants/:tenant_id/extend', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const { months } = req.body;

  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const numMonths = parseInt(months) || 1;
  const currentEnd = new Date(tenant.rent_end);
  // Extend from current rent end if in active, otherwise extend from today's date
  const baseDate = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
  baseDate.setMonth(baseDate.getMonth() + numMonths);

  const updated = db.updateTenant(tId, {
    rent_end: baseDate.toISOString(),
    status: 'active' // reactivate if suspended/expired
  });

  db.log(tId, 'RENTAL_EXTENSION', `Master owner extended tenant license by ${numMonths} months`);
  res.json(updated);
});

// POST /api/master/tenants/:tenant_id/suspend
app.post('/api/master/tenants/:tenant_id/suspend', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, { status: 'suspended', dashboard_enabled: false });
  db.log(tId, 'SUSPENSION_ACTIVATED', 'Tenant account and dashboard gateway suspended by master administration');
  res.json(updated);
});

// POST /api/master/tenants/:tenant_id/activate
app.post('/api/master/tenants/:tenant_id/activate', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, { status: 'active', dashboard_enabled: true });
  db.log(tId, 'SUSPENSION_REVOKED', 'Tenant account reactivated by master administration');
  res.json(updated);
});

// POST /api/master/tenants/:tenant_id/reset-password
app.post('/api/master/tenants/:tenant_id/reset-password', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, {
    dashboard_secret_hash: null,
    dashboard_password_set_at: null,
    dashboard_password_reset_required: true
  });

  db.log(tId, 'PASSWORD_RESET_TRIGGERED', 'Administrative reset of customer dashboard passwords initiated');
  res.json({ message: 'Dashboard secret successfully deleted. Reset required on next login.' });
});

// POST /api/master/tenants/:tenant_id/disable-dashboard
app.post('/api/master/tenants/:tenant_id/disable-dashboard', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, { dashboard_enabled: false });
  db.log(tId, 'DASHBOARD_LOCKED', 'Dashboard access disabled by Master owner');
  res.json(updated);
});

// POST /api/master/tenants/:tenant_id/enable-dashboard
app.post('/api/master/tenants/:tenant_id/enable-dashboard', requireMasterAuth, (req: Request, res: Response) => {
  const tId = req.params.tenant_id;
  const tenant = db.getTenant(tId);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  const updated = db.updateTenant(tId, { dashboard_enabled: true });
  db.log(tId, 'DASHBOARD_UNLOCKED', 'Dashboard access authorized and enabled by Master owner');
  res.json(updated);
});

// GET /api/master/rental-monitor
app.get('/api/master/rental-monitor', requireMasterAuth, (req: Request, res: Response) => {
  const tenants = db.getTenants();
  
  const active = tenants.filter(t => t.status === 'active' || t.status === 'trial');
  const expiringSoon = tenants.filter(t => {
    const MathLeft = getDaysRemaining(t.rent_end);
    return t.status === 'active' && MathLeft > 0 && MathLeft <= 7;
  });
  const expired = tenants.filter(t => {
    const dLeft = getDaysRemaining(t.rent_end);
    return t.status === 'expired' || dLeft <= 0;
  });
  const suspended = tenants.filter(t => t.status === 'suspended');

  // Quality checks status monitors
  const offlineBots = tenants.filter(t => t.status === 'expired' || t.status === 'suspended');
  const noProducts = tenants.filter(t => db.getProducts(t.tenant_id).length === 0);
  const noPaymentQR = tenants.filter(t => {
    const list = db.getSettings(t.tenant_id);
    const qrObj = list.find(s => s.key === 'payment_qr_file_id');
    return !qrObj || !qrObj.value;
  });
  const noCredentials = tenants.filter(t => {
    const autoProds = db.getProducts(t.tenant_id).filter(p => p.auto_delivery);
    if (autoProds.length === 0) return false;
    const creds = db.getCredentials(t.tenant_id).filter(c => !c.is_used);
    return creds.length === 0;
  });

  res.json({
    active,
    expiringSoon,
    expired,
    suspended,
    offlineBots,
    noProducts,
    noPaymentQR,
    noCredentials
  });
});

// -------------------------------------------------------------------
// MASTER TENANT AUDIT ENDPOINTS
// -------------------------------------------------------------------

// GET /api/master/tenant-audit/:tenantId
app.get('/api/master/tenant-audit/:tenantId', requireMasterAuth, async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;

  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const tableMissing: string[] = [];
  const counts: Record<string, number | null> = {};
  const nullTenantRows: string[] = [];
  const results: Record<string, any> = {};

  console.log('[TENANT_AUDIT] === START === tenant:', tenantId);

  // 1. Fetch tenant row
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (tenantErr) {
    console.error('[TENANT_AUDIT] tenant fetch error:', tenantErr.message);
    errors.push(`tenant fetch: ${tenantErr.message}`);
  }
  results.tenant = tenantRow || null;

  // Helper to count rows in a table (graceful if table missing)
  async function safeCount(table: string, label: string, tenantFilter = true): Promise<number | null> {
    try {
      let query = supabase!.from(table).select('*', { count: 'exact', head: true });
      if (tenantFilter) query = query.eq('tenant_id', tenantId);
      const { count, error } = await query;
      if (error) {
        if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
          tableMissing.push(table);
          return null;
        }
        console.warn(`[TENANT_AUDIT] count ${label} warning:`, error.message);
        warnings.push(`${label} count: ${error.message}`);
        return null;
      }
      return count || 0;
    } catch (e: any) {
      if (e.message?.includes('does not exist') || e.message?.includes('relation')) {
        tableMissing.push(table);
        return null;
      }
      console.warn(`[TENANT_AUDIT] count ${label} exception:`, e.message);
      return null;
    }
  }

  counts.bot_settings = await safeCount('bot_settings', 'bot_settings');
  counts.products = await safeCount('products', 'products');
  counts.product_variants = await safeCount('product_variants', 'product_variants');
  counts.orders = await safeCount('orders', 'orders');
  counts.credentials = await safeCount('credentials', 'credentials');
  counts.users = await safeCount('users', 'users');
  counts.points = await safeCount('points_history', 'points_history');
  counts.rental_payments = await safeCount('rental_payments', 'rental_payments');
  counts.push_subscriptions = await safeCount('push_subscriptions', 'push_subscriptions');

  // Check for missing setup items
  const missingSetup: string[] = [];

  // Check payment_qr_url and banner_url from bot_settings
  if (!tableMissing.includes('bot_settings') && counts.bot_settings !== null && counts.bot_settings > 0) {
    const { data: qrSetting } = await supabase
      .from('bot_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', 'payment_qr_url')
      .single();
    if (!qrSetting || !qrSetting.value) {
      missingSetup.push('payment_qr_url empty');
    }
    const { data: bannerSetting } = await supabase
      .from('bot_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', 'banner_url')
      .single();
    if (!bannerSetting || !bannerSetting.value) {
      missingSetup.push('banner_url empty');
    }
  } else if (!tableMissing.includes('bot_settings')) {
    // No bot_settings means qr and banner are missing
    missingSetup.push('payment_qr_url empty');
    missingSetup.push('banner_url empty');
  }

  if (counts.products === 0) missingSetup.push('products count = 0');
  if (counts.product_variants === 0) missingSetup.push('product_variants count = 0');
  if (counts.credentials === 0) missingSetup.push('credentials count = 0');

  // Orphan variants: product_variants.product_id does not link to products.id
  if (counts.product_variants !== null && counts.product_variants > 0) {
    try {
      const { data: prodIds } = await supabase!
        .from('products')
        .select('id')
        .eq('tenant_id', tenantId);
      const validProductIds = (prodIds || []).map((p: any) => p.id);
      const { data: allVariants } = await supabase!
        .from('product_variants')
        .select('id, product_id, variant_name')
        .eq('tenant_id', tenantId);
      const orphanVariants = (allVariants || []).filter((v: any) => !validProductIds.includes(v.product_id));
      results.orphan_variants = orphanVariants;
      if (orphanVariants.length > 0) {
        warnings.push(`${orphanVariants.length} orphan variant(s) found`);
      }
    } catch (e: any) {
      console.warn('[TENANT_AUDIT] orphan check warning:', e.message);
    }
  } else {
    results.orphan_variants = [];
  }

  // Mismatched variants: product_variants.tenant_id != products.tenant_id
  if (counts.product_variants !== null && counts.product_variants > 0 && counts.products !== null && counts.products > 0) {
    try {
      const { data: prods } = await supabase!
        .from('products')
        .select('id, tenant_id')
        .eq('tenant_id', tenantId);
      const productMap = new Map((prods || []).map((p: any) => [p.id, p.tenant_id]));
      const { data: vars } = await supabase!
        .from('product_variants')
        .select('id, product_id, tenant_id')
        .eq('tenant_id', tenantId);
      const mismatched = (vars || []).filter((v: any) => {
        const prodTenant = productMap.get(v.product_id);
        return prodTenant && prodTenant !== v.tenant_id;
      });
      results.mismatched_variants = mismatched;
      if (mismatched.length > 0) {
        warnings.push(`${mismatched.length} mismatched variant(s) found`);
      }
    } catch (e: any) {
      console.warn('[TENANT_AUDIT] mismatch check warning:', e.message);
    }
  } else {
    results.mismatched_variants = [];
  }

  // Check for null tenant_id rows in tenant tables
  const nullCheckTables = ['products', 'orders', 'credentials', 'bot_settings', 'product_variants', 'users'];
  for (const tbl of nullCheckTables) {
    if (tableMissing.includes(tbl)) continue;
    try {
      const { count, error } = await supabase!
        .from(tbl)
        .select('*', { count: 'exact', head: true })
        .is('tenant_id', null);
      if (error) continue;
      if (count && count > 0) {
        nullTenantRows.push(`${tbl}: ${count} rows with null tenant_id`);
      }
    } catch (e) {
      // skip
    }
  }
  results.null_tenant_id_rows = nullTenantRows;

  const response = {
    tenant: results.tenant,
    counts,
    missing_setup: missingSetup,
    orphan_variants: results.orphan_variants || [],
    mismatched_variants: results.mismatched_variants || [],
    null_tenant_id_rows: nullTenantRows,
    table_missing: tableMissing,
    warnings,
    errors,
    source: 'supabase' as const,
  };

  console.log('[TENANT_AUDIT] results:', JSON.stringify({
    tenant_id: tenantId,
    counts,
    missingSetup,
    orphanCount: (results.orphan_variants || []).length,
    mismatchCount: (results.mismatched_variants || []).length,
    nullTenantRows,
    tableMissing,
    warnings,
    errors,
  }));

  res.json(response);
});

// GET /api/master/tenant-audit-all
app.get('/api/master/tenant-audit-all', requireMasterAuth, async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  console.log('[TENANT_AUDIT] listing all tenants from Supabase...');

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[TENANT_AUDIT] tenant list error:', error.message);
    res.status(500).json({ error: `Supabase query failed: ${error.message}` });
    return;
  }

  const enriched = await Promise.all((tenants || []).map(async (t: any) => {
    const tid = t.id;

    async function safeCount(table: string, tenantFilter = true): Promise<number | null> {
      try {
        let q = supabase!.from(table).select('*', { count: 'exact', head: true });
        if (tenantFilter) q = q.eq('tenant_id', tid);
        const { count, error: e } = await q;
        if (e) return null;
        return count || 0;
      } catch { return null; }
    }

    const [botSettingsCount, productsCount, variantsCount, ordersCount, credentialsCount, usersCount] =
      await Promise.all([
        safeCount('bot_settings'),
        safeCount('products'),
        safeCount('product_variants'),
        safeCount('orders'),
        safeCount('credentials'),
        safeCount('users'),
      ]);

    let health: 'OK' | 'NEED_SETUP' | 'ERROR' = 'OK';
    if (productsCount === 0 || variantsCount === 0 || credentialsCount === 0) {
      health = 'NEED_SETUP';
    }
    if (botSettingsCount === null && productsCount === null) {
      health = 'ERROR';
    }

    return {
      tenant_id: tid,
      name: t.name,
      bot_username: t.bot_username,
      status: t.status,
      rent_start: t.rent_start,
      rent_end: t.rent_end,
      counts: {
        bot_settings: botSettingsCount,
        products: productsCount,
        variants: variantsCount,
        orders: ordersCount,
        credentials: credentialsCount,
        users: usersCount,
      },
      health,
    };
  }));

  res.json(enriched);
});

// POST /api/master/tenant-audit/init-default-settings/:tenantId
app.post('/api/master/tenant-audit/init-default-settings/:tenantId', requireMasterAuth, async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId;

  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  console.log('[TENANT_AUDIT] init-default-settings for tenant:', tenantId);

  // Try Supabase RPC function first
  try {
    const { error: rpcError } = await supabase.rpc('create_default_bot_settings', { p_tenant_id: tenantId });
    if (!rpcError) {
      console.log('[TENANT_AUDIT] RPC create_default_bot_settings succeeded for:', tenantId);
      res.json({ success: true, method: 'rpc', message: 'Default bot settings initialized via RPC' });
      return;
    }
    if (rpcError.message?.includes('function') && rpcError.message?.includes('not found')) {
      console.log('[TENANT_AUDIT] RPC function not found, falling back to direct insert');
    } else {
      console.error('[TENANT_AUDIT] RPC error:', rpcError.message);
      res.status(500).json({ error: `RPC failed: ${rpcError.message}` });
      return;
    }
  } catch (e: any) {
    console.log('[TENANT_AUDIT] RPC exception, falling back to direct insert:', e.message);
  }

  // Fallback: direct insert into bot_settings
  const defaultBotSettings = [
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
    { key: 'banner_url', value: '', description: 'Public URL of shop welcome banner image' },
  ];

  const rows = defaultBotSettings.map(s => ({
    tenant_id: tenantId,
    key: s.key,
    value: s.value,
    description: s.description,
  }));

  const { error: insertErr } = await supabase.from('bot_settings').insert(rows);
  if (insertErr) {
    console.error('[TENANT_AUDIT] direct insert error:', insertErr.message);
    res.status(500).json({ error: `Direct insert failed: ${insertErr.message}` });
    return;
  }

  console.log('[TENANT_AUDIT] Default bot_settings inserted directly for:', tenantId);
  res.json({ success: true, method: 'direct_insert', message: `Inserted ${rows.length} default settings` });
});

// GET /api/debug/tenant-data
app.get('/api/debug/tenant-data', requireTenantAuth, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;

  if (!supabase) {
    res.json({
      session_tenant_id: tenantId,
      source: 'local_memory',
      products_count: db.getProducts(tenantId).length,
      variants_count: db.getVariants(tenantId).length,
    });
    return;
  }

  let products: any[] = [];
  let variants: any[] = [];
  let supabaseError: string | null = null;

  try {
    const { data: p, error: pe } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (pe) {
      supabaseError = `products query error: ${pe.message}`;
      console.error('[DEBUG] products error:', pe.message);
    } else {
      products = p || [];
    }
  } catch (e: any) {
    supabaseError = `products exception: ${e.message}`;
  }

  try {
    const { data: v, error: ve } = await supabase
      .from('product_variants')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (ve) {
      supabaseError = supabaseError
        ? `${supabaseError} | variants error: ${ve.message}`
        : `variants query error: ${ve.message}`;
      console.error('[DEBUG] variants error:', ve.message);
    } else {
      variants = v || [];
    }
  } catch (e: any) {
    supabaseError = supabaseError
      ? `${supabaseError} | variants exception: ${e.message}`
      : `variants exception: ${e.message}`;
  }

  res.json({
    session_tenant_id: tenantId,
    source: 'supabase',
    products_count: products.length,
    variants_count: variants.length,
    latest_products: products.slice(0, 5),
    latest_variants: variants.slice(0, 5),
    supabase_error: supabaseError,
  });
});

// -------------------------------------------------------------------
// MASTER OWNER API (Require requireMasterAuth)
// -------------------------------------------------------------------

// Global Express error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[UNHANDLED_ERROR]', err?.message, err?.stack);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

export default app;
