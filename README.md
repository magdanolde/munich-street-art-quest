# 👾 MUC Art Quest — Munich Street Art Quest

A mobile-first PWA for hunting Munich's street art: pixel mosaics, mega murals and legal walls.
Stack: React 18 · Tailwind CSS 4 · Leaflet · lucide-react · Vite.

## Quick look (no install)
Double-click **`preview.html`** and open it in Chrome or Edge. Use DevTools' phone view (F12, then Ctrl+Shift+M) to see the mobile layout.
The preview loads React, Leaflet and Lucide from unpkg, so you need an internet connection.

## Run the real project
```bash
npm install
npm run dev          # http://localhost:5173 on this computer
npm run dev:phone    # HTTPS on your Wi-Fi, so the camera and GPS work on your phone
npm run build        # production build in /dist (service worker + offline map tiles)
```
`dev:phone` prints a `https://192.168.x.x:5173` address. Open it on your phone and accept the self-signed certificate warning.
To install it as a home-screen app, deploy `/dist` to any HTTPS host (Netlify, Vercel, GitHub Pages). Then use "Add to Home Screen".

## Files
| File | What it is |
|---|---|
| `src/App.jsx` | **The whole app in one file**: data, hooks, map, scanner, collection, modal and styles |
| `src/main.jsx` | Mounts the app and registers the service worker |
| `src/index.css` | Tailwind entry (`@import "tailwindcss"`) |
| `public/manifest.webmanifest`, `public/sw.js`, icons | PWA install, offline shell, cached map tiles |
| `preview.html` | Standalone build of the same `App.jsx` |

## Customising
- **Spots:** edit the `ARTWORKS` array in `App.jsx`. Each spot has `name, motif, lat, lng, district, category, hint, trivia, lore`.
- **Points per category:** `CATEGORIES` (pixel 50, legal wall 75, mural 100).
- **Colours:** the `C` palette object and the pin CSS in `GLOBAL_CSS`.
- **Real AI verification:** the scan is simulated. It shows a 2-second analysis animation, then always succeeds. To verify for real, replace the `setTimeout` in `ScanView.analyze()` with a call to your vision API. Pass it the photo data URL and the target artwork, and call `onVerified()` only when it matches.

## Notes
- Progress, points and your scan photos are saved in the browser's `localStorage`. Photos are shrunk to about 720 px so they fit.
- Sound effects are generated with the Web Audio API, so there are no audio files.
- The spot coordinates and motifs come from the original brief. Check them on the ground before sending real players out.
