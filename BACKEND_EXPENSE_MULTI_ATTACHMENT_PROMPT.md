# HRMS Backend Prompt: Multiple Expense Invoices / Attachments & Suspicious Resubmission

> **How to use:** Paste everything inside the fenced block below into the AI coding assistant (or hand it to the backend developer) working in the **server's own repository** (e.g. `45.122.121.237`).
>
> **Do not copy this repo's `backend/` folder directly onto the server.** Treat this prompt as a precise specification for the server's own codebase.

---

````markdown
# TASK: Support Multiple File Attachments (Images & PDFs) & Suspicious Resubmission for Expenses

## Context & Goal
The mobile app now allows employees to attach **multiple photos and/or PDF invoices** to an expense claim instead of only a single file. Additionally, when an expense is marked as **suspicious** by an admin due to a mismatch, the employee can edit the claim, modify the attachment list (remove/keep existing files and attach new ones), and resend it to the pending queue.

The server must:
1. Accept multiple files on `POST /api/expenses` and `PUT /api/expenses/:id`.
2. Persist an array of invoice URLs (`invoiceUrls`) in the database while maintaining the legacy single `invoiceUrl` column for backwards compatibility.
3. Allow updating and resending an expense claim (`PUT /api/expenses/:id`) with preserved and newly uploaded attachments.
4. Support the `'suspicious'` status with an optional reason in the admin status endpoint (`PATCH /api/expenses/:id/status`).

---

## 1. Database Migrations (PostgreSQL)

Run the following additive SQL statements (or add them to the database startup sync script):

```sql
-- 1. Support multiple attachment URLs (JSON stringified array)
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "invoiceUrls" TEXT;

-- 2. Relax single invoiceUrl NOT NULL constraint (backwards-compatible)
ALTER TABLE "Expenses" ALTER COLUMN "invoiceUrl" DROP NOT NULL;

-- 3. Support suspicious mismatch reason and ensure status column can hold 'suspicious'
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "suspiciousReason" TEXT;
ALTER TABLE "Expenses" ALTER COLUMN status TYPE VARCHAR(50);

-- 4. Bill & vendor metadata columns (if not already present)
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "billNo" VARCHAR(255);
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "billDate" VARCHAR(255);
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "merchantName" VARCHAR(255);
ALTER TABLE "Expenses" ADD COLUMN IF NOT EXISTS "siteName" VARCHAR(255);
```

---

## 2. Model Updates (`models/Expense.js`)

In the Sequelize / ORM Expense model definition:

1. **`invoiceUrl`**:
   - `type: DataTypes.TEXT`, `allowNull: true`
2. **`invoiceUrls`**:
   - `type: DataTypes.TEXT`, `allowNull: true`
   - **Getter**: If `invoiceUrls` is set, parse and return it as a JavaScript array `string[]`. If `invoiceUrls` is null/empty but `invoiceUrl` exists, fallback to `[this.invoiceUrl]`. Otherwise return `[]`.
   - **Setter**: If an array is passed, stringify to JSON (`JSON.stringify(val)`). If a string is passed, store as is. If null/undefined, store `null`.
3. **`status`**:
   - `type: DataTypes.STRING(50)`, default `'pending'`. Allows values: `'pending'`, `'approved'`, `'rejected'`, `'suspicious'`.
4. **`suspiciousReason`**:
   - `type: DataTypes.TEXT`, `allowNull: true`.

---

## 3. Route Configuration (`routes/expense.js`)

Update Multer handling so that multiple files uploaded under `files` or `file` are captured:

```javascript
const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense');
const upload = require('../middleware/upload');

// Fetch all expenses
router.get('/', expenseController.getAllExpenses);

// Admin update expense status (pending, approved, rejected, suspicious)
router.patch('/:id/status', expenseController.updateExpenseStatus);

// Employee edit and resend claim (supports multipart multiple files)
router.put('/:id', (req, res, next) => {
  upload.invoice.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, expenseController.updateExpenseClaim);

// Employee create new expense claim (supports multipart multiple files)
router.post('/', (req, res, next) => {
  upload.invoice.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, expenseController.createExpenseClaim);

module.exports = router;
```

*(Note: `upload.invoice.any()` automatically accepts any combination of file fields, such as `files` or `file`, while enforcing the 10 MB limit and image/PDF MIME type filters).*

---

## 4. Controller Updates (`controllers/expense.js`)

### A. File Upload Resolver Helper
Make sure file uploads handle all files in the batch (uploading each to Cloudinary or resolving to the static public URL):

