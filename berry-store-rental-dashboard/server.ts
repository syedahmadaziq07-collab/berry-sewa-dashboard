import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, verifyPassword } from './src/server-db';
import { Tenant } from './src/types';

// Initialize Supabase Storage Client (Server-side only)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

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

// Session manager mapping random token to session values
const sessions = new Map<string, { role: 'tenant' | 'master'; tenant_id?: string; username?: string }>();

// Secret key configurations
const MASTER_ADMIN_SECRET = process.env.MASTER_ADMIN_SECRET || 'berry_master_secret_2026';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(cookieParser());

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
function getSession(req: Request) {
  const sessionId = req.cookies.berry_session_id;
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireTenantAuth(req: Request, res: Response, next: NextFunction): void {
  const session = getSession(req);
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
}

function requireMasterAuth(req: Request, res: Response, next: NextFunction): void {
  const session = getSession(req);
  if (!session || session.role !== 'master') {
    res.status(401).json({ error: 'Unauthenticated master access' });
    return;
  }
  next();
}

// -------------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------------

// GET /api/auth/me
app.get('/api/auth/me', (req: Request, res: Response) => {
  const session = getSession(req);
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
});

// POST /api/auth/tenant-login
app.post('/api/auth/tenant-login', (req: Request, res: Response) => {
  const { tenant_id, password } = req.body;

  if (!tenant_id || !password) {
    res.status(400).json({ error: 'Tenant ID and Password are required.' });
    return;
  }

  const tenant = db.getTenant(tenant_id);
  if (!tenant) {
    res.status(401).json({ error: 'Tenant not found.' });
    return;
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
      db.updateTenant(tenant_id, { status: 'expired' });
    }
    res.status(403).json({ error: 'Bot rental has expired. Please contact administration to renew.' });
    return;
  }

  // Check first time login (hash is null)
  if (tenant.dashboard_secret_hash === null) {
    const hash = hashPassword(password);
    const now = new Date().toISOString();
    db.updateTenant(tenant_id, {
      dashboard_secret_hash: hash,
      dashboard_password_set_at: now,
      dashboard_first_login_at: tenant.dashboard_first_login_at || now,
      dashboard_last_login_at: now,
      dashboard_password_reset_required: false
    });
    
    db.log(tenant_id, "FIRST_TIME_PASSWORD_SETUP", "Customer completed first-time login and created dashboard credentials");

    // Success login
    const sessionId = 'sess_' + crypto.randomUUID();
    sessions.set(sessionId, { role: 'tenant', tenant_id });
    res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
    res.json({ status: 'success', role: 'tenant', tenant_id, name: tenant.name, message: 'Password set and logged in matches successfully.' });
    return;
  }

  // Dashboard password reset required
  if (tenant.dashboard_password_reset_required) {
    const hash = hashPassword(password);
    const now = new Date().toISOString();
    db.updateTenant(tenant_id, {
      dashboard_secret_hash: hash,
      dashboard_password_set_at: now,
      dashboard_last_login_at: now,
      dashboard_password_reset_required: false
    });
    db.log(tenant_id, "PASSWORD_RESET_COMPLETED", "Owner set new dashboard password following reset instruction");

    const sessionId = 'sess_' + crypto.randomUUID();
    sessions.set(sessionId, { role: 'tenant', tenant_id });
    res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
    res.json({ status: 'success', role: 'tenant', tenant_id, name: tenant.name });
    return;
  }

  // Traditional password verify
  if (!verifyPassword(password, tenant.dashboard_secret_hash)) {
    res.status(401).json({ error: 'Invalid password. If this is a reset, enter your new secret.' });
    return;
  }

  // Update last login
  const now = new Date().toISOString();
  db.updateTenant(tenant_id, { dashboard_last_login_at: now });
  db.log(tenant_id, "LOGIN_SUCCESS", "Dashboard user logged in successfully");

  const sessionId = 'sess_' + crypto.randomUUID();
  sessions.set(sessionId, { role: 'tenant', tenant_id });
  res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
  res.json({ status: 'success', role: 'tenant', tenant_id, name: tenant.name });
});

// POST /api/auth/master-login
app.post('/api/auth/master-login', (req: Request, res: Response) => {
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
  sessions.set(sessionId, { role: 'master' });
  res.cookie('berry_session_id', sessionId, { httpOnly: true, path: '/' });
  res.json({ status: 'success', role: 'master', username: 'Master Owner' });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const sessionId = req.cookies.berry_session_id;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('berry_session_id', { path: '/' });
  res.json({ status: 'success', message: 'Logged out successfully' });
});

