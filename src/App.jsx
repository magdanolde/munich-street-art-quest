/**
 * 👾 MUC Art Quest — Munich Street Art Quest
 * ------------------------------------------------------------
 * Single-file, mobile-first React app.
 * Stack: React 18+, Tailwind CSS (utility classes), Leaflet, lucide-react.
 *
 * File map (top → bottom)
 *   1. Config & theme tokens
 *   2. Built-in dataset (17 Munich street-art spots)
 *   3. Utilities (distance, image downscaling, seeded random)
 *   4. Hooks (persistent save, chiptune sound FX, toast)
 *   5. Shared UI atoms (PixelArt, CategoryChip, Toast, Confetti)
 *   6. App shell (Header, BottomNav)
 *   7. Tab 1 — MapView (+ FilterBar, ArtworkDrawer)
 *   8. Tab 2 — ScanView (+ viewfinder, AI analysis overlay)
 *   9. Tab 3 — CollectionView (+ ArtworkCard)
 *  10. RewardModal
 *  11. Global CSS (fonts, keyframes, Leaflet overrides)
 *  12. <App /> (default export)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Camera,
  Check,
  ChevronDown,
  Crosshair,
  Footprints,
  ImagePlus,
  Lightbulb,
  LocateFixed,
  Lock,
  MapPin,
  Navigation,
  RotateCcw,
  ScanLine,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

/* ========================================================================== */
/* 1. CONFIG & THEME                                                           */
/* ========================================================================== */

const MUNICH_CENTER = [48.1351, 11.582];
const STORAGE_KEY = 'muc-art-quest/v1';

/**
 * Optional runtime overrides via `window.MQ_CONFIG` (used by the hosted preview,
 * which can't load map tiles, the live camera or GPS). The normal app needs none.
 *   basemap: 'tiles' (CartoDB Dark Matter, default) | 'sketch' (built-in pixel sketch map)
 *   liveCamera: false hides the in-app live viewfinder (Snap/Upload still work)
 *   gpsBlockedMessage: custom toast when location access is refused
 */
const RUNTIME = (typeof window !== 'undefined' && window.MQ_CONFIG) || {};
const BASEMAP = RUNTIME.basemap === 'sketch' ? 'sketch' : 'tiles';
const LIVE_CAMERA = RUNTIME.liveCamera !== false;
const SCAN_DURATION_MS = 2000;
const OUTSIDE_MUNICH_METERS = 30000;

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Pastel palette — every hard shadow and border uses INK. */
const C = {
  ink: '#141024',
  night: '#1d1934',
  plum: '#2a2448',
  plumLight: '#3a3363',
  cream: '#fff7fb',
  pink: '#ff9ecf',
  lavender: '#b9a3ff',
  mint: '#8ff0c8',
  butter: '#ffe08a',
  sky: '#9fd8ff',
};

const CATEGORIES = {
  pixel: { id: 'pixel', label: 'Pixel Mosaics', emoji: '👾', color: C.pink, tint: '#ffe0f0', points: 50 },
  mural: { id: 'mural', label: 'Mega Murals', emoji: '🎨', color: C.lavender, tint: '#ece6ff', points: 100 },
  legal: { id: 'legal', label: 'Legal Walls', emoji: '🏛️', color: C.mint, tint: '#dcfbef', points: 75 },
};

const FILTERS = [
  { id: 'all', label: 'All', emoji: '✨' },
  { id: 'pixel', label: 'Pixel Mosaics', emoji: '👾' },
  { id: 'mural', label: 'Mega Murals', emoji: '🎨' },
  { id: 'legal', label: 'Legal Walls', emoji: '🏛️' },
];

const RANKS = [
  { min: 0, title: 'Rookie Spotter' },
  { min: 0.15, title: 'Wall Whisperer' },
  { min: 0.4, title: 'Pixel Hunter' },
  { min: 0.7, title: 'Spray Sage' },
  { min: 1, title: 'MUC Legend' },
];

const SCAN_STEPS = [
  'Detecting pixel tiles…',
  'Matching motif fingerprint…',
  'Cross-checking GPS zone…',
  'Consulting the lore archive…',
];

/** Reusable class strings for the chunky pixel look. */
const PX_BORDER = 'border-[3px] border-[#141024]';
const PX_SHADOW = 'shadow-[3px_3px_0_#141024]';
const PX_BTN = `mq-press ${PX_BORDER} ${PX_SHADOW}`;

/* ========================================================================== */
/* 2. DATASET                                                                  */
/* ========================================================================== */

