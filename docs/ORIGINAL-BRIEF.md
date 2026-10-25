# Eastman Lab — Roll Viewer ("Loupe") · Original Build Brief

> Kept for reference. This is the brief as Bryan first wrote it, before review.
> Several parts were changed on purpose afterwards (no Light Table, no vertical Gate,
> contact-sheet styling taken from the lab's existing tool, sharpie marks, numbers-only
> sending, contact-sheet image instead of ZIP/PDF). **[`HANDOVER.md`](../HANDOVER.md) §3 wins
> wherever the two disagree.**

---

**For:** Claude Code
**Owner:** Bryan Kim, Eastman Lab
**Goal:** A lightweight, no-login web viewer where a film lab customer opens their scanned roll from a QR code, inspects it frame by frame, marks keeps and rejects, optionally narrates their picks, and sends the selection back to the lab.

---

## 0. Before you start

- **Ask Bryan for the existing contact sheet design file.** The new viewer must match it exactly in frame rendering, rebate detail, numbering and type. Until it arrives, build from the tokens in §3 and keep the frame component isolated so it can be restyled in one place.
- Brand reference: the live artifact "Eastman Lab — The Photobook Library" uses the same identity system. Mirror its spacing, eyebrow labels and button styles.
- Build in phases (§9). Ship Phase 1 working end to end before touching recording.

---

## 1. Product summary

One link per roll: `/r/{ROLLCODE}`. The roll code is printed on the negative sleeve as a QR code. No app, no account.

Two viewing modes over the same data:

| Mode | When | Feel |
|---|---|---|
| **Light Table** | Landscape, ≥ 900px wide | One horizontal strip across the full width, dragged like a negative over a light box |
| **Gate** | Portrait / phones | One frame per screen, vertical snap scroll, like film moving through a camera gate |

Mode switches automatically on orientation, with a manual toggle in the header. Marks, position and notes are shared across both.

---

## 2. Screens

### 2.1 Roll cover (entry)
- Full black screen. Eastman Lab wordmark top-left, roll code + film stock + date top-right as eyebrow text.
- Centre: roll title in Georgia (e.g. "Roll 0412 — Portra 400"), frame count, a single "Open roll" pill button.
- Background: a very faint, blurred crop of frame 1.

