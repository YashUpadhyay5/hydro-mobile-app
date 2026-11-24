# Running the app against a real backend

The app contains no mock data and no built-in server address. Every screen loads from the backend you configure, and if
that backend can't be reached the app shows an error instead of made-up content.

## 1. Configure the backend address

```powershell
Copy-Item .env.example .env.local
```

Set `EXPO_PUBLIC_API_URL` in `.env.local`, for example `http://<your-computer-lan-ip>:8000/api` (`/api` is added if you
leave it off). A phone or emulator cannot reach `localhost` on your computer, so use the computer's LAN IP
(`ipconfig` → IPv4 address) or a hosted / tunnel URL.

- `.env.local` is git-ignored; `.env.example` is the committed template.
- `EXPO_PUBLIC_*` values are inlined into the JS bundle and readable in the built app. Never put secrets in them.
- Optional: `EXPO_PUBLIC_SUPPORT_EMAIL` and `EXPO_PUBLIC_SUPPORT_PHONE` enable the Email HR / Call HR buttons on the Help
  & Support screen. Leave them empty to hide those buttons.

## 2. Start the backend, then the app

```powershell
cd backend; npm start          # http://<host>:8000/api, needs DATABASE_URL (see below)
npx expo start --clear         # --clear makes Metro pick up .env changes
```

Check the app can see the backend before opening it:

```powershell
curl http://<your-computer-lan-ip>:8000/api/geofence
```

The app logs `--- ACTIVE NETWORK API ENDPOINT: ---` with the address it resolved at startup. If `EXPO_PUBLIC_API_URL` is
missing it logs an error and every request fails with "No backend is configured" instead of going to a guessed host.

## 3. Open it

The app has custom native modules (background location tracking), so **Expo Go can't run it**. Use a development build:

```powershell
npm run android                # = expo run:android
```

Developer Diagnostics (in-app) can point a running build at a different backend temporarily; "Reset to Build Config"
returns it to `EXPO_PUBLIC_API_URL`.

## EAS builds

Git-ignored `.env` files are not uploaded with a build. Define `EXPO_PUBLIC_API_URL` as an EAS environment variable
(`eas env:create`) for each build profile.