const ARTWORKS = [
  // ---- Pixel Mosaics (Invader) -------------------------------------------
  {
    id: 'sendlinger-tor',
    name: 'Sendlinger Tor',
    motif: 'Pretzel & Münchner Kindl',
    lat: 48.134,
    lng: 11.5676,
    district: 'Old Town',
    category: 'pixel',
    hint: 'Look up around the medieval gate where the Altstadt ring meets the U-Bahn hub.',
    trivia: 'Sendlinger Tor is one of three gates that survive from Munich’s old city wall.',
    lore: 'The gate was built in the 14th century to guard the road south to the village of Sendling. In the early 1900s its passages were merged into one wide arch for traffic, leaving the two hexagonal side towers you see today. The Münchner Kindl — the little hooded monk on the city’s coat of arms — has stood for Munich since the Middle Ages, so a pretzel-and-Kindl mosaic here is pure hometown pride.',
  },
  {
    id: 'viktualienmarkt',
    name: 'Viktualienmarkt',
    motif: 'Green Apple & Pretzel',
    lat: 48.1351,
    lng: 11.5761,
    district: 'Old Town',
    category: 'pixel',
    hint: 'Hunt among the market stalls, close to the blue-and-white maypole.',
    trivia: 'Munich’s favourite food market moved here from Marienplatz in 1807.',
    lore: 'King Max I Joseph ordered the farmers’ market out of the crowded Marienplatz in 1807, and it has grown ever since into a maze of stalls selling radishes, cheese, flowers and Weißwurst. The beer garden rotates between Munich’s big breweries, and little fountains honour local folk comedians like Karl Valentin and Liesl Karlstadt. An apple-and-pretzel mosaic is basically the market’s menu in pixels.',
  },
  {
    id: 'alte-utting',
    name: 'Alte Utting',
    motif: 'Bridge Pretzel',
    lat: 48.1235,
    lng: 11.5562,
    district: 'Sendling',
    category: 'pixel',
    hint: 'Find the ship that is parked on a railway bridge. Yes, really.',
    trivia: 'A retired Ammersee passenger ship sits high on an old railway bridge as a bar and culture venue.',
    lore: 'The MS Utting carried passengers across the Ammersee for decades. Instead of scrapping her, a crew of Munich culture makers hauled the ship across the city on a heavy-load transporter and craned her onto a disused railway bridge in the Schlachthof quarter. Today she is a deck bar, club and event space — and a pretzel mosaic on a bridge with a boat on top is about as Munich-surreal as it gets.',
  },
  {
    id: 'goetheplatz',
    name: 'Goetheplatz',
    motif: 'Pac-Man with Beer Mug',
    lat: 48.1298,
    lng: 11.5585,
    district: 'Ludwigsvorstadt',
    category: 'pixel',
    hint: 'Circle the square above the U3/U6 station, a short walk south of the Wiesn.',
    trivia: 'The square is named after Goethe and sits a few minutes from the Oktoberfest grounds.',
    lore: 'Ludwigsvorstadt grew outside the old city walls in the 19th century and still has the Theresienwiese — home of Oktoberfest — on its doorstep. A pellet-chomping arcade hero from 1980 hoisting a Maß mug is the perfect mash-up of retro gaming and the world’s biggest folk festival.',
  },
  {
    id: 'rotkreuzplatz',
    name: 'Rotkreuzplatz',
    motif: 'Mario Piranha Plant',
    lat: 48.1528,
    lng: 11.5332,
    district: 'Neuhausen',
    category: 'pixel',
    hint: 'Search the busy square in the heart of Neuhausen, near the U1 entrance.',
    trivia: 'The square takes its name from the Red Cross hospital founded nearby.',
    lore: 'Neuhausen was its own village until Munich absorbed it in 1890. Its central square is named after the Rotkreuzklinikum, the Red Cross hospital in the neighbourhood. Today it is a buzzing local hub of cafés and ice-cream queues — a sneaky spot for a pixel plant to pop out of a pipe.',
  },
  {
    id: 'thalkirchner-str',
    name: 'Thalkirchner Str.',
    motif: 'Rainbow Invader',
    lat: 48.1285,
    lng: 11.5642,
    district: 'Glockenbach',
    category: 'pixel',
    hint: 'Stroll the street that runs past the Old Southern Cemetery toward Glockenbach.',
    trivia: 'Glockenbachviertel is named after a stream once used by the city’s bell founders.',
    lore: 'The Glockenbach (“bell brook”) took its name from the bell foundries that once worked along its banks. The streams were later covered over, and the quarter became one of Munich’s most colourful nightlife areas and the heart of its LGBTQ+ scene. A rainbow alien could not have picked a better home.',
  },
  {
    id: 'theresienstrasse',
    name: 'Theresienstraße',
    motif: 'Heating Plant Giant',
    lat: 48.1492,
    lng: 11.5731,
    district: 'Maxvorstadt',
    category: 'pixel',
    hint: 'Scan building corners between the university quarter and the Pinakotheken.',
    trivia: 'The street honours Princess Therese, whose 1810 wedding party became the first Oktoberfest.',
    lore: 'Maxvorstadt was Munich’s first planned expansion beyond the old walls, laid out around 1800 under King Max I Joseph. Today it is the city’s brainy, arty quarter: the Alte and Neue Pinakothek, Pinakothek der Moderne and Museum Brandhorst sit a few blocks away, surrounded by thousands of students. A giant pixel creature fits right in among the museums.',
  },
  {
    id: 'schellingstrasse',
    name: 'Schellingstraße',
    motif: 'Red Mini Alien',
    lat: 48.1511,
    lng: 11.5778,
    district: 'Maxvorstadt',
    category: 'pixel',
    hint: 'Look up between the student cafés and bookshops near LMU.',
    trivia: 'The Schelling-Salon, a billiards café on this street, has been open since 1872.',
    lore: 'The street is named after philosopher Friedrich Wilhelm Joseph Schelling. Its old-school Schelling-Salon has served coffee, beer and billiards to generations of students, writers and artists. Tiny invaders love student streets: small, easy to miss, and spotted only by people who look up from their phones.',
  },
  {
    id: 'gabelsbergerstr',
    name: 'Gabelsbergerstr.',
    motif: 'Blue Giant Alien',
    lat: 48.1485,
    lng: 11.5692,
    district: 'Maxvorstadt',
    category: 'pixel',
    hint: 'Walk the street linking Maxvorstadt’s museums and check wall corners above eye level.',
    trivia: 'Named after Franz Xaver Gabelsberger, inventor of a popular German shorthand system.',
    lore: 'Gabelsberger (1789–1849) created a shorthand that was used in parliaments and offices across the German-speaking world for decades. His street runs through the museum quarter — so this big blue alien is effectively making its own gallery debut, no ticket required.',
  },
  {
    id: 'muellersches-volksbad',
    name: "Müller'sches Volksbad",
    motif: 'Isar River Alien',
    lat: 48.132,
    lng: 11.5895,
    district: 'Au-Haidhausen',
    category: 'pixel',
    hint: 'Head to the Isar bank beside the Ludwigsbrücke and the Art Nouveau bathhouse.',
    trivia: 'This Art Nouveau bathhouse opened in 1901 as a public bath for the people of Munich.',
    lore: 'Engineer Karl Müller funded the bath so that ordinary residents — many without a bathroom at home — could wash and swim. More than a century later its vaulted halls, stucco and copper domes are still in use. Perched right on the Isar, it is the natural habitat of a river-loving alien.',
  },
  {
    id: 'nymphenburg-bridge',
    name: 'Nymphenburg Bridge',
    motif: 'Golden Alien',
    lat: 48.1582,
    lng: 11.5034,
    district: 'Nymphenburg',
    category: 'pixel',
    hint: 'Follow the long palace canal and check around the bridge crossing.',
    trivia: 'In cold winters the palace canal freezes and locals play Eisstockschießen on the ice.',
    lore: 'Schloss Nymphenburg was begun in 1664 as a summer residence, a gift celebrating the birth of the heir Max Emanuel. The long canal reaches from the palace toward the city, framed by avenues of trees. A golden alien echoes the gilded Baroque rooms inside the palace.',
  },
  {
    id: 'landsberger-strasse',
    name: 'Landsberger Straße',
    motif: 'Westend Pixel Alien',
    lat: 48.1408,
    lng: 11.536,
    district: 'Westend',
    category: 'pixel',
    hint: 'Search the long road west of the Hackerbrücke, toward the Augustiner brewery.',
    trivia: 'Augustiner — Munich’s oldest brewery, founded in 1328 — brews on this street.',
    lore: 'Westend (officially Schwanthalerhöhe) grew up as a working-class quarter of breweries, workshops and rail yards. It is now one of Munich’s most multicultural neighbourhoods, where old warehouse walls and courtyards make room for studios and street art.',
  },

  // ---- Mega Murals & Landmarks ------------------------------------------
  {
    id: 'werksviertel-mitte',
    name: 'Werksviertel-Mitte',
    motif: 'Loomit 3D Graffiti & Colossal Murals',
    lat: 48.1245,
    lng: 11.606,
    district: 'Ostbahnhof',
    category: 'mural',
    hint: 'Exit Ostbahnhof on the east side and look for the giant Ferris wheel.',
    trivia: 'Before its creative makeover, this site was the Pfanni potato-dumpling factory.',
    lore: 'When food maker Pfanni moved out, its warehouses became the party mile Kunstpark Ost, then the Kultfabrik. Today Werksviertel-Mitte mixes studios, concert halls, a rooftop sheep pasture and the Umadum Ferris wheel. Its walls are painted by big names in the scene — including Loomit, one of the pioneers of German graffiti since the 1980s.',
  },
  {
    id: 'tumblingerstrasse',
    name: 'Tumblingerstraße',
    motif: 'Schlachthof Legal Hall of Fame',
    lat: 48.1228,
    lng: 11.554,
    district: 'Schlachthof',
    category: 'legal',
    hint: 'Find the underpass near the old slaughterhouse grounds — follow the smell of spray paint.',
    trivia: 'One of Munich’s few legal walls: painted over constantly, so it never looks the same twice.',
    lore: 'The Schlachthofviertel grew around the municipal slaughterhouse and cattle market, opened in 1878. Legal walls like this one give writers a place to practise without risk, turning the spot into a living Hall of Fame where pieces last days, not years. Visit twice and you will see two different galleries.',
  },
  {
    id: 'muca-museum-wall',
    name: 'MUCA Museum Wall',
    motif: 'Hotterstraße Giant Urban Wall',
    lat: 48.137,
    lng: 11.5702,
    district: 'Old Town',
    category: 'mural',
    hint: 'Duck into a quiet lane just off the Sendlinger Straße shopping street.',
    trivia: 'MUCA opened in 2016 as Germany’s first museum dedicated to urban and contemporary art.',
    lore: 'Collectors Christian and Stephanie Utz turned a former electricity substation in the old town into the Museum of Urban and Contemporary Art. Inside you will find works by internationally known street artists; outside, the façade itself is a rotating canvas for large-scale pieces.',
  },
  {
    id: 'sophie-scholl-mural',
    name: 'Sophie Scholl Freedom Mural',
    motif: 'Zehentbauernstraße Portrait',
    lat: 48.1152,
    lng: 11.5788,
    district: 'Giesing',
    category: 'mural',
    hint: 'Wander the streets of Giesing — she is watching over Zehentbauernstraße.',
    trivia: 'Sophie Scholl of the White Rose resistance group was executed in 1943, aged 21.',
    lore: 'Sophie Scholl and her brother Hans, students at LMU, were arrested on 18 February 1943 after scattering anti-Nazi leaflets in the university’s atrium. They were executed four days later. The square outside the university’s main building now bears their name — Geschwister-Scholl-Platz — and murals like this keep her message of courage visible in everyday streets.',
  },
  {
    id: 'eisbachwelle-bridge',
    name: 'Eisbachwelle Bridge',
    motif: 'Isar Surfer Graffiti',
    lat: 48.1435,
    lng: 11.5877,
    district: 'Englischer Garten',
    category: 'mural',
    hint: 'Follow the cheering to the bridge at the southern tip of the English Garden.',
    trivia: 'Surfers have ridden a standing river wave here in the city centre for decades.',
    lore: 'The Eisbach is a man-made channel running through the Englischer Garten, one of the largest city parks in the world. Where it rushes out beside the Haus der Kunst, a standing wave forms — and surfers in wetsuits have been riding it for decades while crowds watch from the bridge. The graffiti here celebrates Munich’s unlikely surf culture.',
  },
];

const ART_BY_ID = Object.fromEntries(ARTWORKS.map((a) => [a.id, a]));
const MAX_POINTS = ARTWORKS.reduce((sum, a) => sum + CATEGORIES[a.category].points, 0);

/* ========================================================================== */
/* 3. UTILITIES                                                                */
/* ========================================================================== */

/** Great-circle distance in meters between two {lat,lng} points. */
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Draws an image source to a canvas no larger than `max` px and returns a JPEG data URL. */
function drawToDataUrl(source, srcW, srcH, max = 720) {
  const scale = Math.min(1, max / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

/** Reads a picked/captured photo and shrinks it so it fits comfortably in localStorage. */
function downscaleImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(drawToDataUrl(img, img.naturalWidth, img.naturalHeight));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unreadable image'));
    };
    img.src = url;
  });
}

/** Tiny deterministic PRNG so every artwork gets the same pixel sprite every time. */
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function rankFor(ratio) {
  return [...RANKS].reverse().find((r) => ratio >= r.min)?.title ?? RANKS[0].title;
}

/* ========================================================================== */
/* 4. HOOKS                                                                    */
/* ========================================================================== */

const DEFAULT_SAVE = { unlocked: {}, sound: true };

/** Save game in localStorage (falls back gracefully when storage is blocked or full). */
function useSaveGame() {
  const [save, setSave] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SAVE, ...JSON.parse(raw) } : DEFAULT_SAVE;
    } catch {
      return DEFAULT_SAVE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Storage full → keep progress, drop the photos.
      try {
        const slim = {
          ...save,
          unlocked: Object.fromEntries(Object.entries(save.unlocked).map(([k, v]) => [k, { ...v, photo: null }])),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      } catch {
        /* storage unavailable (private mode) — progress lives in memory only */
      }
    }
  }, [save]);

  return [save, setSave];
}

