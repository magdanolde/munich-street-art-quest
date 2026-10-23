# 👾 MUC Art Quest — Munich Street Art Quest

A mobile-first PWA for hunting Munich's street art: pixel mosaics, mega murals and legal walls.
Stack: React 18 · Tailwind CSS 4 · Leaflet · lucide-react · Vite. Map: CARTO Dark Matter (free key) or a built-in sketch map.

## Quick look (no install)
Double-click **`preview.html`** and open it in Chrome or Edge. Use DevTools' phone view (F12, then Ctrl+Shift+M) to see the mobile layout.
The preview loads React, Leaflet and Lucide from unpkg, so you need an internet connection.

## Dark street map: add your free CARTO key
CARTO's Dark Matter map images need a free key (since September 2026). Without one the app shows the built-in pixel sketch map instead.
1. Request a key at https://carto.com/basemaps/apikey. It's free for personal and non-commercial use, and it arrives by email.
2. Copy `.env.example` to `.env.local` and paste the key: `VITE_CARTO_KEY=your_key`.
3. **On Vercel:** open Project → Settings → Environment Variables and add `VITE_CARTO_KEY` with your key. Then redeploy, because Vite only reads the key at build time.
4. **For `preview.html`:** paste the key into the `cartoKey: ''` line near the top of the file.

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

## How a spot is collected
1. **Find it:** use the map pins, the 3-level hints ("More help"), and the Check In tab's live radar, which shows distance, direction and how close you are.
2. **Check in:** the button only unlocks when your phone's GPS puts you within **75 m** of the pin and the GPS reading is accurate to 100 m or better.
3. **Bonus question:** pick what the artwork shows, from 4 choices. The motif stays hidden until you've checked in. You get one try, worth +25 points.

Testing at home: `npm run dev` and `preview.html` show a "Demo only: pretend I'm there" link. Real Vercel builds never show it.

## Customising
- **Spots:** edit the `ARTWORKS` array in `src/App.jsx`. Each spot has `name, motif, lat, lng, district, category, hint, closer, trivia, lore`.
  - `hint` is the first hint: the area.
  - `closer` is the second hint, shown under "More help": where around the pin to search.
  - The third hint, "What to look for", comes from the category (`CATEGORIES[...].lookFor`).
- **Fix a pin on site:** if an artwork is somewhere else, update its `lat`/`lng`. To read the coordinates, long-press the spot in Google Maps. Then adjust its `closer` text.
- **Custom bonus question:** add `quiz: { question: '…', answer: '…', options: ['…', '…', '…', '…'] }` to a spot. The options must include the answer. Without it, the question is "What does this artwork show?", with 3 other motifs as decoys.
- **Rules:** `CHECKIN_RADIUS_M` (75), `MAX_GPS_ACCURACY_M` (100), `BONUS_POINTS` (25), and `CATEGORIES[...].points` for each category.
- **Colours:** the `C` palette object and the pin CSS in `GLOBAL_CSS`.

## Hosting
Vercel's free Hobby plan suits this app. It provides HTTPS, which phones require for GPS, and redeploys automatically when you push to GitHub. The plan is for personal, non-commercial use only. If the app becomes a paid or client project, Vercel's Pro plan is required. The app is a static site, so Netlify, Cloudflare Pages or GitHub Pages work too.

## Notes
- Progress and points are saved in each player's browser (`localStorage`).
- Sound effects are generated with the Web Audio API, so there are no audio files.
- GPS can be 20–50 m off between tall buildings. The radar says when the signal is too vague and asks you to step into the open.
- The spot coordinates and motifs come from the original brief. Check them on the ground and fix any that are off.
