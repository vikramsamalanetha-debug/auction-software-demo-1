# HammerList Auction Workspace

HammerList is an installable mobile/web auction cataloging demo. Auctioneers can sign in, create or select auctions, photograph lots, generate editable listing suggestions, store multiple photos per item, and decode vehicle VINs.

## Demo sign-in

- Email: `auctioneer@hammerlist.app`
- Password: `demo123`

This repository uses a clearly scoped demo login for customer demonstrations. It is not production authentication. Auction and image data are stored in the browser's IndexedDB on that device.

## Features

- Create estate sale, farm, vehicle, and mixed auctions
- Switch between multiple auctions
- Automatic lot numbering and catalog status
- Take photos or select up to eight phone-library photos per item
- HammerList-branded AI scan and second opinion; provider names are never shown in the UI
- Editable title, category, condition, description, confidence, and starting bid
- Vehicle year, make, model, trim, body, engine, drive type, and mileage
- Read a VIN from a clear photo or enter it manually
- Free vehicle decoding through the official [NHTSA vPIC API](https://vpic.nhtsa.dot.gov/api/)
- Installable PWA for iPhone and Android
- Responsive desktop dashboard for QA and customer demonstrations

## Run locally

```bash
npm run build
npm run qa
npx wrangler dev dist/server/index.js
```

Add these server-side environment values in the deployment platform:

```text
GEMINI_API_KEY=required for HammerList AI Scan and VIN-photo reading
OPENAI_API_KEY=optional for the second-opinion engine
```

Never put API keys in `src/index.html`, `src/app.js`, GitHub Actions source, or any browser JavaScript.

## Deploy from GitHub

The repository includes `.github/workflows/deploy.yml`. Create a GitHub repository, upload this project, and add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY` (optional)

Push to `main` to build and deploy the Worker. GitHub Pages by itself is not suitable for the complete AI version because Pages is static and would expose private AI keys. GitHub can safely host the source while the workflow deploys the secure server-side application.

## QA checklist

1. Sign in with the demo account.
2. Create one auction of each type and switch between them.
3. Add an item using the camera.
4. Add another item using several library photos.
5. Confirm HammerList AI fills editable fields without exposing provider names.
6. Retry after an AI error and confirm the selected photos remain.
7. For a vehicle, enter a valid 17-character VIN and verify decoded fields.
8. Photograph a clear VIN plate and test **Read VIN from photo**.
9. Close and reopen the browser; confirm auctions and photos remain on that device.
10. Install from Safari/Chrome and repeat camera and library tests from the home-screen app.

## Production roadmap

Before real multi-user operation, replace demo login and device-local IndexedDB with production authentication, a database, cloud image storage, user roles, audit history, exports, and auction-platform publishing integrations.
