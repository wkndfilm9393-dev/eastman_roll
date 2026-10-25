// Lab view's order panel: every send from the customer, newest first, as the
// plain text the lab works from, plus the live state if it changed since.

import { picksText } from './pickstext';
import type { Store } from './store';
import type { Submission } from './types';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const when = (t: number) => new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function labPanel(store: Store, submissions: Submission[], actions: { close(): void }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'summary';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Customer order');
  const r = store.roll, t = store.tally();
  const sends = [...submissions].reverse();

  el.innerHTML = `
    <header class="sum-head">
      <div>
        <div class="eyebrow">${esc(r.rollCode)} · ${esc(r.stock)} · ${esc(r.date)}</div>
        <h2 class="title">Order</h2>
        <div class="eyebrow">${sends.length ? `Sent ${sends.length}× · last ${esc(when(sends[0].at))}` : 'Not sent yet'}</div>
      </div>
      <button class="ghost close" aria-label="Back to roll">Back to roll</button>
    </header>
    ${sends.length && !store.sentUpToDate ? '<p class="sum-help">The customer has changed marks or notes since their last send. The roll shows the current state.</p>' : ''}
    ${sends.length ? '' : `<p class="sum-help">The customer hasn’t sent picks yet. So far: ${t.keep} kept, ${t.reject} out, ${t.none} unmarked.</p>`}
    <div class="lab-sends"></div>`;

  const list = el.querySelector('.lab-sends')!;
  sends.forEach((s, n) => {
    const sec = document.createElement('section');
    sec.className = 'lab-send';
    sec.innerHTML = `
      <div class="lab-send-head"><h3 class="eyebrow">${n === 0 ? 'Latest' : 'Earlier'} · ${esc(when(s.at))}</h3><button class="ghost copy">Copy</button></div>
      <pre class="sum-text"></pre>`;
    const text = picksText(r, s.picks);
    sec.querySelector('pre')!.textContent = text;
    const copy = sec.querySelector<HTMLButtonElement>('.copy')!;
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
      catch { getSelection()?.selectAllChildren(sec.querySelector('pre')!); }
    };
    list.append(sec);
  });

  el.querySelector('.close')!.addEventListener('click', actions.close);
  return el;
}
