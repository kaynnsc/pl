# Price List App

A live-syncing pricelist site: admin edits (from anywhere) show up instantly for every visitor. Includes dark mode, search, category filters, list/grid views, and import/export via Excel or Google Sheets.

## 1. Set up Firebase (free)

1. Go to https://console.firebase.google.com → **Add project** (name it anything, disable Google Analytics if you don't need it).
2. In the project, click **Build → Firestore Database → Create database**. Choose a region close to you, start in **test mode** for now.
3. Click **Build → Firestore Database → Rules** and paste this, then Publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /pricelist/main {
         allow read: if true;
         allow write: if true;
       }
     }
   }
   ```
   This lets anyone read and write the single price-list document. It's fine to start — the app's own password screen keeps casual visitors from finding the edit controls — but it is **not real security**: anyone who opens dev tools could write to Firestore directly. If this ever needs to be locked down properly, add Firebase Authentication and require `request.auth != null` in the rule above.
4. Click the gear icon → **Project settings** → scroll to "Your apps" → click the `</>` (web) icon → register the app (no need for Firebase Hosting here) → copy the `firebaseConfig` values.

## 2. Configure the project

```bash
cp .env.example .env
```

Paste your Firebase values into `.env`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Run it locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. Tap the lock icon in the bottom nav to log in as admin (default password `admin123` — change it from the admin panel once you're in).

## 4. Deploy for free (Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. Go to https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add the same six `VITE_FIREBASE_*` variables under **Settings → Environment variables** (both Production and Preview).
5. Deploy. You'll get a free `your-project.pages.dev` URL — edits made there sync live to everyone via Firestore, from any device.

(Netlify works the same way — same build command/output, same env vars.)

## Notes

- **Live sync**: powered by Firestore's `onSnapshot` listener — no polling, updates arrive in real time.
- **Import**: `.xlsx`/`.csv` upload, a public Google Sheet CSV link (File → Share → Publish to web), or pasting cells copied from Sheets/Excel.
- **Export**: downloads the current list as a real `.xlsx` file.
- **Dark mode**: toggled from the header, remembered per-browser via `localStorage`.
- **Admin password**: stored in the same Firestore document, changeable from the admin panel. It's a convenience lock, not authentication — see the security note above if this ever needs to be tighter.
