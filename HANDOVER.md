# Eastman Film Lab — Roll Viewer · Build Handover

**Owner:** Bryan Kim, Eastman Film Lab
**Status as of 2026-10-25:** Phases 1 and 2 are done and were reviewed with Bryan screen by screen. Phases 3 and 4 have not started.
**Live demo (private, Bryan's account):** https://claude.ai/artifact/QDrJnpMZgMYDAjYqRKyAas
**Original brief:** [`docs/ORIGINAL-BRIEF.md`](docs/ORIGINAL-BRIEF.md). This document wins wherever the two disagree. Several parts of the brief were changed on purpose during review; see §3.

---

## 1. What this is

A no-login web viewer for one scanned roll of film. The customer scans the QR on the negative sleeve, opens `/r/{ROLLCODE}`, and goes through the roll frame by frame. They mark each frame keep (O) or out (X), write notes, choose prints, and send their picks to the lab. The **marked contact sheet image** is the customer's main takeaway.

The audience is **mostly on phones**. Every layout decision starts from a 375px-wide screen.

## 2. Getting started

```bash
npm install
npm run sample        # makes 36 placeholder scans and ingests them into public/rolls/K7QM2XW9PA
npm run dev           # open http://localhost:5173/r/K7QM2XW9PA
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server. `/r/{code}` opens a roll; `/demo` opens the photo-picker demo |
| `npm run build` | Type-check and production build into `dist/` |
| `npm run demo` | One self-contained HTML file in `demo-dist/index.html`: code and the OCR-A font inlined, no sample rolls. It starts from a photo picker. Copy it over `eastman-loupe-demo.html` |
| `npm run ingest -- <scanDir> --stock "Portra 400" --date 2026-10-17 --roll 0412` | Turns a folder of lab scans into a roll (see §5) |
| `npm run sample` | Placeholder roll for development (synthetic images, not real scans) |

Requires Node 20+ (built on 22). `sharp` is a dev dependency used only by the scripts.

`public/rolls/` and `samples/` are not committed. Run `npm run sample` after cloning.

## 3. Product decisions made in review (do not undo)

These came from Bryan directly, often after he rejected an earlier version. Treat them as requirements.

**Mobile first**
- Phones are the primary device. Check every change at 375×812 first.
- On the contact sheet, note text is a fixed **10% of frame width** with no minimum or maximum. A phone and the full screen must show the same frame-to-text ratio, even though that means 5.4px text on a phone. The sheet exists mainly for export.

**Two views, one toggle**
- **Frame by frame** (default, `src/gate.ts`): one landscape frame on a horizontal film strip. Swipe sideways to wind on. A scrubber sits below.
- **Contact sheet** (`src/sheet.ts`): the whole roll laid out like the lab's printed contact sheet, with the customer's marks and notes on it.
- The toggle in the bottom bar switches between these two. Turning the phone does not switch views.
- **Removed:** the brief's "Light Table" line view and the vertical "Gate" layout. Frames are never shown vertical or rotated.
- **Rejected twice, do not bring back:** any "loupe" styling. That means a lens body over the strip, or a light box with a draggable magnifier. Bryan's word: "tacky". Also rejected: dimmed or blurred neighbour frames ("bokeh").

**The film strip never runs past the photos**
- Frame by frame: the visible strip is clipped to exactly one photo's width. No film leader, no neighbouring frames peeking in.
- Contact sheet, both on screen and in the exported image: each strip starts and ends at its outer photos, as on the printed sheet.

**Contact sheet look = the lab's existing tool**
- The reference is `webapp/index-ocr.html` in Bryan's Eastman folder (not in this repo). It is the contact-sheet and gallery-video tool the lab already uses.
- From it: near-black film `#080809`, sprocket holes `#1a1917`, a continuous OCR-A edge print in `#8f4d23` (DX-style barcode + `EASTMAN FILM LAB` + roll code), frame numbers in brand orange `#f6853d` with a small tick, and a header of wordmark + "film develop service" + roll code / date / frame count.
- All film styling lives in `src/film.ts` and the `.film` block of `src/styles.css`.
- **This overrides the brief's** orange-brown rebate (`#3a2414`) and its `12  12A` numbering.

**System UI vs. the customer's own marks**
- The interface (buttons, tally, hints, sheets, dialogs) stays plain: Helvetica, OCR-A for counters, pill buttons, the brief's §3 tokens. Bryan: "the system parts stay as is."
- Only what the customer makes is handwritten: the keep/out marks, note text, the ✱ note indicator on the rebate, and the ↳ arrow that ties a note to its frame.
- Handwriting font: **Kalam** (Caveat was "a bit tacky"). Korean falls back to **Nanum Pen Script**. That is an approved exception to the brand rule against Nanum fonts, because it is customer handwriting, not brand text.

**Marks = a teacher marking a maths test**
- Keep: an orange O in `#f6853d` at 70% opacity. Out: a black X at 70% opacity.
- One clean, confident stroke each. The O runs slightly past its start; the X is two straight lines. "Hand drawn does not mean sloppy": no wobble, no crayon texture, no highlighter, no white outline.
- Paths come from `markPaths()` in `src/marks.ts`, seeded per frame so they stay the same on reload. On-screen SVG and the exported image share them.
- Tapping a mark clears it; marks are three-state: none, keep, out.

**Notes**
- Frame by frame: the note sits under the strip at 12px with a ↳ arrow.
- Contact sheet: each note is centred under its own frame with a small hand-drawn ↳ arrow, at most 2 lines.
- The note editor is a bottom sheet with plain chrome. The text you type is handwritten, at 18px so iOS does not zoom.

**Sending to the lab**
- Send **frame numbers and requests only, never images**. The payload is `store.picks()` in `src/store.ts` (shape `Picks` in `src/types.ts`).
- Print requests per frame: number of copies plus size **3×5 or 4×6**. Picking a size starts at 1 copy. There is also a free-text box for anything else (e.g. "Frame 7 a little brighter").
- The **contact sheet image** is always reachable: the download icon in the bottom bar, plus the card at the top of the picks screen.
- **Dropped:** "Download kept (ZIP)" and the PDF contact sheet.

## 4. Code map

```
src/
  main.ts         routing (/r/:code, /demo), cover, viewer chrome, mode toggle, keys, note sheet
  types.ts        Manifest, Frame, RollSession, Picks, PrintRequest, ViewActions
  store.ts        single source of truth: marks, notes, prints, active frame; localStorage; picks()
  film.ts         frame cell + edge-print ribbon (the only film-markup code)
  gate.ts         frame-by-frame view: clipped strip, swipe, vertical flick to mark, hold for note, scrubber
  sheet.ts        contact-sheet view with marks and per-frame notes
  sheetimage.ts   canvas renderer for the marked contact sheet (JPEG ~3200×4000) + save flow
  marks.ts        keep/out mark paths and inks (shared by SVG and canvas)
  loupe.ts        full-screen single frame (double-tap / Space), 1:1 zoom and pan
  summary.ts      picks screen: print requests, lab note, send, contact-sheet card
  icons.ts        plain system icons and action buttons
  img.ts          <picture> builder (AVIF → WebP), srcUrl(), screen-image preloading
  demo.ts         builds a roll in the browser from picked photos (shrinks them on the device, uploads nothing)
  styles.css      tokens, chrome, film block, views, marks, sheets
  fonts/ocr-a.ttf OCR-A (Tsukurimashou build, free for commercial use)
scripts/
  ingest-roll.mjs       scans → thumb/screen AVIF+WebP, full JPEG, manifest.json
  make-sample-scans.mjs synthetic placeholder roll
public/_redirects       Cloudflare Pages SPA routing for /r/* and /lab/*
```

**Interaction map (as built)**

| Action | Touch | Keyboard |
|---|---|---|
| Next / previous frame | swipe sideways, or drag the scrubber | ← → |
| Keep | Keep button, or flick the frame up | F |
| Out | Out button, or flick the frame down | X |
| Clear | tap the mark, or tap the same button again | 0 |
| Note | Note button, or hold the frame | N |
| Full screen | double-tap | Space / Enter |
| Next unmarked | button on the picks screen | U |
| Contact sheet | toggle icon in the bottom bar | — |

Bundle: about 14 KB of JS and 5 KB of CSS gzipped, against the brief's 60 KB budget.

## 5. Data and images

- A roll is `public/rolls/{CODE}/manifest.json` plus `thumb/` (480px), `screen/` (2048px) and `full/` (original JPEG; never loaded by the viewer). Thumb and screen come as AVIF and WebP.
- Roll codes: 10+ characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L, because they're printed on sleeves). `ingest-roll.mjs` generates one if `--code` is omitted.
- Session state is in `localStorage` under the key `eastman-loupe:{CODE}`. Wrap any new storage access in try/catch.
- The lab's own roll ID format elsewhere is `EL-YYYYMMDD-NNN` (twin-check sticker number). This viewer uses the unguessable code from the brief. Mapping between the two is a Phase 3 decision.

## 6. What's next

**Phase 3: backend, send, lab view** (from the brief §7–§8, adjusted by §3 above)
- Endpoints: `GET /api/roll/:code`, `PUT /api/roll/:code/session` (debounced from `Store.save()`), `POST /api/roll/:code/submit` with `store.picks()` as the body.
- Until then, Send shares the picks as text (share sheet, then clipboard, then a box to copy from). Replace that in `src/summary.ts`.
- `/lab/:code`: the same viewer, read-only, with marks, notes and print requests visible.
- Suggested stack: Cloudflare Pages + R2 + a Worker with D1 or KV. The lab already runs a Worker + R2 + Pages setup for print intake, deployed with `wrangler`.
- **R2 must send CORS headers** for the image paths. Otherwise the contact-sheet export canvas is tainted and fails.
- Open with Bryan: where lab notifications go (email, KakaoTalk via SOLAPI, or a sheet), the domain/URL pattern, and how `EL-…` IDs map to roll codes.

**Phase 4: narrate**: not started. The brief §5 still applies.

**Known gaps**
- Never tested on a real iPhone or Android; only Chrome's phone emulation. Do a Safari pass first.
- No real scans yet: the sample roll is synthetic. Ask Bryan for a real roll and run `ingest-roll.mjs` on it.
- Demo mode drops files the browser can't decode (e.g. HEIC on non-Safari browsers).
- In the claude.ai artifact viewer, the Web Share API is blocked. There, Save image goes through the viewer's `downloads` capability and Send falls back to copyable text. A normal browser uses Web Share and downloads directly.
- The brief §9 acceptance targets ("< 1MB initial", "60fps on a mid-range phone", "replay sync < 150ms") have not been measured on devices.

## 7. Deliverables in this repo

| File | What |
|---|---|
| `HANDOVER.md` | this document |
| `docs/ORIGINAL-BRIEF.md` | Bryan's original build brief, for reference |
| `README.md` | quick start and file map |
| `eastman-loupe-demo.html` | built single-file demo: open it in a browser and pick photos |
| `src/`, `scripts/`, config | the app |
