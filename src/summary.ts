// Summary / Send. What goes to the lab is frame numbers and requests only —
// keeps, outs, print copies and sizes, notes — never the images. The marked
// contact sheet image is the customer's own takeaway and is always available.

import { submitPicks } from './api';
import { picture } from './img';
import { picksText } from './pickstext';
import { openSheetImage } from './sheetimage';
import type { Store } from './store';
import { PRINT_SIZES } from './types';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function summary(store: Store, actions: { close(): void; jump(i: number): void }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'summary';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Your picks');
  const t = store.tally();
  const r = store.roll;

  el.innerHTML = `
    <header class="sum-head">
      <div>
        <div class="eyebrow">${esc(r.rollCode)} · ${esc(r.stock)}</div>
        <h2 class="title">Your picks</h2>
        <div class="eyebrow">${t.keep} kept · ${t.reject} out · ${t.none} unmarked</div>
      </div>
      <button class="ghost close" aria-label="Back to roll">Back to roll</button>
    </header>

    <button class="sheet-card">
      <span><b>Contact sheet</b><span class="eyebrow">Your marks and notes, saved as an image</span></span>
      <span class="pill">Save image</span>
    </button>

    <section class="sum-prints">
      <h3 class="eyebrow">Prints</h3>
      <p class="sum-help">Choose how many copies of each frame and the size. Leave a frame at 0 if you only want the scan.</p>
      <div class="print-list"></div>
    </section>

    <label class="sum-note">
      <span class="eyebrow">Anything else for the lab</span>
      <span class="sum-help">For example: which frame, what to change, finish or crop.</span>
      <textarea rows="3" placeholder="Frame 7 a little brighter, please"></textarea>
    </label>

    <details class="sum-out"><summary class="eyebrow">Marked out (${t.reject})</summary><div class="sum-out-list"></div></details>

    <div class="sum-actions">
      <button class="pill send">Send picks to lab</button>
      ${t.none ? '<button class="ghost unmarked">Jump to unmarked</button>' : ''}
    </div>
    <p class="eyebrow sum-foot">Sends frame numbers and your requests only — no photos.</p>
    <p class="sum-status" role="status"></p>`;

  // print rows: every kept frame, plus anything already ordered
  const list = el.querySelector('.print-list')!;
  const rows: number[] = [];
  for (let i = 0; i < store.count; i++) if (store.mark(i) === 'keep' || store.print(i).copies > 0) rows.push(i);
  if (!rows.length) list.innerHTML = '<p class="sum-help">Keep a frame to order prints of it.</p>';
  for (const i of rows) list.append(printRow(store, i, actions.jump));

  const out = el.querySelector('.sum-out-list')!;
  for (let i = 0; i < store.count; i++) {
    if (store.mark(i) !== 'reject') continue;
    const f = store.frame(i);
    const b = document.createElement('button');
    b.className = 'sum-frame';
    b.style.backgroundColor = f.color;
    b.append(picture(r, f, 'thumb'));
    b.insertAdjacentHTML('beforeend', `<span class="num">${esc(f.number)}</span>`);
    b.onclick = () => actions.jump(i);
    out.append(b);
  }

  const ta = el.querySelector('textarea')!;
  ta.value = store.session.labNote ?? '';
  ta.addEventListener('input', () => store.setLabNote(ta.value));

  el.querySelector('.close')!.addEventListener('click', actions.close);
  el.querySelector('.unmarked')?.addEventListener('click', () => actions.jump(store.nextUnmarked()));
  el.querySelector('.sheet-card')!.addEventListener('click', () => openSheetImage(store, el));

  // With a backend, send = POST /api/roll/:code/submit with store.picks(); the
  // lab is notified with a /lab/:code link. Without one (static hosting, the
  // demo) or if that fails, the picks go out as text via the share sheet
  // (KakaoTalk etc.) or the clipboard.
  const status = el.querySelector<HTMLElement>('.sum-status')!;
  const send = el.querySelector<HTMLButtonElement>('.send')!;
  const renderSent = () => {
    const at = store.session.submittedAt;
    if (!store.online || !at) return;
    const fresh = store.sentUpToDate;
    send.textContent = fresh ? 'Sent to lab' : 'Send changes to lab';
    send.disabled = fresh;
    status.textContent = `Sent ${when(at)}.${fresh ? '' : ' You’ve changed things since.'}`;
  };
  renderSent();
  const off = store.on(c => {
    if (!el.isConnected) off();   // the picks screen was closed
    else if (c.kind !== 'active') renderSent();
  });

  send.addEventListener('click', async () => {
    if (store.online) {
      send.disabled = true;
      send.textContent = 'Sending…';
      status.textContent = '';
      try {
        await store.flush().catch(() => { /* the picks below carry everything the lab needs */ });
        const { submittedAt } = await submitPicks(r.rollCode, store.picks());
        store.markSubmitted(submittedAt);
        return;
      } catch {
        send.disabled = false;
        send.textContent = 'Send picks to lab';
        status.textContent = 'Couldn’t reach the lab. Share your picks instead:';
      }
    }
    const text = picksText(r, store.picks());
    if (navigator.share) {
      try { await navigator.share({ title: `Picks · ${r.rollCode}`, text }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); status.textContent = 'Copied. Paste it into the lab chat.'; }
    catch {
      // no share sheet and no clipboard (e.g. inside an embedded viewer): show the text to copy by hand
      status.textContent = 'Copy this and paste it into the lab chat:';
      const pre = document.createElement('pre');
      pre.className = 'sum-text';
      pre.textContent = text;
      status.append(pre);
      getSelection()?.selectAllChildren(pre);
    }
  });
  return el;
}

function printRow(store: Store, i: number, jump: (i: number) => void): HTMLElement {
  const f = store.frame(i);
  const row = document.createElement('div');
  row.className = 'print-row';
  row.innerHTML = `
    <button class="pr-thumb" aria-label="Open frame ${esc(f.number)}"></button>
    <span class="pr-num">#${esc(f.number)}</span>
    <span class="stepper" role="group" aria-label="Copies of frame ${esc(f.number)}">
      <button data-d="-1" aria-label="One fewer">−</button><output></output><button data-d="1" aria-label="One more">+</button>
    </span>
    <span class="seg" role="radiogroup" aria-label="Size">${PRINT_SIZES.map(s =>
      `<button role="radio" data-size="${s.id}">${s.label}</button>`).join('')}</span>`;
  const thumb = row.querySelector<HTMLButtonElement>('.pr-thumb')!;
  thumb.style.backgroundColor = f.color;
  thumb.append(picture(store.roll, f, 'thumb'));
  thumb.onclick = () => jump(i);

  const render = () => {
    const p = store.print(i);
    row.querySelector('output')!.textContent = String(p.copies);
    row.classList.toggle('on', p.copies > 0);
    row.querySelectorAll<HTMLButtonElement>('.seg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.size === p.size)));
    row.querySelector<HTMLButtonElement>('[data-d="-1"]')!.disabled = p.copies === 0;
  };
  row.querySelector('.stepper')!.addEventListener('click', e => {
    const d = Number((e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.d);
    if (!d) return;
    const p = store.print(i);
    store.setPrint(i, { ...p, copies: p.copies + d });
    render();
  });
  row.querySelector('.seg')!.addEventListener('click', e => {
    const size = (e.target as HTMLElement).closest<HTMLElement>('button')?.dataset.size;
    if (!size) return;
    const p = store.print(i);
    // picking a size is a clear intent to print: start at one copy
    store.setPrint(i, { size: size as '3x5' | '4x6', copies: p.copies || 1 });
    render();
  });
  render();
  return row;
}