/** 8-bit sound effects synthesized with the Web Audio API — no audio files needed. */
function useSfx(enabled) {
  const ctxRef = useRef(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  return useMemo(() => {
    const getCtx = () => {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      if (!ctxRef.current) ctxRef.current = new AC();
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      return ctxRef.current;
    };

    const tone = (freq, { at = 0, dur = 0.1, type = 'square', vol = 0.05, to } = {}) => {
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    };

    const sounds = {
      tap: () => tone(660, { dur: 0.05, vol: 0.03 }),
      open: () => {
        tone(523, { dur: 0.06 });
        tone(784, { at: 0.06, dur: 0.09 });
      },
      shutter: () => {
        tone(1400, { dur: 0.03, type: 'triangle', vol: 0.07 });
        tone(380, { at: 0.04, dur: 0.07, type: 'triangle', vol: 0.06 });
      },
      scan: () => {
        tone(180, { dur: 1.9, type: 'sawtooth', vol: 0.018, to: 960 });
        [0.4, 0.8, 1.2, 1.6].forEach((at) => tone(1200, { at, dur: 0.04, vol: 0.02 }));
      },
      success: () => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.14, vol: 0.05 }));
        tone(1568, { at: 0.45, dur: 0.35, vol: 0.04, type: 'triangle' });
      },
      error: () => {
        tone(300, { dur: 0.12 });
        tone(190, { at: 0.12, dur: 0.22 });
      },
    };

    const api = {};
    for (const [name, fn] of Object.entries(sounds)) {
      api[name] = () => {
        if (!enabledRef.current) return;
        try {
          fn();
        } catch {
          /* audio not available */
        }
      };
    }
    /** Plays even while muted — used to confirm "sound on". */
    api.preview = () => {
      try {
        sounds.open();
      } catch {
        /* ignore */
      }
    };
    return api;
  }, []);
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, tone = 'info') => {
    clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, show];
}

/* ========================================================================== */
/* 5. SHARED UI ATOMS                                                          */
/* ========================================================================== */

/** Original, procedurally generated 8×8 mirrored pixel sprite (placeholder art). */
function PixelArt({ seed, category, locked = false, className = '' }) {
  const cells = useMemo(() => {
    const rand = seededRandom(seed);
    const cat = CATEGORIES[category];
    const palette = [cat.color, C.butter, C.sky, C.ink];
    const out = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const r = rand();
        if (r < 0.38) continue;
        const color = palette[r > 0.93 ? 3 : r > 0.8 ? 2 : r > 0.68 ? 1 : 0];
        out.push({ x, y, color }, { x: 7 - x, y, color });
      }
    }
    return out;
  }, [seed, category]);

  return (
    <svg viewBox="-1 -1 10 10" shapeRendering="crispEdges" className={className} aria-hidden="true">
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="1.02" height="1.02" fill={locked ? C.plumLight : c.color} />
      ))}
    </svg>
  );
}

function CategoryChip({ category, small = false }) {
  const cat = CATEGORIES[category];
  return (
    <span
      className={`font-vt inline-flex items-center gap-1 ${PX_BORDER} px-1.5 leading-none text-[#141024] ${
        small ? 'py-0.5 text-[15px]' : 'py-1 text-[17px]'
      }`}
      style={{ background: cat.color }}
    >
      <span className="text-[13px]">{cat.emoji}</span>
      {cat.label}
    </span>
  );
}

