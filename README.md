# Eastman Film Lab — Roll Viewer ("Loupe")

No-login viewer for one scanned roll: `/r/{ROLLCODE}` (the QR on the sleeve).
Vite + vanilla TypeScript. **Start with [`HANDOVER.md`](HANDOVER.md)**: current state, the design decisions made in review, and what comes next.

## Run

```
npm install
npm run sample        # 36 placeholder scans → public/rolls/K7QM2XW9PA (not committed)
npm run dev           # http://localhost:5173/r/K7QM2XW9PA · lab view /lab/K7QM2XW9PA
```

The dev server runs the real backend (`worker/handler.ts`) on `/api/*`, with sessions in `.dev-data/`.

## Deploy (Cloudflare Worker + R2 + KV)

```
npm run deploy                # build + npx wrangler deploy; one-time setup in HANDOVER.md §6
npm run upload -- K7QM2XW9PA  # copy an ingested roll to R2
```

## Demo (pick your own photos)

```
npm run demo          # → demo-dist/index.html, one self-contained file
```

Copied to `eastman-loupe-demo.html`. Open it in a browser (or `/demo` on the dev server), pick photos, and the whole viewer runs on them. Photos are shrunk in the browser and never uploaded. Needs internet only for the handwriting font.

## Ingest a real roll

```
npm run ingest -- path/to/scans --stock "Portra 400" --date 2026-10-17 --roll 0412
```

Omit `--code` and a fresh 10-character code (no 0/O/1/I/L) is generated.
Per frame: `thumb/` 480px AVIF+WebP, `screen/` 2048px AVIF+WebP, `full/` original JPEG
(download only — the viewer never loads it), plus `manifest.json` with dominant colours.

## Where things live

| File | What |
|---|---|
| `src/film.ts` + `.film` block in `src/styles.css` | The film strip: sprockets, rebate, edge print, numbers. **Only place to restyle** when the contact sheet changes. Currently mirrors `webapp/index-ocr.html`. |
| `src/sheet.ts` | Contact sheet view (the mode toggle): the printed sheet layout with the customer's marks on frames and notes in the margins; tap a frame or note to open it |
| `src/gate.ts` | Frame by frame (default): one frame on a horizontal strip, clipped to exactly the photo width. Swipe = wind on; flick up = keep, down = out; double-tap = full screen; hold = note; scrubber below |
| `src/loupe.ts` | Full-screen frame, click for 1:1, drag to pan |
| `src/marks.ts` | Hand-drawn sharpie marks: exam-style orange O (#F6853D) = keep, black X = out, both 70% opacity, one clean stroke each. 4 seeded variants; same paths used by the exported image |
| `src/icons.ts` | System icons + Keep/Out/Note buttons (plain UI). Handwriting (Kalam, Korean = Nanum Pen Script) is only for what the customer writes: marks, note text |
| `src/store.ts` | Marks/notes/active frame, saved to localStorage, synced to the server (debounced PUT). Read-only mode for the lab |
| `src/summary.ts` | Picks: per-frame print requests (copies, 3×5 / 4×6), requests for the lab, Send. Sends **frame numbers only, no images** (`store.picks()`) to `POST /api/roll/:code/submit`; without a backend, to the share sheet / clipboard as text |
| `src/labpanel.ts` | `/lab/:code`: the viewer read-only, plus every send the customer made |
| `worker/handler.ts` | The backend: roll + session API, submit + lab webhook, images from R2 on the same origin |
| `src/sheetimage.ts` | Marked contact sheet as a JPEG (canvas port of the printed sheet + marks + notes). Always reachable from the bottom bar. In production R2 must send CORS headers or the canvas taints |

## Keys

← → move · F keep · X out · 0 clear · Space loupe · N note · U next unmarked · Esc close

## Status

Phase 1 (viewer) and Phase 2 (marking, prints, local persistence, contact-sheet image) done.
Phase 3 (backend sync, submit, `/lab/:code`, lab webhook) built and tested locally; not deployed, open questions in `HANDOVER.md` §6.
Phase 4 (narrate) not started.
