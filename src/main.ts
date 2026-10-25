import { Gate } from './gate';
import { Loupe } from './loupe';
import { Store } from './store';
import { ICON, actionButton } from './icons';
import { buildDemoRoll } from './demo';
import { srcUrl } from './img';
import { ContactSheet } from './sheet';
import { openSheetImage } from './sheetimage';
import { summary } from './summary';
import type { Manifest, Mode } from './types';

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

async function loadRoll(code: string): Promise<Manifest> {
  // Phase 3: GET /api/roll/:code → manifest + saved session
  const res = await fetch(`/rolls/${encodeURIComponent(code)}/manifest.json`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// The single-file demo build (vite --mode demo) and /demo start from the photo picker.
const DEMO = import.meta.env.MODE === 'demo' || location.pathname.startsWith('/demo');

function route() {
  if (DEMO) return demoStart();
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{10,})\/?$/);
  if (m) return openRoll(m[1].toUpperCase());
  app.innerHTML = `
    <main class="cover">
      <div class="cover-top"><span class="wordmark">Eastman Film Lab</span></div>
      <div class="cover-mid">
        <h1 class="title">Open your roll</h1>
        <form class="code-form">
          <input name="code" placeholder="Roll code from your sleeve" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Roll code" />
          <button class="pill">Open</button>
        </form>
      </div>
    </main>`;
  app.querySelector('form')!.addEventListener('submit', e => {
    e.preventDefault();
    const v = (new FormData(e.target as HTMLFormElement).get('code') as string).trim().toUpperCase();
    if (v) location.href = `/r/${encodeURIComponent(v)}`;
  });
}

function demoStart() {
  app.innerHTML = `
    <main class="cover">
      <div class="cover-top"><span class="wordmark">Eastman Film Lab</span><span class="eyebrow cover-meta">Demo</span></div>
      <div class="cover-mid">
        <h1 class="title">Make a demo roll</h1>
        <p class="sum-help demo-help">Pick up to 36 photos. They stay on this device — nothing is uploaded.</p>
        <label class="pill demo-pick">Choose photos<input type="file" accept="image/*" multiple hidden /></label>
        <p class="eyebrow demo-status" role="status"></p>
      </div>
    </main>`;
  const input = app.querySelector<HTMLInputElement>('input[type=file]')!;
  const status = app.querySelector<HTMLElement>('.demo-status')!;
  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])].slice(0, 36);
    if (!files.length) return;
    app.querySelector<HTMLElement>('.demo-pick')!.hidden = true;
    const roll = await buildDemoRoll(files, (d, t) => (status.textContent = `Preparing ${Math.min(d + 1, t)} of ${t}…`));
    if (!roll.frames.length) {
      status.textContent = 'Those files couldn’t be opened. Try JPEG or PNG photos.';
      app.querySelector<HTMLElement>('.demo-pick')!.hidden = false;
      return;
    }
    cover(new Store(roll));
  });
}

async function openRoll(code: string) {
  let roll: Manifest;
  try { roll = await loadRoll(code); }
  catch {
    app.innerHTML = `<main class="cover"><div class="cover-top"><span class="wordmark">Eastman Film Lab</span></div>
      <div class="cover-mid"><h1 class="title">Roll not found</h1><p class="eyebrow">Check the code on your sleeve, or ask the lab.</p></div></main>`;
    return;
  }
  document.title = `${roll.title} — Eastman Film Lab`;
  const store = new Store(roll);
  cover(store);
}

function cover(store: Store) {
  const r = store.roll, f = r.frames[0];
  app.innerHTML = `
    <main class="cover">
      <div class="cover-bg" style="background-color:${f.color};background-image:url('${srcUrl(r, f.src.thumb.webp)}')"></div>
      <div class="cover-top">
        <span class="wordmark">Eastman Film Lab</span>
        <span class="eyebrow cover-meta">${esc(r.rollCode)}<br>${esc(r.stock)}<br>${esc(r.date.replace(/-/g, '.'))}</span>
      </div>
      <div class="cover-mid">
        <h1 class="title">${esc(r.title)}</h1>
        <p class="eyebrow">${r.frameCount} frames</p>
        <button class="pill open">Open roll</button>
      </div>
    </main>`;
  app.querySelector<HTMLButtonElement>('.open')!.onclick = () => viewer(store);
}