### 2.2 Light Table (landscape)
- One strip of 6 frames fills the viewport width. The strip scrolls horizontally through the whole roll continuously (not paged), with drag, trackpad, wheel and arrow keys.
- **Rebate:** dark orange-brown film base above and below frames, sprocket holes, amber frame numbers in the style `12  12A` between frames, DX/edge print text ("EASTMAN · PORTRA 400 · 5") along the edge. Pure CSS/SVG, no images.
- **Loupe focus:** the frame nearest the horizontal centre is the active frame. It brightens slightly and gets a thin amber outline; neighbours sit at ~70% brightness.
- **Next strip preview:** a dimmed copy of the following 6 frames sits below the active strip (Bryan's "line by line" idea). Clicking it scrolls there.
- Bottom bar: frame counter / tally, mode toggle, "Narrate", "Send picks".
- Click active frame → **Loupe overlay**: full-screen frame, 1:1 zoom on click-drag, ESC to close.

### 2.3 Gate (portrait)
- One frame per screen, `scroll-snap-type: y mandatory`.
- The rebate runs vertically down the left edge (sprocket holes + frame numbers), so the frame sits in a "gate".
- Gestures: swipe right = keep, swipe left = reject, double-tap = zoom, long-press = add note. Visible buttons as well (keep / reject / note) for accessibility and discoverability.
- Small progress rail on the right edge showing all frames as ticks, coloured by mark state.

### 2.4 Summary / Send
- Grid of kept frames, then a collapsed list of rejected ones.
- Optional note to the lab (free text).
- Primary actions: **Send picks to lab**, **Download kept (ZIP)**, **Download contact sheet (PDF)**.

---

## 3. Visual system

```css
:root {
  --bg: #000000;
  --surface: #10100f;
  --line: #292723;
  --ink: #eae7e0;
  --muted: #99968e;
  --accent: #b88a5d;          /* amber: frame numbers, keep marks, focus */
  --reject: #c2412d;          /* grease-pencil red */
  --rebate: #3a2414;          /* film base */
  --rebate-ink: #d9a35a;      /* edge print + numbers on base */
  --display: Georgia, 'Times New Roman', serif;
  --body: Helvetica, 'Helvetica Neue', Arial, sans-serif;
}
```

- Eyebrow labels: uppercase, 8–9px, letter-spacing ~1.8px, `--muted`.
- Titles: Georgia, normal weight, slight negative tracking.
- Pills: `#d4cbbb` background, dark text, 24px radius (as in the Photobook Library).
- Respect `prefers-reduced-motion`: marks appear without the draw animation.

### 3.1 Grease-pencil marks (signature detail)
- **Keep:** hand-drawn amber circle around the frame. **Reject:** scrawled red cross over the frame.
- Implement as SVG paths with slight jitter; animate with `stroke-dashoffset` over ~350ms so they look drawn.
- Generate 3–4 path variants per mark type and pick one from a seed of the frame ID, so marks look hand-made but stable across reloads.
- Tapping a marked frame's mark again clears it. Marks are a tri-state: `none | keep | reject`.

### 3.2 Tally
Bottom of both modes, film-counter style: `36 FRAMES · 8 KEPT · 11 OUT · 17 UNMARKED`.

---

## 4. Interaction map

| Action | Light Table | Gate |
|---|---|---|
| Next / previous frame | → / ← , drag, wheel | Swipe up / down |
| Keep | `F` or click keep icon | Swipe right or keep button |
| Reject | `X` or click reject icon | Swipe left or reject button |
| Clear mark | `0` or tap mark | Tap mark |
| Zoom | Click frame / `Space` | Double-tap |
| Note | `N` | Long-press |
| Jump to unmarked | `U` | Button in summary |

All keyboard actions apply to the active frame. Show a one-time hint strip with the shortcuts on first visit.

---

## 5. Narrate (recording)

Real screen recording is not possible in mobile browsers (no `getDisplayMedia` on iOS Safari). Instead:

- Record **microphone audio** with `MediaRecorder` (`audio/webm;codecs=opus`, fall back to `audio/mp4` on Safari).
- Simultaneously record an **event log**: `{t, type, frame, value}` for every scroll position change (throttled ~10/s), mark, zoom and note.
- **Replay** plays the audio while re-driving the viewer from the log, so it looks like a screen recording. Show a red "REPLAY" eyebrow and lock input during playback.
- Payload: one audio file + a small JSON. A 3-minute narration should be < 2MB.
- On desktop only, optionally offer true screen capture via `getDisplayMedia` as a secondary option; not required for v1.
- Lab-side rendering of a replay to MP4 is out of scope for v1; leave a clean replay API so it can be scripted with a headless browser later.

---

## 6. Keeping it light

### 6.1 Image pipeline (build-time script)
`scripts/ingest-roll.mjs` using `sharp`:

- Input: a folder of lab scans (`ROLLCODE/*.jpg|tif`).
- Outputs per frame:
  - `thumb` — 480px long edge, AVIF + WebP, target ~20KB (strip + summary grid)
  - `screen` — 2048px long edge, AVIF + WebP, target ~250KB (gate, loupe)
  - `full` — original JPEG, download only, never loaded in the viewer
- Writes `manifest.json`: roll code, stock, date, frame list with numbers (`1`, `1A`…), dimensions, orientation, dominant colour (for placeholders), and file paths.
- Generate a tiny blurred placeholder colour per frame so nothing flashes white.

### 6.2 Loading rules
- Initial load: HTML + CSS + JS + manifest + first strip's thumbs. **Target < 1MB, interactive < 2s on 4G.**
- Light Table: thumbs for the whole roll lazily; screen images for active frame ±2.
- Gate: screen images for active frame ±2, released when > 6 away.
- Use `<picture>` with AVIF → WebP fallback, `loading="lazy"`, `decoding="async"`, explicit width/height.

### 6.3 Stack
- Vite + vanilla TypeScript, no UI framework. Target JS bundle < 60KB gzipped.
- Static hosting for the viewer and images (Cloudflare Pages + R2, or equivalent).
- One tiny backend for marks and uploads (Cloudflare Worker + KV/D1, or Supabase). Endpoints in §7.
- Marks save to `localStorage` immediately (wrapped in try/catch) and sync to the backend debounced, so the viewer works offline and survives refresh.

---

## 7. Data

```ts
type Mark = 'none' | 'keep' | 'reject';

interface FrameState { id: string; mark: Mark; note?: string; updatedAt: number; }

interface RollSession {
  rollCode: string;
  frames: Record<string, FrameState>;
  labNote?: string;
  submittedAt?: number;
  narrations?: { id: string; audioUrl: string; logUrl: string; duration: number }[];
}
```

API:
- `GET  /api/roll/:code` → manifest + saved session
- `PUT  /api/roll/:code/session` → upsert marks/notes
- `POST /api/roll/:code/submit` → lock picks, notify lab (email or webhook)
- `POST /api/roll/:code/narration` → upload audio + log (signed URL)

Roll codes must be unguessable (≥ 10 random characters). No other auth in v1. **Rolls are private to the customer and the lab** — no shared voting in v1, but keep the session model able to hold multiple authors later.

---

## 8. Outputs

- **Picks to lab:** submitted session JSON + a lab-facing view at `/lab/:code` (same viewer, read-only, with marks and notes visible) for reprint and scan orders.
- **Download kept:** ZIP of full-res kept frames, built server-side or streamed.
- **Marked contact sheet:** route `/r/:code/sheet` with print CSS laid out like the original contact sheet (A4 / Letter), grease-pencil marks drawn on, roll metadata in the margin. Customers save it via browser print-to-PDF; also offer a PNG export via canvas.

---

## 9. Phases & acceptance

**Phase 1 — Viewer**
- Ingest script producing manifest + image sizes for a sample roll (Bryan to supply scans; use placeholders until then).
- Cover, Light Table, Gate, loupe zoom, auto mode switching.
- ✅ 36-frame roll opens under 1MB initial transfer; smooth 60fps drag on a mid-range phone.

**Phase 2 — Marking**
- Keep / reject / clear / notes, grease-pencil animation, tally, local persistence.
- ✅ Marks survive refresh and mode switches; keyboard and touch both work.

**Phase 3 — Send & outputs**
- Backend sync, submit, lab view, ZIP, contact sheet print route.
- ✅ Lab receives a notification with a working `/lab/:code` link.

**Phase 4 — Narrate**
- Audio + event log recording, upload, replay.
- ✅ Replay on iPhone Safari stays in sync with audio within ~150ms over a 3-minute narration.

---

## 10. Open items for Bryan

1. Original contact sheet file (blocking for final visuals). *Resolved: `webapp/index-ocr.html`.*
2. A real sample roll of scans for testing.
3. Hosting and backend choice, and where lab notifications should go (email address or tool).
4. Domain / URL pattern for customer links.