function StatusChip({ unlocked }) {
  return unlocked ? (
    <span className={`font-vt inline-flex items-center gap-1 ${PX_BORDER} bg-[#8ff0c8] px-1.5 py-1 text-[17px] leading-none text-[#141024]`}>
      <Check size={13} strokeWidth={3} /> Unlocked
    </span>
  ) : (
    <span className={`font-vt inline-flex items-center gap-1 ${PX_BORDER} bg-[#d9d3ee] px-1.5 py-1 text-[17px] leading-none text-[#141024]`}>
      <Lock size={12} strokeWidth={3} /> Locked
    </span>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.tone === 'error' ? C.pink : toast.tone === 'success' ? C.mint : C.butter;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-[2500] flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className={`mq-toast font-vt max-w-full ${PX_BORDER} ${PX_SHADOW} px-3 py-1.5 text-center text-[19px] leading-tight text-[#141024]`}
        style={{ background: bg }}
      >
        {toast.message}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = [C.pink, C.lavender, C.mint, C.butter, C.sky, C.cream];

function Confetti({ count = 72 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        duration: 1.8 + Math.random() * 1.8,
        size: 6 + Math.floor(Math.random() * 3) * 3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: Math.round((Math.random() * 2 - 1) * 90),
        spin: Math.round(Math.random() * 720 - 360),
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[3100] overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="mq-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

/* ========================================================================== */
/* 6. APP SHELL                                                                */
/* ========================================================================== */

function Header({ points, sound, onToggleSound }) {
  return (
    <header className="relative z-30 shrink-0 border-b-[3px] border-[#141024] bg-[#2a2448] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="mq-bob text-[26px] leading-none" aria-hidden="true">
            👾
          </span>
          <h1 className="font-pixel truncate text-[10.5px] leading-none text-[#ffe0f0]">
            MUC <span className="text-[#ff9ecf]">Art</span> Quest
          </h1>
        </div>

        <div
          key={points}
          className={`mq-bump font-pixel flex shrink-0 items-center gap-1.5 ${PX_BORDER} ${PX_SHADOW} bg-[#ffe08a] px-2 py-[7px] text-[10px] leading-none text-[#141024]`}
          aria-label={`${points} points`}
        >
          <span className="text-[13px]">🏆</span>
          {points} PTS
        </div>

        <button
          type="button"
          onClick={onToggleSound}
          aria-label={sound ? 'Mute sound effects' : 'Turn sound effects on'}
          aria-pressed={sound}
          className={`${PX_BTN} grid h-9 w-9 shrink-0 place-items-center text-[#141024]`}
          style={{ background: sound ? C.mint : '#d9d3ee' }}
        >
          {sound ? <Volume2 size={18} strokeWidth={2.5} /> : <VolumeX size={18} strokeWidth={2.5} />}
        </button>
      </div>
    </header>
  );
}

const TABS = [
  { id: 'map', emoji: '🗺️', label: 'Map', color: C.sky },
  { id: 'scan', emoji: '📸', label: 'Scan Art', color: C.pink },
  { id: 'collection', emoji: '🏅', label: 'Collection', color: C.butter },
];

function BottomNav({ tab, onChange, found }) {
  return (
    <nav
      className="relative z-30 shrink-0 border-t-[3px] border-[#141024] bg-[#2a2448] pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      <div className="grid h-[68px] grid-cols-3">
        {TABS.map((t) => {
          const active = t.id === tab;
          const isScan = t.id === 'scan';
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-1 select-none"
            >
              <span
                className={`relative grid place-items-center ${PX_BORDER} transition-transform duration-100 ${
                  isScan ? '-mt-6 h-14 w-14 text-[26px]' : 'h-9 w-11 text-[19px]'
                } ${active ? `${PX_SHADOW} -translate-y-0.5` : 'shadow-none'}`}
                style={{ background: active || isScan ? t.color : C.plumLight }}
              >
                <span aria-hidden="true">{t.emoji}</span>
                {t.id === 'collection' && (
                  <span className="font-vt absolute -right-3 -top-2 border-2 border-[#141024] bg-[#fff7fb] px-1 text-[13px] leading-[14px] text-[#141024]">
                    {found}/{ARTWORKS.length}
                  </span>
                )}
              </span>
              <span
                className={`font-pixel text-[7.5px] leading-none ${active ? 'text-[#fff7fb]' : 'text-[#a99fcf]'}`}
              >
                {t.label}
              </span>
              {active && <span className="absolute bottom-1 h-[3px] w-6" style={{ background: t.color }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ========================================================================== */
/* 7. TAB 1 — MAP                                                              */
/* ========================================================================== */

/** Hand-drawn, approximate Munich landmarks for the offline 'sketch' basemap. */
const SKETCH = {
  isar: [
    [48.095, 11.545], [48.102, 11.553], [48.108, 11.559], [48.1137, 11.5626], [48.12, 11.5695],
    [48.1247, 11.5785], [48.1299, 11.585], [48.133, 11.5885], [48.1373, 11.5925], [48.143, 11.5965],
    [48.152, 11.6], [48.162, 11.605], [48.175, 11.611],
  ],
  eisbach: [[48.1425, 11.5885], [48.148, 11.5905], [48.156, 11.5935], [48.165, 11.599]],
  parks: [
    { name: 'Englischer Garten', label: [48.157, 11.594], shape: [[48.1425, 11.5855], [48.15, 11.5865], [48.16, 11.589], [48.17, 11.595], [48.178, 11.602], [48.172, 11.608], [48.16, 11.603], [48.15, 11.5985], [48.144, 11.5945]] },
    { name: 'Theresienwiese', label: [48.1318, 11.5495], shape: [[48.1355, 11.5455], [48.1355, 11.5525], [48.1305, 11.5535], [48.1278, 11.5505], [48.129, 11.5455]] },
    { name: 'Schlosspark', label: [48.1605, 11.4945], shape: [[48.155, 11.486], [48.1655, 11.486], [48.1655, 11.5005], [48.1555, 11.5005]] },
    { name: 'Hofgarten', label: null, shape: [[48.1428, 11.5785], [48.1445, 11.5785], [48.1445, 11.5835], [48.1428, 11.5835]] },
  ],
  ring: [
    [48.1392, 11.5655], [48.1345, 11.5672], [48.1318, 11.573], [48.133, 11.579], [48.1353, 11.5818],
    [48.1395, 11.5835], [48.1425, 11.58], [48.144, 11.5745], [48.1425, 11.569], [48.1392, 11.5655],
  ],
  roads: [
    [[48.1425, 11.5775], [48.15, 11.58], [48.165, 11.5855], [48.18, 11.59]], // Ludwig-/Leopoldstraße
    [[48.1415, 11.563], [48.148, 11.548], [48.1528, 11.5332], [48.1575, 11.5135]], // Nymphenburger Str.
    [[48.134, 11.5676], [48.1275, 11.556], [48.12, 11.54]], // Lindwurmstraße
    [[48.133, 11.5885], [48.129, 11.6], [48.1273, 11.6045]], // Rosenheimer Str.
    [[48.1395, 11.5835], [48.1385, 11.595], [48.1375, 11.605]], // Maximilianstraße
    [[48.1318, 11.573], [48.1235, 11.576], [48.112, 11.5785]], // Fraunhofer → Giesing
    [[48.14, 11.556], [48.1408, 11.536], [48.1425, 11.515]], // Landsberger Str.
  ],
  rail: [
    [[48.1402, 11.56], [48.1412, 11.545], [48.1432, 11.528], [48.1452, 11.505]],
    [[48.1273, 11.6045], [48.1258, 11.62]],
  ],
  canal: [[48.1583, 11.5033], [48.1575, 11.513], [48.157, 11.524]],
  labels: [
    ['Altstadt', 48.1374, 11.5755, 'big'], ['Maxvorstadt', 48.1495, 11.5645], ['Schwabing', 48.162, 11.578],
    ['Haidhausen', 48.1305, 11.596], ['Glockenbach', 48.1285, 11.5705], ['Giesing', 48.112, 11.584],
    ['Westend', 48.136, 11.533], ['Neuhausen', 48.1555, 11.535], ['Sendling', 48.118, 11.548],
    ['Nymphenburg', 48.1555, 11.497], ['Isar', 48.118, 11.5665, 'water'], ['Hbf', 48.1412, 11.5592, 'stn'],
    ['Ostbf', 48.1283, 11.6085, 'stn'],
  ],
};

function addSketchBasemap(map) {
  const quiet = { interactive: false, lineCap: 'square', lineJoin: 'miter' };
  SKETCH.parks.forEach((p) => {
    L.polygon(p.shape, { ...quiet, color: C.mint, weight: 2, opacity: 0.45, dashArray: '4 4', fillColor: C.mint, fillOpacity: 0.12 }).addTo(map);
  });
  SKETCH.rail.forEach((r) => L.polyline(r, { ...quiet, color: '#5b4f8a', weight: 3, dashArray: '2 6' }).addTo(map));
  SKETCH.roads.forEach((r) => L.polyline(r, { ...quiet, color: C.plumLight, weight: 5 }).addTo(map));
  L.polyline(SKETCH.ring, { ...quiet, color: C.lavender, weight: 5, opacity: 0.55 }).addTo(map);
  L.polyline(SKETCH.canal, { ...quiet, color: C.sky, weight: 4, opacity: 0.6 }).addTo(map);
  L.polyline(SKETCH.eisbach, { ...quiet, color: C.sky, weight: 3, opacity: 0.6 }).addTo(map);
  L.polyline(SKETCH.isar, { ...quiet, color: C.sky, weight: 12, opacity: 0.35 }).addTo(map);
  L.polyline(SKETCH.isar, { ...quiet, color: C.sky, weight: 4, opacity: 0.85 }).addTo(map);
  const label = (text, lat, lng, kind = '') =>
    L.marker([lat, lng], {
      interactive: false,
      keyboard: false,
      zIndexOffset: -1000,
      icon: L.divIcon({ className: 'mq-pin-wrap', iconSize: [0, 0], html: `<span class="mq-label ${kind}">${text}</span>` }),
    }).addTo(map);
  SKETCH.labels.forEach(([t, lat, lng, kind]) => label(t, lat, lng, kind));
  SKETCH.parks.forEach((p) => p.label && label(p.name, p.label[0], p.label[1], 'park'));
}

function makePinIcon(art, isUnlocked, isSelected) {
  const cat = CATEGORIES[art.category];
  const cls = ['mq-pin', isUnlocked ? 'is-unlocked' : 'is-locked', isSelected ? 'is-selected' : ''].join(' ');
  return L.divIcon({
    className: 'mq-pin-wrap',
    iconSize: [40, 44],
    iconAnchor: [20, 44],
    html: `<div class="${cls}" style="--pin:${cat.color}">
      <div class="mq-pin-head"><span>${cat.emoji}</span><i class="mq-pin-badge">${isUnlocked ? '★' : '🔒'}</i></div>
      <div class="mq-pin-tail"></div>
    </div>`,
  });
}

const USER_ICON = () =>
  L.divIcon({
    className: 'mq-pin-wrap',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: '<div class="mq-user"><span class="mq-user-ring"></span><span class="mq-user-dot"></span></div>',
  });

function FilterBar({ filter, onChange, counts }) {
  return (
    <div className="mq-noscrollbar absolute inset-x-0 top-0 z-[1000] flex gap-2 overflow-x-auto px-3 pb-2 pt-3">
      {FILTERS.map((f) => {
        const active = f.id === filter;
        const color = f.id === 'all' ? C.butter : CATEGORIES[f.id].color;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-pressed={active}
            className={`${PX_BTN} font-vt flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[18px] leading-none`}
            style={{ background: active ? color : C.plum, color: active ? C.ink : C.cream }}
          >
            <span className="text-[14px]">{f.emoji}</span>
            {f.label}
            <span className={`text-[15px] ${active ? 'opacity-70' : 'opacity-60'}`}>{counts[f.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function ArtworkDrawer({ art, isUnlocked, userPos, onClose, onScan }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(null);
  const cat = CATEGORIES[art.category];
  const distance = userPos ? distanceMeters(userPos, art) : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${art.lat},${art.lng}&travelmode=walking`;

  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (startY.current == null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 90) onClose();
    startY.current = null;
    setDragging(false);
    setDragY(0);
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-[1100]"
      style={{ transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform .2s ease-out' }}
      role="dialog"
      aria-label={`${art.name} details`}
    >
      <div className={`mq-drawer-in mx-2 mb-2 ${PX_BORDER} bg-[#fff7fb] text-[#241f3a] shadow-[4px_4px_0_#141024]`}>
        {/* Drag handle */}
        <div
          className="flex touch-none justify-center pb-1 pt-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="h-[5px] w-12 bg-[#141024]/25" />
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-start gap-2">
            <div className="flex flex-1 flex-wrap gap-1.5">
              <CategoryChip category={art.category} small />
              <StatusChip unlocked={isUnlocked} />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${PX_BTN} grid h-8 w-8 shrink-0 place-items-center bg-[#fff7fb]`}
            >
              <X size={16} strokeWidth={3} />
            </button>
          </div>

          <h2 className="font-pixel mt-3 text-[13px] leading-[1.5]">{art.name}</h2>
          <p className="font-vt mt-1 text-[20px] leading-tight text-[#5b4f8a]">Motif: {art.motif}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-bold text-[#5b4f8a]">
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} strokeWidth={2.5} /> {art.district}
            </span>
            {distance != null && (
              <span className="inline-flex items-center gap-1">
                <Footprints size={14} strokeWidth={2.5} /> {formatDistance(distance)} away
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Sparkles size={14} strokeWidth={2.5} /> {cat.points} pts
            </span>
          </div>

          <div className={`mt-3 border-[3px] border-dashed border-[#141024]/30 p-2.5`} style={{ background: cat.tint }}>
            {!isUnlocked && (
              <p className="text-[13px] font-bold leading-snug">
                <span className="font-vt mr-1 text-[17px]">🧭 HINT</span>
                {art.hint}
              </p>
            )}
            <p className={`text-[13px] leading-snug ${!isUnlocked ? 'mt-1.5' : ''}`}>
              <span className="font-vt mr-1 text-[17px]">
                <Lightbulb size={13} strokeWidth={3} className="mr-0.5 inline -translate-y-px" />
                LORE
              </span>
              {art.trivia}
            </p>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onScan(art.id)}
              className={`${PX_BTN} font-pixel flex flex-1 items-center justify-center gap-2 bg-[#ff9ecf] px-3 py-3 text-[10px] leading-none text-[#141024]`}
            >
              <Camera size={16} strokeWidth={2.5} />
              {isUnlocked ? 'Rescan Spot' : 'Scan This Spot'}
            </button>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Walking directions"
              className={`${PX_BTN} grid w-12 shrink-0 place-items-center bg-[#9fd8ff] text-[#141024]`}
            >
              <Navigation size={18} strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapView({ active, unlocked, filter, onFilter, selectedId, onSelect, userPos, onUserPos, onScan, toast, sfx }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const pinLayerRef = useRef(null);
  const userLayerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [locating, setLocating] = useState(false);

  const counts = useMemo(() => {
    const c = { all: ARTWORKS.length, pixel: 0, mural: 0, legal: 0 };
    ARTWORKS.forEach((a) => (c[a.category] += 1));
    return c;
  }, []);
  const found = ARTWORKS.filter((a) => unlocked[a.id]).length;

  // Create the Leaflet map once.
  useEffect(() => {
    const sketch = BASEMAP === 'sketch';
    const map = L.map(elRef.current, {
      center: MUNICH_CENTER,
      zoom: 13,
      minZoom: sketch ? 11 : 3,
      maxZoom: sketch ? 18 : 20,
      maxBounds: sketch ? [[48.0, 11.35], [48.27, 11.8]] : undefined,
      zoomControl: false,
      attributionControl: false,
    });
    if (sketch) {
      elRef.current.classList.add('mq-sketch');
      addSketchBasemap(map);
      L.control.attribution({ position: 'bottomleft' }).addAttribution('Pixel sketch map · approximate').addTo(map);
    } else {
      L.tileLayer(TILE_URL, { subdomains: 'abcd', maxZoom: 20, attribution: TILE_ATTRIBUTION }).addTo(map);
      L.control.attribution({ position: 'bottomleft' }).addTo(map);
    }
    pinLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Leaflet needs a size refresh after its container was hidden.
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [active]);

  // (Re)draw artwork pins whenever filter / progress / selection changes.
  useEffect(() => {
    const layer = pinLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    ARTWORKS.filter((a) => filter === 'all' || a.category === filter).forEach((a) => {
      const selected = a.id === selectedId;
      const marker = L.marker([a.lat, a.lng], {
        icon: makePinIcon(a, Boolean(unlocked[a.id]), selected),
        title: a.name,
        keyboard: true,
        bubblingMouseEvents: false,
        zIndexOffset: selected ? 1000 : unlocked[a.id] ? 0 : 100,
      });
      marker.on('click', () => onSelectRef.current(a.id));
      layer.addLayer(marker);
    });
  }, [filter, unlocked, selectedId]);

  // Zoom to fit the visible pins whenever the category filter changes.
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    const map = mapRef.current;
    const pts = ARTWORKS.filter((a) => filter === 'all' || a.category === filter).map((a) => [a.lat, a.lng]);
    if (!map || !pts.length) return;
    if (pts.length === 1) map.flyTo(pts[0], 15, { duration: 0.6 });
    else map.flyToBounds(pts, { padding: [56, 72], maxZoom: 15, duration: 0.6 });
  }, [filter]);

  // Fly to the selected pin, nudged up so the drawer doesn't cover it.
  useEffect(() => {
    const map = mapRef.current;
    const art = selectedId && ART_BY_ID[selectedId];
    if (!map || !art || !active) return;
    const zoom = Math.max(map.getZoom(), 15);
    const pt = map.project([art.lat, art.lng], zoom).add([0, 130]);
    map.flyTo(map.unproject(pt, zoom), zoom, { duration: 0.6 });
  }, [selectedId, active]);

  // User position marker + accuracy halo.
  useEffect(() => {
    const layer = userLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!userPos) return;
    L.circle([userPos.lat, userPos.lng], {
      radius: Math.min(userPos.acc || 40, 300),
      color: C.sky,
      weight: 2,
      fillColor: C.sky,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(layer);
    L.marker([userPos.lat, userPos.lng], { icon: USER_ICON(), interactive: false, zIndexOffset: 2000 }).addTo(layer);
  }, [userPos]);

  const locate = () => {
    sfx.tap();
    if (!('geolocation' in navigator)) {
      toast('GPS is not available on this device', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        onUserPos(p);
        const fromCenter = distanceMeters(p, { lat: MUNICH_CENTER[0], lng: MUNICH_CENTER[1] });
        if (fromCenter > OUTSIDE_MUNICH_METERS) {
          toast('You’re outside Munich — showing the city instead 🥨');
          mapRef.current?.flyTo(MUNICH_CENTER, 13);
        } else {
          toast('Found you! Happy hunting ✨', 'success');
          mapRef.current?.flyTo([p.lat, p.lng], 16);
        }
      },
      (err) => {
        setLocating(false);
        sfx.error();
        toast(
          err.code === 1 ? RUNTIME.gpsBlockedMessage || 'Location is blocked — allow it in your browser settings' : 'Couldn’t get your location',
          'error',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const recenter = () => {
    sfx.tap();
    onSelect(null);
    mapRef.current?.flyTo(MUNICH_CENTER, 13);
  };

  const selected = selectedId ? ART_BY_ID[selectedId] : null;

  return (
    <div className="absolute inset-0">
      <div ref={elRef} className="absolute inset-0" aria-label="Map of Munich street art" />

      <FilterBar filter={filter} onChange={(f) => (sfx.tap(), onFilter(f))} counts={counts} />

      {!selected && (
        <>
          <div
            className={`font-vt pointer-events-none absolute bottom-7 left-3 z-[1000] ${PX_BORDER} ${PX_SHADOW} bg-[#2a2448] px-2 py-1 text-[17px] leading-none text-[#fff7fb]`}
          >
            🏅 {found}/{ARTWORKS.length} found
          </div>
          <div className="absolute bottom-7 right-3 z-[1000] flex flex-col gap-2">
            <button
              type="button"
              onClick={recenter}
              aria-label="Center on Munich"
              className={`${PX_BTN} grid h-11 w-11 place-items-center bg-[#fff7fb] text-[#141024]`}
            >
              <Crosshair size={20} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={locate}
              aria-label="My location"
              disabled={locating}
              className={`${PX_BTN} grid h-11 w-11 place-items-center bg-[#9fd8ff] text-[#141024]`}
            >
              <LocateFixed size={20} strokeWidth={2.5} className={locating ? 'mq-spin' : ''} />
            </button>
          </div>
        </>
      )}

      {selected && (
        <ArtworkDrawer
          key={selected.id}
          art={selected}
          isUnlocked={Boolean(unlocked[selected.id])}
          userPos={userPos}
          onClose={() => onSelect(null)}
          onScan={onScan}
        />
      )}
    </div>
  );
}

/* ========================================================================== */
/* 8. TAB 2 — SCAN                                                             */
/* ========================================================================== */

function ViewfinderFrame({ target, live }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* pixel corner brackets */}
      {['left-3 top-3', 'right-3 top-3 rotate-90', 'bottom-3 right-3 rotate-180', 'bottom-3 left-3 -rotate-90'].map(
        (pos) => (
          <svg key={pos} viewBox="0 0 8 8" shapeRendering="crispEdges" className={`absolute h-9 w-9 ${pos}`}>
            <path d="M0 0h8v2H2v6H0z" fill={C.pink} />
          </svg>
        ),
      )}
      {/* crosshair (only over the live camera feed) */}
      <div className={`absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 ${live ? '' : 'hidden'}`}>
        <span className="absolute left-1/2 top-0 h-4 w-[3px] -translate-x-1/2 bg-[#fff7fb]/80" />
        <span className="absolute bottom-0 left-1/2 h-4 w-[3px] -translate-x-1/2 bg-[#fff7fb]/80" />
        <span className="absolute left-0 top-1/2 h-[3px] w-4 -translate-y-1/2 bg-[#fff7fb]/80" />
        <span className="absolute right-0 top-1/2 h-[3px] w-4 -translate-y-1/2 bg-[#fff7fb]/80" />
        <span className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 bg-[#ff9ecf]" />
      </div>
      {/* laser line */}
      <div className="mq-laser absolute inset-x-4 h-[3px] bg-[#8ff0c8] shadow-[0_0_12px_3px_rgba(143,240,200,.7)]" />
      {/* HUD */}
      <div className="font-vt absolute left-4 top-12 flex items-center gap-1.5 text-[17px] leading-none text-[#8ff0c8]">
        <span className="mq-blink inline-block h-2.5 w-2.5 bg-[#ff9ecf]" /> AI SCAN MODE
      </div>
      <div className="font-vt absolute right-4 top-12 text-right text-[17px] leading-none text-[#ffe08a]">
        +{CATEGORIES[target.category].points} PTS
      </div>
      <div className="font-vt absolute inset-x-0 bottom-12 text-center text-[18px] leading-none text-[#fff7fb]/85">
        Fit the artwork inside the frame
      </div>
    </div>
  );
}

function AnalyzingOverlay({ shot }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % SCAN_STEPS.length), SCAN_DURATION_MS / SCAN_STEPS.length);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 z-20" role="status" aria-live="polite">
      {shot && <img src={shot} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="mq-scanlines absolute inset-0 bg-[#141024]/70" />
      <div className="mq-laser absolute inset-x-0 h-[3px] bg-[#ff9ecf] shadow-[0_0_14px_4px_rgba(255,158,207,.8)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="mq-loader" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <p className="font-pixel text-[11px] leading-[1.7] text-[#fff7fb]">
          Analyzing Street Art
          <br />
          with AI…
        </p>
        <p className="font-vt h-5 text-[19px] leading-none text-[#8ff0c8]">{SCAN_STEPS[step]}</p>
        <div className={`h-4 w-48 ${PX_BORDER} bg-[#2a2448]`}>
          <div className="mq-fill h-full bg-[#ffe08a]" style={{ animationDuration: `${SCAN_DURATION_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}

function ScanView({ unlocked, targetId, onTarget, onVerified, sfx, toast }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const timerRef = useRef(null);
  const [camState, setCamState] = useState(LIVE_CAMERA ? 'off' : 'unavailable'); // off | starting | live | unavailable
  const [phase, setPhase] = useState('idle'); // idle | analyzing
  const [shot, setShot] = useState(null);
  const [flash, setFlash] = useState(false);

  const target = ART_BY_ID[targetId];
  const cat = CATEGORIES[target.category];
  const isUnlocked = Boolean(unlocked[target.id]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      stopCamera();
      clearTimeout(timerRef.current);
    },
    [stopCamera],
  );

  const startCamera = async () => {
    sfx.tap();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('unavailable');
      toast('Live camera not supported here — tap Snap to use your phone camera', 'error');
      return;
    }
    setCamState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamState('live');
    } catch {
      setCamState('unavailable');
      sfx.error();
      toast('Camera blocked — tap Snap or Upload instead', 'error');
    }
  };

  const toggleCamera = () => {
    if (camState === 'live') {
      sfx.tap();
      stopCamera();
      setCamState('off');
    } else {
      startCamera();
    }
  };

  const analyze = (dataUrl) => {
    setShot(dataUrl);
    setPhase('analyzing');
    sfx.scan();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPhase('idle');
      setShot(null);
      onVerified(target.id, dataUrl);
    }, SCAN_DURATION_MS);
  };

  const snap = () => {
    if (phase !== 'idle') return;
    sfx.shutter();
    const video = videoRef.current;
    if (camState === 'live' && video?.videoWidth) {
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      analyze(drawToDataUrl(video, video.videoWidth, video.videoHeight));
    } else {
      cameraInputRef.current?.click(); // opens the native camera on phones
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      analyze(await downscaleImageFile(file));
    } catch {
      sfx.error();
      toast('Couldn’t read that photo — try another one', 'error');
    }
  };

  return (
    <div className="mq-grid-bg absolute inset-0 flex flex-col gap-3 overflow-y-auto p-3">
      {/* Target picker */}
      <div className={`shrink-0 ${PX_BORDER} ${PX_SHADOW} bg-[#fff7fb] p-2.5 text-[#241f3a]`}>
        <div className="flex items-center gap-2.5">
          <div className={`grid h-12 w-12 shrink-0 place-items-center ${PX_BORDER} text-[24px]`} style={{ background: cat.color }}>
            {cat.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="mq-target" className="font-vt block text-[16px] leading-none text-[#7a6fae]">
              SCAN TARGET {isUnlocked ? '· ✓ COLLECTED' : ''}
            </label>
            <div className="relative mt-1">
              <select
                id="mq-target"
                value={target.id}
                disabled={phase !== 'idle'}
                onChange={(e) => (sfx.tap(), onTarget(e.target.value))}
                className="font-pixel w-full appearance-none truncate bg-transparent pr-6 text-[10.5px] leading-[1.4] text-[#141024] outline-none"
              >
                {Object.values(CATEGORIES).map((c) => (
                  <optgroup key={c.id} label={`${c.emoji} ${c.label}`}>
                    {ARTWORKS.filter((a) => a.category === c.id).map((a) => (
                      <option key={a.id} value={a.id}>
                        {unlocked[a.id] ? '✓ ' : ''}
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={3} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" />
            </div>
            <p className="mt-1 truncate text-[12px] font-bold text-[#7a6fae]">
              {target.motif} · {target.district}
            </p>
          </div>
        </div>
      </div>

      {/* Viewfinder */}
      <div className={`relative min-h-[260px] flex-1 overflow-hidden ${PX_BORDER} bg-[#0d0a1a] shadow-[4px_4px_0_#141024]`}>
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${camState === 'live' ? '' : 'hidden'}`}
        />

        {camState !== 'live' && (
          <div className="mq-scanlines absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#3a3363,#141024_70%)] px-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <ScanLine size={40} strokeWidth={2} className="text-[#b9a3ff]" />
              <p className="font-vt whitespace-pre-line text-[20px] leading-tight text-[#d9d3ee]">
                {camState === 'starting'
                  ? 'Booting camera…'
                  : camState === 'unavailable'
                    ? LIVE_CAMERA
                      ? 'Live preview unavailable here.\nSnap opens your phone camera.'
                      : 'Snap opens your phone camera.\nUpload picks a saved photo.'
                    : 'Point at the artwork, then Snap.'}
              </p>
              {camState === 'off' && (
                <button
                  type="button"
                  onClick={startCamera}
                  className={`${PX_BTN} font-pixel flex items-center gap-2 bg-[#b9a3ff] px-3 py-2.5 text-[9px] leading-none text-[#141024]`}
                >
                  <Video size={14} strokeWidth={2.5} /> Start live view
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'idle' && <ViewfinderFrame target={target} live={camState === 'live'} />}
        {phase === 'analyzing' && <AnalyzingOverlay shot={shot} />}
        {flash && <div className="absolute inset-0 z-30 bg-white" />}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-1">
        <button
          type="button"
          onClick={() => (sfx.tap(), galleryInputRef.current?.click())}
          disabled={phase !== 'idle'}
          className={`${PX_BTN} font-vt flex h-12 w-[84px] flex-col items-center justify-center bg-[#fff7fb] text-[16px] leading-none text-[#141024] disabled:opacity-50`}
        >
          <ImagePlus size={18} strokeWidth={2.5} />
          Upload
        </button>

        <button
          type="button"
          onClick={snap}
          disabled={phase !== 'idle'}
          aria-label="Take photo and verify"
          className={`${PX_BTN} grid h-[70px] w-[70px] place-items-center bg-[#ff9ecf] text-[#141024] disabled:opacity-60`}
        >
          <span className={`grid h-[50px] w-[50px] place-items-center ${PX_BORDER} bg-[#fff7fb]`}>
            <Camera size={24} strokeWidth={2.5} />
          </span>
        </button>

        {LIVE_CAMERA ? (
          <button
            type="button"
            onClick={toggleCamera}
            disabled={phase !== 'idle' || camState === 'starting'}
            className={`${PX_BTN} font-vt flex h-12 w-[84px] flex-col items-center justify-center text-[16px] leading-none text-[#141024] disabled:opacity-50`}
            style={{ background: camState === 'live' ? C.mint : C.lavender }}
          >
            {camState === 'live' ? <VideoOff size={18} strokeWidth={2.5} /> : <Video size={18} strokeWidth={2.5} />}
            {camState === 'live' ? 'Stop' : 'Live'}
          </button>
        ) : (
          <span className="w-[84px]" aria-hidden="true" />
        )}
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}

/* ========================================================================== */
/* 9. TAB 3 — COLLECTION & LORE                                                */
/* ========================================================================== */

function ArtworkCard({ art, entry, open, onToggle, onShowOnMap, onScan, innerRef }) {
  const cat = CATEGORIES[art.category];

  if (!entry) {
    return (
      <article ref={innerRef} className={`${PX_BORDER} ${PX_SHADOW} bg-[#2f2950] p-3 text-[#fff7fb]`}>
        <div className="flex gap-3">
          <div className={`relative grid h-[72px] w-[72px] shrink-0 place-items-center ${PX_BORDER} bg-[#1d1934]`}>
            <PixelArt seed={art.id} category={art.category} locked className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)]" />
            <span className={`relative grid h-8 w-8 place-items-center ${PX_BORDER} bg-[#d9d3ee] text-[#141024]`}>
              <Lock size={15} strokeWidth={3} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px]">{cat.emoji}</span>
              <h3 className="font-pixel truncate text-[10px] leading-[1.5] text-[#d9d3ee]">{art.name}</h3>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] font-bold text-[#a99fcf]">
              <MapPin size={12} strokeWidth={2.5} /> {art.district} · {cat.points} pts
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-[#e9e4fb]">
              <span className="font-vt mr-1 text-[16px] text-[#ffe08a]">🧭 HINT</span>
              {art.hint}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => onScan(art.id)}
            className={`${PX_BTN} font-vt flex flex-1 items-center justify-center gap-1.5 bg-[#ff9ecf] py-1.5 text-[17px] leading-none text-[#141024]`}
          >
            <Camera size={14} strokeWidth={2.5} /> Scan
          </button>
          <button
            type="button"
            onClick={() => onShowOnMap(art.id)}
            className={`${PX_BTN} font-vt flex flex-1 items-center justify-center gap-1.5 bg-[#9fd8ff] py-1.5 text-[17px] leading-none text-[#141024]`}
          >
            <MapPin size={14} strokeWidth={2.5} /> Show on map
          </button>
        </div>
      </article>
    );
  }

  return (
    <article ref={innerRef} className={`${PX_BORDER} shadow-[4px_4px_0_#141024] bg-[#fff7fb] text-[#241f3a]`}>
      <div className="relative aspect-[16/10] overflow-hidden border-b-[3px] border-[#141024]" style={{ background: cat.tint }}>
        {entry.photo ? (
          <img src={entry.photo} alt={`Your photo of ${art.name}`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PixelArt seed={art.id} category={art.category} className="h-full w-full p-4" />
        )}
        <div className="absolute left-2 top-2">
          <CategoryChip category={art.category} small />
        </div>
        <span className={`font-vt absolute right-2 top-2 inline-flex items-center gap-1 ${PX_BORDER} bg-[#8ff0c8] px-1.5 py-0.5 text-[15px] leading-none text-[#141024]`}>
          <Check size={12} strokeWidth={3} /> FOUND
        </span>
        <span className="font-vt absolute bottom-2 left-2 bg-[#141024]/80 px-1.5 py-0.5 text-[15px] leading-none text-[#fff7fb]">
          {formatDate(entry.at)}
        </span>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-pixel text-[11px] leading-[1.5]">{art.name}</h3>
          <span className="font-vt shrink-0 bg-[#ffe08a] px-1.5 text-[16px] leading-[20px]">+{cat.points}</span>
        </div>
        <p className="font-vt text-[19px] leading-tight text-[#5b4f8a]">{art.motif}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] font-bold text-[#7a6fae]">
          <MapPin size={12} strokeWidth={2.5} /> {art.district}
        </p>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`${PX_BTN} font-vt mt-2.5 flex w-full items-center justify-between bg-[#ece6ff] px-2.5 py-1.5 text-[18px] leading-none`}
        >
          <span>📜 {open ? 'Hide lore' : 'Read the lore'}</span>
          <ChevronDown size={16} strokeWidth={3} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="mq-fade-in mt-2.5 space-y-2 text-[13.5px] leading-relaxed">
            <p>{art.lore}</p>
            <p className="border-l-[3px] border-[#ff9ecf] pl-2 text-[12.5px] text-[#5b4f8a]">
              <span className="font-bold">Did you know?</span> {art.trivia}
            </p>
            <button
              type="button"
              onClick={() => onShowOnMap(art.id)}
              className="font-vt inline-flex items-center gap-1 text-[17px] text-[#5b4f8a] underline decoration-2 underline-offset-2"
            >
              <MapPin size={13} strokeWidth={2.5} /> Show on map
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function CollectionView({ unlocked, points, highlightId, onShowOnMap, onScan, onReset, sfx }) {
  const [view, setView] = useState('all');
  const [openId, setOpenId] = useState(highlightId ?? null);
  const [confirmReset, setConfirmReset] = useState(false);
  const cardRefs = useRef({});

  const found = ARTWORKS.filter((a) => unlocked[a.id]).length;
  const ratio = found / ARTWORKS.length;
  const perCat = Object.values(CATEGORIES).map((c) => {
    const items = ARTWORKS.filter((a) => a.category === c.id);
    return { ...c, total: items.length, found: items.filter((a) => unlocked[a.id]).length };
  });
  const list = ARTWORKS.filter((a) => (view === 'found' ? unlocked[a.id] : view === 'locked' ? !unlocked[a.id] : true));

  useEffect(() => {
    if (highlightId) cardRefs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlightId]);

  return (
    <div className="mq-grid-bg absolute inset-0 overflow-y-auto overscroll-contain p-3 pb-8">
      {/* Progress */}
      <section className={`${PX_BORDER} shadow-[4px_4px_0_#141024] bg-[#2a2448] p-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-pixel text-[11px] leading-none text-[#ffe0f0]">🏅 Collection &amp; Lore</h2>
          <span className="font-vt bg-[#b9a3ff] px-1.5 text-[16px] leading-[20px] text-[#141024]">{rankFor(ratio)}</span>
        </div>

        <p className="font-pixel mt-3 text-[10px] leading-[1.6] text-[#fff7fb]">
          <span className="text-[#ffe08a]">{found}</span> / {ARTWORKS.length} Artworks Discovered
        </p>

        <div
          className={`mt-2 flex h-6 gap-[3px] ${PX_BORDER} bg-[#141024] p-[3px]`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ARTWORKS.length}
          aria-valuenow={found}
          aria-label="Artworks discovered"
        >
          {ARTWORKS.map((a) => (
            <span
              key={a.id}
              className="h-full flex-1 transition-colors"
              style={{ background: unlocked[a.id] ? CATEGORIES[a.category].color : C.plumLight }}
              title={a.name}
            />
          ))}
        </div>

        <div className="font-vt mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[17px] leading-none text-[#d9d3ee]">
          {perCat.map((c) => (
            <span key={c.id}>
              {c.emoji} {c.found}/{c.total}
            </span>
          ))}
          <span className="ml-auto text-[#ffe08a]">
            🏆 {points}/{MAX_POINTS}
          </span>
        </div>
      </section>

      {/* View switch */}
      <div className={`mt-4 grid grid-cols-3 ${PX_BORDER} ${PX_SHADOW} bg-[#2a2448]`} role="tablist">
        {[
          ['all', `All ${ARTWORKS.length}`],
          ['found', `Found ${found}`],
          ['locked', `Locked ${ARTWORKS.length - found}`],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => (sfx.tap(), setView(id))}
            className={`font-vt py-1.5 text-[18px] leading-none ${
              view === id ? 'bg-[#ffe08a] text-[#141024]' : 'text-[#d9d3ee]'
            } ${id !== 'locked' ? 'border-r-[3px] border-[#141024]' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="mt-4 space-y-4">
        {list.length === 0 && (
          <div className={`${PX_BORDER} border-dashed bg-[#2a2448]/60 p-6 text-center`}>
            <p className="text-[34px]">{view === 'found' ? '🔍' : '🎉'}</p>
            <p className="font-vt mt-2 text-[20px] leading-tight text-[#d9d3ee]">
              {view === 'found' ? 'Nothing collected yet. Head to the map and scan your first artwork!' : 'Every artwork unlocked. You are a MUC Legend!'}
            </p>
          </div>
        )}
        {list.map((art) => (
          <ArtworkCard
            key={art.id}
            art={art}
            entry={unlocked[art.id]}
            open={openId === art.id}
            onToggle={() => (sfx.tap(), setOpenId((id) => (id === art.id ? null : art.id)))}
            onShowOnMap={onShowOnMap}
            onScan={onScan}
            innerRef={(el) => (cardRefs.current[art.id] = el)}
          />
        ))}
      </div>

      {/* Reset */}
      {found > 0 && (
        <div className="mt-8 flex justify-center">
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="font-vt text-[18px] text-[#d9d3ee]">Erase all progress?</span>
              <button
                type="button"
                onClick={() => (onReset(), setConfirmReset(false))}
                className={`${PX_BTN} font-vt bg-[#ff9ecf] px-2.5 py-1 text-[17px] leading-none text-[#141024]`}
              >
                Yes, reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className={`${PX_BTN} font-vt bg-[#fff7fb] px-2.5 py-1 text-[17px] leading-none text-[#141024]`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="font-vt inline-flex items-center gap-1.5 text-[17px] text-[#a99fcf] underline decoration-2 underline-offset-2"
            >
              <RotateCcw size={14} strokeWidth={2.5} /> Reset progress
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* 10. REWARD MODAL                                                            */
/* ========================================================================== */

function RewardModal({ reward, onCollection, onKeepHunting }) {
  const { art, photo, isNew, points, confidence } = reward;
  const cat = CATEGORIES[art.category];
  const closeRef = useRef(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-[#0d0a1a]/80 p-4" role="dialog" aria-modal="true" aria-labelledby="mq-reward-title">
      {isNew && <Confetti />}
      <div className={`mq-pop relative flex max-h-full w-full flex-col overflow-hidden ${PX_BORDER} shadow-[6px_6px_0_#141024] bg-[#fff7fb] text-[#241f3a]`}>
        <div className="font-pixel flex items-center justify-center gap-2 border-b-[3px] border-[#141024] py-2.5 text-[10px] leading-none" style={{ background: cat.color }}>
          <span className="mq-blink">★</span> {isNew ? 'Artwork Verified' : 'Already Collected'} <span className="mq-blink">★</span>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="flex gap-3">
            <div className={`relative h-24 w-24 shrink-0 overflow-hidden ${PX_BORDER}`} style={{ background: cat.tint }}>
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <PixelArt seed={art.id} category={art.category} className="h-full w-full p-2" />
              )}
              <span className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center border-2 border-[#141024] bg-[#8ff0c8]">
                <Check size={14} strokeWidth={3.5} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-vt text-[16px] leading-none text-[#7a6fae]">AI MATCH {confidence}%</p>
              <h2 id="mq-reward-title" className="font-pixel mt-1.5 text-[11.5px] leading-[1.5]">
                {art.name}
              </h2>
              <p className="font-vt mt-0.5 text-[18px] leading-tight text-[#5b4f8a]">{art.motif}</p>
            </div>
          </div>

          <div className={`mq-bump mt-4 flex items-center justify-center gap-2 ${PX_BORDER} bg-[#ffe08a] py-3`}>
            {isNew ? (
              <span className="font-pixel text-[18px] leading-none">+{points} PTS</span>
            ) : (
              <span className="font-vt text-[20px] leading-none">📷 Photo updated in your collection</span>
            )}
          </div>

          <div className="mt-4">
            <p className="font-vt text-[18px] leading-none text-[#7a6fae]">📜 {isNew ? 'LORE UNLOCKED' : 'LORE'}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed">{art.lore}</p>
          </div>
        </div>

        <div className="flex gap-2 border-t-[3px] border-[#141024] bg-[#ece6ff] p-3">
          <button
            type="button"
            onClick={onCollection}
            className={`${PX_BTN} font-pixel flex-1 bg-[#b9a3ff] px-2 py-3 text-[9px] leading-[1.4] text-[#141024]`}
          >
            🏅 Collection
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onKeepHunting}
            className={`${PX_BTN} font-pixel flex-1 bg-[#ff9ecf] px-2 py-3 text-[9px] leading-[1.4] text-[#141024]`}
          >
            🗺️ Keep Hunting
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* 11. GLOBAL CSS                                                              */
/* ========================================================================== */

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800&family=Press+Start+2P&family=VT323&display=swap');

html, body, #root { height: 100%; margin: 0; background: #141024; }
body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; font-family: 'Nunito', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button, a { touch-action: manipulation; }
button:focus-visible, a:focus-visible, select:focus-visible { outline: 3px solid #ffe08a; outline-offset: 2px; }
select option, select optgroup { font-family: 'Nunito', system-ui, sans-serif; font-size: 15px; color: #141024; }

.font-pixel { font-family: 'Press Start 2P', ui-monospace, monospace; letter-spacing: .02em; }
.font-vt { font-family: 'VT323', ui-monospace, monospace; }

.mq-grid-bg {
  background-color: #1d1934;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 16px 16px;
}
.mq-scanlines { background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 2px, transparent 2px 4px); }
.mq-noscrollbar { scrollbar-width: none; }
.mq-noscrollbar::-webkit-scrollbar { display: none; }

.mq-press { transition: transform .06s, box-shadow .06s; }
.mq-press:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: 0 0 0 #141024 !important; }

@keyframes mq-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
.mq-bob { animation: mq-bob 1.2s steps(2) infinite; }
@keyframes mq-bump { 0% { transform: scale(.85) } 60% { transform: scale(1.1) } 100% { transform: scale(1) } }
.mq-bump { animation: mq-bump .35s steps(4); }
@keyframes mq-blink { 50% { opacity: 0 } }
.mq-blink { animation: mq-blink 1s steps(1) infinite; }
@keyframes mq-spin { to { transform: rotate(360deg) } }
.mq-spin { animation: mq-spin 1s steps(8) infinite; }
@keyframes mq-laser { 0% { top: 8% } 50% { top: 90% } 100% { top: 8% } }
.mq-laser { top: 8%; animation: mq-laser 2.4s ease-in-out infinite; }
@keyframes mq-fill { from { width: 0 } to { width: 100% } }
.mq-fill { width: 0; animation: mq-fill linear forwards; }
@keyframes mq-pop { 0% { transform: scale(.7); opacity: 0 } 70% { transform: scale(1.04); opacity: 1 } 100% { transform: scale(1) } }
.mq-pop { animation: mq-pop .32s steps(5); }
@keyframes mq-drawer-in { from { transform: translateY(105%) } to { transform: translateY(0) } }
.mq-drawer-in { animation: mq-drawer-in .26s cubic-bezier(.2,.9,.3,1.15); }
@keyframes mq-toast { 0% { transform: translateY(-12px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }
.mq-toast { animation: mq-toast .2s steps(3); }
@keyframes mq-fade-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
.mq-fade-in { animation: mq-fade-in .2s ease-out; }

.mq-loader { position: relative; width: 48px; height: 48px; }
.mq-loader span { position: absolute; width: 12px; height: 12px; background: #b9a3ff; opacity: .2; animation: mq-loader .8s steps(1) infinite; }
.mq-loader span:nth-child(1) { left: 0; top: 0 }      .mq-loader span:nth-child(2) { left: 18px; top: 0 }
.mq-loader span:nth-child(3) { left: 36px; top: 0 }   .mq-loader span:nth-child(4) { left: 36px; top: 18px }
.mq-loader span:nth-child(5) { left: 36px; top: 36px } .mq-loader span:nth-child(6) { left: 18px; top: 36px }
.mq-loader span:nth-child(7) { left: 0; top: 36px }   .mq-loader span:nth-child(8) { left: 0; top: 18px }
@keyframes mq-loader { 0% { opacity: 1; background: #ff9ecf } 12% { opacity: .55; background: #b9a3ff } 25%, 100% { opacity: .2 } }

.mq-confetti { position: absolute; top: -16px; box-shadow: 2px 2px 0 rgba(20,16,36,.6); animation-name: mq-fall; animation-timing-function: cubic-bezier(.25,.6,.45,1); animation-fill-mode: forwards; }
@keyframes mq-fall { to { transform: translate(var(--drift), 105dvh) rotate(var(--spin)); } }

/* ---- Leaflet overrides ---- */
.leaflet-container { background: #1b1830; font-family: 'Nunito', system-ui, sans-serif; }
.leaflet-container img { max-width: none !important; max-height: none !important; }
.leaflet-control-attribution { background: rgba(20,16,36,.75) !important; color: #a99fcf !important; font-size: 9px !important; line-height: 1.3 !important; }
.leaflet-control-attribution a { color: #ff9ecf !important; }
.mq-pin-wrap { background: none !important; border: none !important; }
.mq-pin { position: relative; width: 40px; height: 44px; display: flex; flex-direction: column; align-items: center; cursor: pointer; }
.mq-pin-head { position: relative; width: 36px; height: 36px; display: grid; place-items: center; background: var(--pin); border: 3px solid #141024; box-shadow: 3px 3px 0 #141024; font-size: 18px; line-height: 1; }
.mq-pin-tail { position: relative; width: 12px; height: 4px; background: #141024; }
.mq-pin-tail::after { content: ''; position: absolute; left: 4px; top: 4px; width: 4px; height: 4px; background: #141024; }
.mq-pin-badge { position: absolute; top: -9px; right: -9px; width: 17px; height: 17px; display: grid; place-items: center; font-style: normal; font-size: 9px; line-height: 1; background: #fff7fb; border: 2px solid #141024; color: #141024; }
.is-unlocked .mq-pin-badge { background: #ffe08a; font-size: 11px; }
.is-locked .mq-pin-head > span { filter: grayscale(.85) brightness(.9); opacity: .85; }
.is-locked .mq-pin-head { background: color-mix(in srgb, var(--pin) 45%, #3a3363); }
.is-selected { animation: mq-hop .7s steps(2) infinite; }
.is-selected .mq-pin-head { outline: 3px solid #fff7fb; outline-offset: 2px; }
@keyframes mq-hop { 50% { transform: translateY(-6px) } }

.mq-sketch {
  background-color: #1b1830 !important;
  background-image: linear-gradient(rgba(185,163,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(185,163,255,.06) 1px, transparent 1px);
  background-size: 24px 24px;
}
.mq-label { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-family: 'VT323', ui-monospace, monospace; font-size: 15px; line-height: 1; letter-spacing: .08em; text-transform: uppercase; color: #8a80b8; text-shadow: 2px 2px 0 #141024; pointer-events: none; }
.mq-label.big { font-size: 19px; color: #c9bff0; }
.mq-label.water { color: #9fd8ff; font-style: italic; }
.mq-label.park { color: #8ff0c8; font-size: 14px; }
.mq-label.stn { color: #ffe08a; font-size: 14px; }

.mq-user { position: relative; width: 22px; height: 22px; }
.mq-user-dot { position: absolute; inset: 3px; background: #9fd8ff; border: 3px solid #141024; }
.mq-user-ring { position: absolute; inset: -6px; border: 3px solid #9fd8ff; animation: mq-ring 1.6s ease-out infinite; }
@keyframes mq-ring { from { transform: scale(.6); opacity: .9 } to { transform: scale(1.6); opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  .mq-confetti, .mq-laser { display: none; }
  .mq-bob, .mq-blink, .is-selected, .mq-user-ring, .mq-drawer-in, .mq-pop { animation: none !important; }
}
`;

function GlobalStyles() {
  return <style>{GLOBAL_CSS}</style>;
}

/* ========================================================================== */
/* 12. APP                                                                     */
/* ========================================================================== */

export default function App() {
  const [save, setSave] = useSaveGame();
  const { unlocked, sound } = save;

  const [tab, setTab] = useState('map');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [scanTargetId, setScanTargetId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [reward, setReward] = useState(null);
  const [toast, showToast] = useToast();
  const sfx = useSfx(sound);

  const points = useMemo(
    () => Object.keys(unlocked).reduce((sum, id) => sum + (ART_BY_ID[id] ? CATEGORIES[ART_BY_ID[id].category].points : 0), 0),
    [unlocked],
  );
  const found = Object.keys(unlocked).filter((id) => ART_BY_ID[id]).length;

  /** Default scan target: nearest locked artwork (or first locked one without GPS). */
  const defaultTargetId = useMemo(() => {
    const locked = ARTWORKS.filter((a) => !unlocked[a.id]);
    const pool = locked.length ? locked : ARTWORKS;
    if (!userPos) return pool[0].id;
    return [...pool].sort((a, b) => distanceMeters(userPos, a) - distanceMeters(userPos, b))[0].id;
  }, [unlocked, userPos]);
  const targetId = scanTargetId ?? defaultTargetId;

  const goTab = (next) => {
    if (next === tab) return;
    sfx.tap();
    setTab(next);
    setSelectedId(null);
    setHighlightId(null);
  };

  const selectArtwork = (id) => {
    if (id && id !== selectedId) sfx.open();
    setSelectedId(id);
  };

  const startScan = (id) => {
    sfx.open();
    setScanTargetId(id);
    setSelectedId(null);
    setTab('scan');
  };

  const showOnMap = (id) => {
    sfx.tap();
    setFilter('all');
    setTab('map');
    setSelectedId(id);
  };

  const toggleSound = () => {
    const next = !sound;
    setSave((s) => ({ ...s, sound: next }));
    if (next) sfx.preview();
  };

  const handleVerified = (id, photo) => {
    const art = ART_BY_ID[id];
    const isNew = !unlocked[id];
    setSave((s) => ({
      ...s,
      unlocked: { ...s.unlocked, [id]: { at: s.unlocked[id]?.at ?? Date.now(), photo: photo ?? s.unlocked[id]?.photo ?? null } },
    }));
    setReward({
      art,
      photo,
      isNew,
      points: isNew ? CATEGORIES[art.category].points : 0,
      confidence: (92 + Math.random() * 7.5).toFixed(1),
    });
    sfx.success();
    navigator.vibrate?.([30, 40, 60]);
  };

  const closeReward = (destination) => {
    const id = reward?.art.id;
    setReward(null);
    setScanTargetId(null);
    sfx.tap();
    if (destination === 'collection') {
      setHighlightId(id);
      setTab('collection');
    } else {
      setTab('map');
    }
  };

  const resetProgress = () => {
    setSave((s) => ({ ...s, unlocked: {} }));
    setHighlightId(null);
    showToast('Progress reset — a fresh quest begins!');
  };

  return (
    <div id="mq-app" className="relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#1d1934] text-[#fff7fb] select-none">
      <GlobalStyles />

      <Header points={points} sound={sound} onToggleSound={toggleSound} />

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {/* The map stays mounted so Leaflet keeps its state between tabs. */}
        <div className={tab === 'map' ? 'absolute inset-0' : 'pointer-events-none invisible absolute inset-0'} aria-hidden={tab !== 'map'}>
          <MapView
            active={tab === 'map'}
            unlocked={unlocked}
            filter={filter}
            onFilter={setFilter}
            selectedId={selectedId}
            onSelect={selectArtwork}
            userPos={userPos}
            onUserPos={setUserPos}
            onScan={startScan}
            toast={showToast}
            sfx={sfx}
          />
        </div>

        {tab === 'scan' && (
          <ScanView
            unlocked={unlocked}
            targetId={targetId}
            onTarget={setScanTargetId}
            onVerified={handleVerified}
            sfx={sfx}
            toast={showToast}
          />
        )}

        {tab === 'collection' && (
          <CollectionView
            unlocked={unlocked}
            points={points}
            highlightId={highlightId}
            onShowOnMap={showOnMap}
            onScan={startScan}
            onReset={resetProgress}
            sfx={sfx}
          />
        )}

        <Toast toast={toast} />
      </main>

      <BottomNav tab={tab} onChange={goTab} found={found} />

      {reward && (
        <RewardModal
          reward={reward}
          onCollection={() => closeReward('collection')}
          onKeepHunting={() => closeReward('map')}
        />
      )}
    </div>
  );
}
