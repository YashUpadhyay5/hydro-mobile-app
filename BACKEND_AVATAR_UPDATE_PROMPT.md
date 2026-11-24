# HRMS Backend Update Prompt: Permanent Profile Photo Upload & Static Serving

> **How to use this document:**  
> Copy and paste the prompt below directly to your backend developer or AI coding assistant working on the static IP server (45.122.121.237).

---

## 📋 Copy-Paste Prompt for Backend AI / Developer

`markdown
### TASK: Implement Profile Photo Upload, Removal, and Static Serving in HRMS Backend

The HRMS React Native mobile application has been updated to permanently upload employee profile photos using multipart form data (FormData), persist avatar URLs across app sessions and devices, and render avatars in chat and employee directories.

Please implement the following changes in the backend Node.js / Express repository so that the server can accept, store, and publicly serve avatar images.

---

### 1. Update outes/employee.js

#### A. Import the Upload Middleware:
At the top of outes/employee.js, ensure the upload middleware (Multer) is imported:
`javascript
const upload = require('../middleware/upload');
`

#### B. Add Avatar Upload Endpoint:
Add the following endpoint before module.exports = router;:
`javascript
// POST /api/employees/:id/avatar - Upload employee profile photo
router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No avatar image file was uploaded.' });
    }

    // Save public static URL path in database
    const avatarUrl = /static/uploads/;
    employee.avatar = avatarUrl;
    await employee.save();

    return res.status(200).json({
      success: true,
      message: 'Avatar uploaded and updated successfully.',
      avatar: avatarUrl,
      employee
    });
  } catch (error) {
    console.error('Error uploading employee avatar:', error);
    return res.status(500).json({ error: error.message });
  }
});
`

#### C. Add Avatar Removal Endpoint:
Add the following endpoint before module.exports = router;:
`javascript
// DELETE /api/employees/:id/avatar - Remove employee profile photo
router.delete('/:id/avatar', async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findByPk(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    employee.avatar = null;
    await employee.save();

    return res.status(200).json({
      success: true,
      message: 'Avatar removed successfully.',
      avatar: null,
      employee
    });
  } catch (error) {
    console.error('Error removing employee avatar:', error);
    return res.status(500).json({ error: error.message });
  }
});
`

---

### 2. Update server.js (Static File Serving & CORS)

In server.js, ensure the upload directory exists and is exposed statically via both /static/uploads and /uploads with permissive CORS headers so mobile devices can load the images:

`javascript
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, 'uploads');
const chatUploadDir = path.join(__dirname, 'uploads/chat');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });

// Static route for /static/uploads
app.use('/static/uploads', express.static(uploadDir, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}));

// Alias route for /uploads
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}));
`

---

### 3. Verify Database Column (location_employees)

Ensure the vatar column exists in the PostgreSQL location_employees table.
Run this migration query or ensure it is executed during startup:

`sql
ALTER TABLE location_employees ADD COLUMN IF NOT EXISTS avatar TEXT;
`

---

### 4. Restart Backend Service

After applying the changes, restart the backend server:

`ash
# If running with PM2:
pm2 restart all

# If running with Docker:
docker compose restart backend
# or:
docker-compose restart

# If running with Systemd:
sudo systemctl restart hrms-backend
`

---

### 5. Verification Test (cURL)

Verify the upload endpoint by running:
`ash
curl -X POST http://45.122.121.237:8000/api/employees/YOUR_EMPLOYEE_ID/avatar \
  -F  avatar=@/path/to/sample.jpg
`

Expected response:
`json
{
  success: true,
  message: Avatar uploaded successfully.,
  avatar: /static/uploads/1720000000-123456789.jpg,
  employee: { ... }
}
`

Then verify accessing the image in your browser or curl:
`ash
curl -I http://45.122.121.237:8000/static/uploads/1720000000-123456789.jpg
# Should return HTTP 200 OK
`
`