```javascript
async function resolveUploadedFileUrl(file, req) {
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto');
  const host = forwardedHost || req.get('host');
  const protocol = forwardedProto || req.protocol;
  const serverBaseUrl = `${protocol}://${host}`;
  let fileUrl = `${serverBaseUrl}/static/uploads/${file.filename}`;

  const cloudinary = require('../config/cloudinary');
  const apiSecret = cloudinary?.config()?.api_secret;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'ml_default';

  if (apiSecret) {
    try {
      const result = await cloudinary.uploader.upload(file.path, { folder: 'expenses' });
      fileUrl = result.secure_url;
    } catch (err) {
      console.error('Cloudinary signed upload error:', err.message);
    }
  } else if (uploadPreset) {
    try {
      const result = await cloudinary.uploader.unsigned_upload(file.path, uploadPreset, { folder: 'expenses' });
      fileUrl = result.secure_url;
    } catch (err) {
      console.error('Cloudinary unsigned upload error:', err.message);
    }
  }
  return fileUrl;
}
```

### B. `createExpenseClaim` (`POST /api/expenses`)
1. Extract uploaded files from `req.files` (or `[req.file]` if sent as single):
   ```javascript
   const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
   if (uploadedFiles.length === 0) {
     return res.status(400).json({ error: 'Missing required multipart invoice file attachment.' });
   }
   ```
2. Upload each file asynchronously and build the URL list:
   ```javascript
   const invoiceUrls = [];
   for (const file of uploadedFiles) {
     const url = await resolveUploadedFileUrl(file, req);
     invoiceUrls.push(url);
   }
   ```
3. Save the new expense record with:
   - `invoiceUrls: invoiceUrls` (array)
   - `invoiceUrl: invoiceUrls[0]` (first file, backwards compatibility)
   - `status: 'pending'`
   - `suspiciousReason: null`
4. Return HTTP `201` with the created expense and `{ invoiceUrls }`.

### C. `updateExpenseClaim` (`PUT /api/expenses/:id`)
When an employee edits and resubmits a claim:
1. Find expense by primary key. Return `404` if not found.
2. Update editable fields (`category`, `amount`, `billNo`, `billDate`, `merchantName`, `siteName`, `description`).
3. Handle attachments:
   - Parse retained existing attachments from `req.body.existingInvoiceUrls` or `req.body.existingInvoiceUrl` (can be JSON array string `["https://..."]` or array).
   - Process any newly uploaded files in `req.files` via `resolveUploadedFileUrl`.
   - Combine: `const finalInvoiceUrls = [...preservedUrls, ...newlyUploadedUrls];`
   - If `finalInvoiceUrls.length > 0`, update `expense.invoiceUrls = finalInvoiceUrls` and `expense.invoiceUrl = finalInvoiceUrls[0]`.
4. Reset state on resubmission:
   - `expense.status = 'pending';`
   - `expense.suspiciousReason = null;`
5. Save and return HTTP `200` with `{ message: 'Expense updated and resent successfully!', expense }`.

### D. `updateExpenseStatus` (`PATCH /api/expenses/:id/status`)
1. Support `'suspicious'` in addition to `'approved'` and `'rejected'`.
2. Accept `req.body.reason` or `req.body.suspiciousReason`.
3. If `status === 'suspicious'`, store `expense.suspiciousReason = reason || 'Admin marked as suspicious'`.
4. If `status === 'approved'` or `'pending'`, clear `expense.suspiciousReason = null`.
5. Save and return HTTP `200`.

---

## 5. Verification Checklist

1. **Multiple Upload Test**:
   - `POST /api/expenses` with 2 images and 1 PDF in multipart form (`files`).
   - Expected: HTTP 201; record contains `invoiceUrls` array with 3 URLs, and `invoiceUrl` matches index 0.
2. **Flag Suspicious Test**:
   - `PATCH /api/expenses/:id/status` with `{ "status": "suspicious", "reason": "Invoice number does not match receipt" }`.
   - Expected: HTTP 200; `status = 'suspicious'`, `suspiciousReason` populated.
3. **Resubmit Claim Test**:
   - `PUT /api/expenses/:id` with updated bill details, `existingInvoiceUrls` with 2 URLs, and 1 new file attached.
   - Expected: HTTP 200; `status` reverts to `'pending'`, `suspiciousReason` becomes `null`, and `invoiceUrls` has 3 items.
4. **Legacy Compatibility Test**:
   - `GET /api/expenses` returns both `invoiceUrl` and `invoiceUrls` for older records without errors.
````