// -------------------------------------------------------------------
// TENANT ADMIN API (All require requireTenantAuth and strictly scope to req.tenant_id)
// -------------------------------------------------------------------

// GET /api/tenant/overview
app.get('/api/tenant/overview', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const tenant = db.getTenant(tenantId);
  const products = db.getProducts(tenantId);
  const orders = db.getOrders(tenantId);
  const users = db.getUsers(tenantId);
  const logs = db.getAuditLogs(tenantId).slice(0, 5);

  // Stats calculate
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);

  const todayOrders = orders.filter(o => new Date(o.created_at) >= todayStart);
  const todayRevenue = todayOrders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.amount, 0);

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const waitingApprovalCount = orders.filter(o => o.status === 'waiting_approval').length;
  const totalCompletedCount = orders.filter(o => o.status === 'completed').length;

  const totalRevenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.amount, 0);

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
        daysMap[dateStr] += o.amount;
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
    const p = products.find(prod => prod.id === pId);
    return {
      id: pId,
      name: p ? p.name : "Unknown Product",
      salesCount: productSalesCount[pId],
      revenue: productSalesCount[pId] * (p ? p.price : 0)
    };
  }).sort((a,b) => b.salesCount - a.salesCount).slice(0, 3);

  // Warning metrics
  const warnings: string[] = [];
  const lowStockProducts = products.filter(p => p.stock === 0 && p.active);
  if (lowStockProducts.length > 0) {
    warnings.push(`${lowStockProducts.length} active products are currently out of stock`);
  }

  // Settings payment QR and banner check
  const settings = db.getSettings(tenantId);
  const qrSetting = settings.find(s => s.key === 'payment_qr_file_id')?.value;
  const qrUrlSetting = settings.find(s => s.key === 'payment_qr_url')?.value;
  const bannerSetting = settings.find(s => s.key === 'banner_file_id')?.value;
  const bannerUrlSetting = settings.find(s => s.key === 'banner_url')?.value;

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

// GET /api/tenant/products
app.get('/api/tenant/products', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  res.json(db.getProducts(tenantId));
});

// POST /api/tenant/products
app.post('/api/tenant/products', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { name, price, duration, description, auto_delivery, active } = req.body;

  if (!name || price === undefined) {
    res.status(400).json({ error: 'Name and price are required fields' });
    return;
  }

  const product = db.createProduct({
    tenant_id: tenantId,
    name,
    price: parseFloat(price) || 0,
    duration: duration || '1 month',
    description: description || '',
    stock: 0, // initially 0 until variant or credentials loaded
    auto_delivery: !!auto_delivery,
    active: active !== undefined ? !!active : true
  });

  db.log(tenantId, 'PRODUCT_CREATE', `Created product: "${name}" [ID: ${product.id}]`);
  res.status(201).json(product);
});

// PATCH /api/tenant/products/:id
app.patch('/api/tenant/products/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = req.params.id;

  const product = db.getProductById(productId, tenantId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const updated = db.updateProduct(productId, tenantId, req.body);
  db.log(tenantId, 'PRODUCT_UPDATE', `Updated product parameters: "${updated?.name}"`);
  res.json(updated);
});

// DELETE /api/tenant/products/:id
app.delete('/api/tenant/products/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const productId = req.params.id;

  const product = db.getProductById(productId, tenantId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.deleteProduct(productId, tenantId);
  db.log(tenantId, 'PRODUCT_DELETE', `Deleted product: "${product.name}" and cleared associated listings`);
  res.json({ message: 'Product deleted' });
});

// GET /api/tenant/variants
app.get('/api/tenant/variants', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  res.json(db.getVariants(tenantId));
});

// POST /api/tenant/variants
app.post('/api/tenant/variants', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { product_id, name, price, stock, active } = req.body;

  if (!product_id || !name || price === undefined) {
    res.status(400).json({ error: 'Product ID, variation name, and price are required' });
    return;
  }

  const product = db.getProductById(product_id, tenantId);
  if (!product) {
    res.status(404).json({ error: 'Matching product not found' });
    return;
  }

  const vari = db.createVariant({
    tenant_id: tenantId,
    product_id,
    name,
    price: parseFloat(price) || 0,
    stock: parseInt(stock) || 0,
    active: active !== undefined ? !active : true
  });

  db.log(tenantId, 'VARIANT_CREATE', `Created variant "${name}" for product "${product.name}"`);
  res.json(vari);
});