/* ───────────────────────────── viewer ───────────────────────────── */

function viewer(store: Store) {
  app.innerHTML = `
    <div class="viewer">
      <header class="bar top">
        <span class="wordmark">Eastman Film Lab</span>
        <span class="counter" aria-live="polite"></span>
      </header>
      <div class="stagewrap"></div>
      <button class="caption" hidden></button>
      <div class="actions" role="toolbar" aria-label="Mark this frame"></div>
      <div class="hint" hidden></div>
      <footer class="bar bottom">
        <span class="tally" aria-live="polite"></span>
        <span class="bar-actions">
          <button class="icon-btn save-sheet" aria-label="Save contact sheet image" title="Save contact sheet image"></button>
          <button class="mode icon-btn"></button>
          <button class="pill send">Send picks</button>
        </span>
      </footer>
      <dialog class="note-sheet">
        <form method="dialog">
          <div class="sheet-head"><span class="eyebrow note-label"></span><button value="cancel" class="sheet-x" aria-label="Close">✕</button></div>
          <textarea rows="4" placeholder="Write a note for the lab" aria-label="Note for this frame"></textarea>
          <div class="note-actions"><button value="cancel" class="ghost">Cancel</button><button value="save" class="pill">Save note</button></div>
        </form>
      </dialog>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const wrap = $('.stagewrap'), tally = $('.tally'), counter = $('.counter');
  const caption = $<HTMLButtonElement>('.caption'), modeBtn = $<HTMLButtonElement>('.mode');
  const dlg = $<HTMLDialogElement>('.note-sheet'), viewerEl = $('.viewer');
  const hint = $('.hint');
  let hintSeen = false;
  try { hintSeen = !!localStorage.getItem('eastman-loupe:hint'); } catch { /* storage blocked */ }

  // thumb-zone marking buttons, shared by both modes
  const btnOut = actionButton('reject', 'Out', 'out');
  const btnNote = actionButton('note', 'Note', 'note');
  const btnKeep = actionButton('keep', 'Keep', 'keep');
  $('.actions').append(btnOut, btnNote, btnKeep);
  btnOut.onclick = () => store.toggleMark(store.active, 'reject');
  btnKeep.onclick = () => store.toggleMark(store.active, 'keep');
  btnNote.onclick = () => actions.editNote(store.active);
  caption.onclick = () => actions.editNote(store.active);


  let view: ContactSheet | Gate | null = null;
  let mode: Mode | null = null;
  let loupe: Loupe | null = null;
  let sheet: HTMLElement | null = null;

  const actions = {
    openLoupe(i: number) {
      store.setActive(i, 'loupe');
      if (loupe) return;
      loupe = new Loupe(store, closeLoupe);
      viewerEl.append(loupe.el);
    },
    showFrame(i: number) {
      store.setActive(i, 'sheet');
      setMode('gate');
    },
    editNote(i: number) {
      store.setActive(i, 'note');
      dlg.querySelector('.note-label')!.textContent = `Note · Frame ${store.frame(i).number}`;
      const ta = dlg.querySelector('textarea')!;
      ta.value = store.note(i);
      dlg.returnValue = '';
      dlg.showModal();
      ta.focus();
      dlg.onclose = () => { if (dlg.returnValue === 'save') store.setNote(i, ta.value); };
    },
  };
  function closeLoupe() { loupe?.destroy(); loupe = null; }
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // tap outside the sheet

  // Frame by frame is home; the toggle flips to the contact sheet to review edits.
  function setMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    view?.destroy();
    view = next === 'sheet' ? new ContactSheet(store, actions) : new Gate(store, actions);
    wrap.replaceChildren(view.el);
    viewerEl.dataset.mode = next;
    modeBtn.innerHTML = next === 'sheet' ? ICON.frame : ICON.sheet;
    modeBtn.setAttribute('aria-label', next === 'sheet' ? 'Frame by frame' : 'Contact sheet');
    modeBtn.title = modeBtn.getAttribute('aria-label')!;
    renderActive();
    renderHint();
  }
  modeBtn.onclick = () => setMode(mode === 'sheet' ? 'gate' : 'sheet');

  function renderActive() {
    const i = store.active, m = store.mark(i), note = store.note(i);
    counter.textContent = `${store.frame(i).number} / ${store.count}`;
    btnKeep.setAttribute('aria-pressed', String(m === 'keep'));
    btnOut.setAttribute('aria-pressed', String(m === 'reject'));
    btnNote.setAttribute('aria-pressed', String(!!note));
    // empty slot invites a note in frame-by-frame, where there's room for it
    caption.hidden = mode !== 'gate';   // the sheet shows notes in its margins
    caption.classList.toggle('empty', !note);
    caption.textContent = note || (matchMedia('(pointer: coarse)').matches ? 'Hold the frame to add a note' : 'Press N to add a note');
  }
  function renderTally() {
    const t = store.tally();
    tally.innerHTML = `<span class="tot"><b>${t.total}</b> FRAMES · </span><b class="k">${t.keep}</b> KEPT · <b class="x">${t.reject}</b> OUT · <b>${t.none}</b> UNMARKED`;
    tally.setAttribute('aria-label', `${t.total} frames, ${t.keep} kept, ${t.reject} out, ${t.none} unmarked`);
  }
  store.on(c => {
    if (c.kind === 'mark') renderTally();
    if (c.kind !== 'labNote') renderActive();
  });
  setMode('gate');
  renderActive();
  renderTally();

  $<HTMLButtonElement>('.send').onclick = openSummary;
  const saveBtn = $<HTMLButtonElement>('.save-sheet');
  saveBtn.innerHTML = ICON.download;
  saveBtn.onclick = () => openSheetImage(store, viewerEl);
  function openSummary() {
    if (sheet) return;
    sheet = summary(store, {
      close: closeSummary,
      jump(i) { closeSummary(); if (i >= 0) store.setActive(i, 'summary'); },
    });
    viewerEl.append(sheet);
  }
  function closeSummary() { sheet?.remove(); sheet = null; }

  // one-time hint: gestures on touch screens, shortcuts with a keyboard
  function renderHint() {
    if (hintSeen) return;
    const touch = matchMedia('(pointer: coarse)').matches;
    hint.innerHTML = touch
      ? (mode === 'gate'
        ? '<span>Swipe to wind on</span><span>Flick up to keep, down for out</span><span>Hold for a note</span>'
        : '<span>Your marks and notes, as on the printed sheet</span><span>Tap a frame to open it</span>')
      : '<span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>F</kbd> keep</span><span><kbd>X</kbd> out</span><span><kbd>0</kbd> clear</span><span><kbd>Space</kbd> loupe</span><span><kbd>N</kbd> note</span><span><kbd>U</kbd> next unmarked</span>';
    const x = document.createElement('button');
    x.className = 'hint-x';
    x.setAttribute('aria-label', 'Got it');
    x.textContent = 'Got it';
    x.onclick = () => {
      hint.hidden = true; hintSeen = true;
      try { localStorage.setItem('eastman-loupe:hint', '1'); } catch { /* storage blocked */ }
    };
    hint.append(x);
    hint.hidden = false;
  }

  window.addEventListener('keydown', e => {
    if (dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const i = store.active;
    const k = e.key;
    if (k === 'Escape') {
      if (loupe?.isZoomed) loupe.toggleZoom(); else if (loupe) closeLoupe(); else closeSummary();
      return;
    }
    if (sheet) return;
    const step = (d: number) => (loupe ? store.setActive(i + d, 'key') : view?.step(d));
    switch (k) {
      case 'ArrowRight': step(1); break;
      case 'ArrowLeft': step(-1); break;
      case 'f': case 'F': store.toggleMark(i, 'keep'); break;
      case 'x': case 'X': store.toggleMark(i, 'reject'); break;
      case '0': case 'Backspace': store.setMark(i, 'none'); break;
      case 'n': case 'N': actions.editNote(i); break;
      case 'u': case 'U': { const n = store.nextUnmarked(); if (n >= 0) store.setActive(n, 'key'); break; }
      case ' ': case 'Enter': if (loupe) loupe.toggleZoom(); else actions.openLoupe(i); break;
      default: return;
    }
    e.preventDefault();
  });
}

route();
