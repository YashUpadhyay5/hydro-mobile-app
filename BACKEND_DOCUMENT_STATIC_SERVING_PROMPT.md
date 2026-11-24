# HRMS Backend Update Prompt: Static Document Serving

> **How to use this document:**  
> Copy and paste the prompt below directly to your backend developer or AI coding assistant working on the self-hosted server (`45.122.121.237`).

---

## 📋 Copy-Paste Prompt for Backend AI / Developer

```markdown
### TASK: Enable Static Document Serving for Uploaded Employee Documents in HRMS Backend

In the HRMS system on static IP server `45.122.121.237`, when employees upload documents (e.g. Aadhar card, PAN card, certificates), the backend receives the file via `/api/documents` (or `/api/hrms-documents`) and saves it on disk as:
`documents/documents-<timestamp>-<rand>.<ext>`
and stores this relative path in PostgreSQL `Document.filePath`.

However, the backend server currently only serves `/storage` and `/static/uploads` statically. There is no static mount for `/documents/`, causing any request to `http://45.122.121.237:8000/documents/...` to fail with `HTTP 404 Not Found ({"detail":"Not Found"})`.

Please apply the following changes in the backend repository to serve the documents directory statically.

---

### 1. Update `server.js` (Add Static Serving for `/documents`)

In `server.js`, find where static routes (`/storage`, `/uploads`, or `/static/uploads`) are configured, and add the static route for `/documents`:

```javascript
const path = require('path');
const fs = require('fs');

// Ensure the local documents storage directory exists
const documentsDir = path.join(__dirname, 'documents');
const uploadsDocumentsDir = path.join(__dirname, 'uploads', 'documents');

if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });
if (!fs.existsSync(uploadsDocumentsDir)) fs.mkdirSync(uploadsDocumentsDir, { recursive: true });

// Expose /documents statically with permissive CORS headers
app.use('/documents', express.static(documentsDir, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}));

// Fallback alias: also serve uploads/documents if files were placed there
app.use('/documents', express.static(uploadsDocumentsDir, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}));
```

---

### 2. Check NGINX / Reverse Proxy (If Applicable)

If you are running NGINX in front of the Node.js backend on `45.122.121.237`, ensure that the `/documents` path is forwarded to the Node.js Express server:

```nginx
# In /etc/nginx/sites-available/hrms (or your active nginx config)
location /documents/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

If NGINX was forwarding `/documents` to another upstream (like a Uvicorn/FastAPI port), changing it to point to Node.js Express will allow the static files to be delivered directly.

---

### 3. Restart the Backend Service

After making the change, restart the server process:

```bash
# If running with PM2:
pm2 restart all

# If running with Systemd:
sudo systemctl restart hrms-backend

# If running with Docker:
docker compose restart backend
# or:
docker-compose restart
```

---

### 4. Verification Test

Run this cURL test from the terminal to verify that the file is served with HTTP 200:

```bash
curl -I http://45.122.121.237:8000/documents/documents-1789034975008-304561089.jpg
```

**Expected Result:**
```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
Access-Control-Allow-Origin: *
```
```