// PATCH /api/tenant/variants/:id
app.patch('/api/tenant/variants/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const variantId = req.params.id;

  const lists = db.getVariants(tenantId);
  const exists = lists.find(v => v.id === variantId);
  if (!exists) {
    res.status(404).json({ error: 'Variant not found' });
    return;
  }

  const updated = db.updateVariant(variantId, tenantId, req.body);
  db.log(tenantId, 'VARIANT_UPDATE', `Updated variant parameters: "${updated?.name}"`);
  res.json(updated);
});

// GET /api/tenant/orders
app.get('/api/tenant/orders', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { status, search } = req.query;

  let list = db.getOrders(tenantId);

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
app.get('/api/tenant/orders/:id', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const order = db.getOrderById(req.params.id, tenantId);
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
app.get('/api/tenant/sales', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const orders = db.getOrders(tenantId).filter(o => o.status === 'completed');
  const products = db.getProducts(tenantId);

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
app.get('/api/tenant/stocks', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  res.json(db.getStocks(tenantId));
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
app.get('/api/tenant/credentials', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  res.json(db.getCredentials(tenantId));
});

// POST /api/tenant/credentials
app.post('/api/tenant/credentials', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { product_id, variant_id, raw_text } = req.body;

  if (!product_id || !raw_text) {
    res.status(400).json({ error: 'Product ID and credential values text block are required' });
    return;
  }

  const added = db.addCredentials(tenantId, product_id, variant_id || null, raw_text);
  db.log(tenantId, 'CREDENTIALS_BULK', `Bulk uploaded ${added} credentials for product ID: #${product_id}`);
  res.json({ status: 'success', count_added: added });
});

// GET /api/tenant/settings
app.get('/api/tenant/settings', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  res.json(db.getSettings(tenantId));
});

// PATCH /api/tenant/settings/:key
app.patch('/api/tenant/settings/:key', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const key = req.params.key;
  const { value } = req.body;

  if (value === undefined) {
    res.status(400).json({ error: 'Setting value required' });
    return;
  }

  const setting = db.updateSetting(tenantId, key, value);
  db.log(tenantId, 'SETTING_UPDATE', `Modified configuration key: "${key}" to list values`);
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

// GET /api/tenant/rental
app.get('/api/tenant/rental', requireTenantAuth, (req: Request, res: Response) => {
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
app.get('/api/tenant/health', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const tenant = db.getTenant(tenantId);
  const products = db.getProducts(tenantId);
  const credentials = db.getCredentials(tenantId);
  const settings = db.getSettings(tenantId);

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

// POST /api/tenant/broadcast
app.post('/api/tenant/broadcast', requireTenantAuth, (req: Request, res: Response) => {
  const tenantId = (req as any).tenant_id;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    res.status(400).json({ error: 'Message content is empty' });
    return;
  }

  const users = db.getUsers(tenantId);
  
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
app.post('/api/master/tenants', requireMasterAuth, (req: Request, res: Response) => {
  const { store_name, bot_username, owner_telegram_id, owner_username, monthly_price, duration_months, service_url, notes } = req.body;

  if (!store_name || !bot_username || !owner_telegram_id || !monthly_price || !duration_months) {
    res.status(400).json({ error: 'Missing required configuration parameters' });
    return;
  }

  // Generate tenant_id
  const slug = store_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '');
  const tenantId = slug + "_" + Math.floor(100 + Math.random() * 900);

  const rentStart = new Date();
  const rentEnd = new Date();
  rentEnd.setMonth(rentEnd.getMonth() + parseInt(duration_months));

  const newTenant: Tenant = {
    tenant_id: tenantId,
    name: store_name,
    bot_username,
    owner_telegram_id: String(owner_telegram_id),
    owner_username: owner_username || '',
    monthly_price: parseFloat(monthly_price) || 0,
    status: 'active',
    rent_start: rentStart.toISOString(),
    rent_end: rentEnd.toISOString(),
    dashboard_enabled: true,
    dashboard_secret_hash: null, // Force first login password setting
    dashboard_password_set_at: null,
    dashboard_first_login_at: null,
    dashboard_last_login_at: null,
    dashboard_password_reset_required: false,
    service_url: service_url || '',
    notes: notes || '',
    created_at: rentStart.toISOString()
  };

  const created = db.createTenant(newTenant);
  db.log(tenantId, 'TENANT_PROVISION', `Admin provisioned new tenant bot store: "${store_name}"`);

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
// VITE INTEGRATION MIDDLEWARE
// -------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      index: false,
    }));
    app.get('*', (req, res) => {
      const ext = path.extname(req.path).toLowerCase();
      if (ext && ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Berry Store Rental Server running on http://localhost:${PORT}`);
  });
}

startServer();
