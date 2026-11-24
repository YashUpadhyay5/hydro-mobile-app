# HRMS Backend Document Serving Diagnostic & Fix Guide

## 1. Why The Error Still Appears (Live Diagnostic Proof)

Even though you added \pp.use('/documents', express.static(...))\ in your Node.js \server.js\, user Z25's Aadhar card still shows \{detail:Not Found}\. Here is the exact technical reason discovered through live server probing:

### The Port 8000 Reverse Proxy Hijack
On \http://45.122.121.237:8000\, there is a reverse proxy (NGINX / ASGI gateway) routing traffic:
- **Routes like \/api/hrms-documents\ and \/storage/*\** (e.g. payslips) are sent to **Node.js Express** (\x-powered-by: Express\). These return **HTTP 200 OK**.
- **Any route matching \/documents/*\** is intercepted by the reverse proxy and forwarded to **Uvicorn (Python FastAPI)**!
- Probing \http://45.122.121.237:8000/documents/test\ returns:
  \\\http
  HTTP/1.1 404 Not Found
  server: uvicorn
  content-type: application/json

  {detail:Not Found}
  \\\
  Notice \server: uvicorn\ and \{detail:Not Found}\!
- **Conclusion:** Your Node.js Express server **never receives requests starting with \/documents/\**. The reverse proxy diverts them directly to Uvicorn before Express can touch them.

---

## 2. User Z25 Aadhar Card File Diagnostic

In the PostgreSQL database on \45.122.121.237\:
- **Document ID:** \54daea49-4b40-4b3e-94df-f21c2acf0634\
- **Title:** \Aadhar card\
- **Uploader:** \Z25\ (\HMPL113\)
- **File Name:** \documents-1789034975008-304561089.jpg\
- **Recorded Size:** \179,314 bytes (~179 KB)\
- **Upload Timestamp:** \2026-09-10T10:09:35.065Z\

Because 179 KB was received during upload, Multer wrote the file to the \documents/\ directory on disk.

### Step to Verify if the File Still Exists on Server Disk:
Run this on your server terminal:
\\\ash
find / -name documents-1789034975008-304561089.jpg 2>/dev/null
\\\
or inside your backend directory:
\\\ash
ls -la documents/
\\\

> **Note on Docker:** If you are running via Docker and the container was restarted without a volume mount for \./documents:/app/documents\ (in \docker-compose.yml\, only \./uploads:/app/uploads\ was mounted), files stored in an unmounted container folder are lost on container recreation. If running via PM2 or node directly, the file is safely in the \documents/\ folder.

---

## 3. The 2 Solutions to Fix This Permanently

### Solution 1 (Recommended): Add Direct File Endpoint in Express (Bypasses NGINX Collision Completely)
Because \/api/hrms-documents\ is ALREADY 100% routed to Express and never intercepted by Uvicorn, adding a dedicated file-serving route ensures documents are always served directly by Express:

In **\ackend/routes/document.js\**, add this route before \outer.get('/')\:
\\\javascript
// GET /api/hrms-documents/file/:filename - Direct file serving
router.get('/file/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const searchDirs = [
      path.join(__dirname, '..', 'documents'),
      path.join(__dirname, '..', 'uploads'),
      path.join(__dirname, '..', 'uploads', 'documents'),
      path.join(__dirname, '..', 'storage'),
      path.join(__dirname, '..', 'storage', 'documents'),
      path.join(process.cwd(), 'documents'),
      path.join(process.cwd(), 'uploads')
    ];

    for (const dir of searchDirs) {
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        return res.sendFile(path.resolve(fullPath));
      }
    }

    return res.status(404).json({ error: 'Document file not found on disk', filename });
  } catch (err) {
    console.error('Error serving document file:', err);
    return res.status(500).json({ error: err.message });
  }
});
\\\

And in **\ackend/server.js\**, ensure both routes are mounted:
\\\javascript
app.use('/api/documents', documentRoutes);
app.use('/api/hrms-documents', documentRoutes);
\\\

Restart your backend (\pm2 restart all\ or \docker compose restart\).

---

### Solution 2: Fix NGINX Reverse Proxy on \45.122.121.237\
If you want URLs like \http://45.122.121.237:8000/documents/...\ to work directly:

1. Open your NGINX site config (e.g. \/etc/nginx/sites-available/default\ or \/etc/nginx/conf.d/\):
   \\\ash
   sudo nano /etc/nginx/sites-available/default
   \\\
2. Find the block matching \location /documents/\ or \location ~ documents\. Currently, it points to Uvicorn (port 8001 or python).
3. Change it to proxy to your Express port, OR serve static files directly:
   \\\
ginx
   # Option A: Direct Static Alias
   location /documents/ {
       alias /path/to/your/backend/documents/;
       autoindex off;
       add_header Access-Control-Allow-Origin *;
       add_header Access-Control-Allow-Methods GET, OPTIONS;
   }

   # Option B: Forward to Node.js Express Port (e.g. 5000 or 8000)
   location /documents/ {
       proxy_pass http://127.0.0.1:5000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   \\\
4. Test and reload NGINX:
   \\\ash
   sudo nginx -t && sudo systemctl reload nginx
   \\\
