# Berry Store Rental Dashboard

A high-performance full-stack administration and monitoring dashboard for managing rented Telegram bot gateways, client products, credentials, secure configurations, and analytics.

## Getting Started

### Local Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Create a local `.env` file containing variables specified in `.env.example`.

3. **Start Development Server:**
   ```bash
   npm run dev
   ```

4. **Build for Production:**
   ```bash
   npm run build
   ```

5. **Start Production Compilation:**
   ```bash
   npm run start
   ```

---

## Deploy to Northflank

This project is configured to deploy seamlessly as a single full-stack service on Northflank.

### Specifications and Configuration

* **Build Command:**
  `npm run build` (This runs `vite build` for client assets followed by bundling `server.ts` into a fast, portable CommonJS bundle `dist/server.cjs` using `esbuild`).
  
* **Start Command:**
  `npm run start` (This launches the unified full-stack server using `node dist/server.cjs`, listening on the injected dynamic port).

* **Required Environment Variables:**
  Assign these in your Northflank service dashboard:
  - `SUPABASE_URL`: Your Supabase database endpoint URL.
  - `SUPABASE_ANON_KEY`: Your Supabase public anonymous key.
  - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase secure service role key (kept exclusively on the server side and never sent to the browser).
  - `MASTER_ADMIN_SECRET`: Secret key for authenticating master owner permissions.
  - `SESSION_SECRET`: Random key for encrypting cookie-based user sessions.

* **Public Port Setup:**
  Northflank routes external web traffic dynamically. The unified full-stack server does not hardcode port `3000`. It dynamically reads and listens on the system-provided port:
  - Public Port Option: Map external traffic to container port `PORT` (or whichever port Northflank binds).

* **Health Check Endpoint:**
  Configure Northflank's container probe using the following HTTP health check:
  - **Path:** `/api/health`
  - **Method:** `GET`
  - **Expected Response:**
    ```json
    { "ok": true, "service": "berry-rental-dashboard" }
    ```

## Supabase Storage Setup

To support full image uploading of payment QRs and shop welcome banners, prepare your Supabase storage with the steps below:

1. **Create bucket named `tenant-assets`:**
   - Log into your Supabase Dashboard and go to the **Storage** section.
   - Click **New Bucket** and name it exactly `tenant-assets`.

2. **Configure public visibility:**
   - Choose **Public bucket** if using standard public image URLs. This allows the frontend to show direct public image URL links in the client app.
   - If a private bucket is preferred, configure signed token URL responses in the backend.

3. **Storage folder path structure:**
   All uploads are saved securely under individual subfolders for each unique tenant to prevent secure asset cross-contamination:
   - **Payment QR Path:** `{tenant_id}/payment-qr-{timestamp}.{ext}`
   - **Shop Banner Path:** `{tenant_id}/banner-{timestamp}.{ext}`
