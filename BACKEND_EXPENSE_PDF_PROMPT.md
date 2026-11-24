# Server change: accept PDF invoices on expenses

The app now lets an employee attach a **PDF** (up to 10 MB) instead of a photo when submitting an expense.
It posts the same multipart form to `POST /api/expenses` as before; only the `file` part may now have
`Content-Type: application/pdf`.

Paste into the assistant working in the server's own repository (do not copy this repo's `backend/` over it):

> In the expense create route (`POST /api/expenses`), the multer `fileFilter` currently rejects everything that is not
> `image/*` (error "Only image and video assets..."). Allow `application/pdf` as well, keep the 10 MB limit, and keep
> rejecting every other type with HTTP 400 and a JSON `{ "error": "..." }`. Do not loosen the filter used by other
> routes (geotag/media). Store the file exactly like images (same folder, same `invoiceUrl` field). If invoices are
> uploaded to Cloudinary, a PDF uploads fine with the default `resource_type: "image"` and the returned `secure_url`
> ends in `.pdf`; keep it that way, because the app detects a PDF by that extension. Make sure the stored URL is
> served with `Content-Type: application/pdf`. Reference: `backend/middleware/upload.js` (`upload.invoice`) and
> `backend/routes/expense.js` in the app repo.
> Test: POST a small PDF and a PNG (both 201 and listed by `GET /api/expenses` with an `invoiceUrl`), and a `.txt`
> file (400).
