// System icons and buttons — clean, geometric. Handwriting is reserved for what
// the customer adds (grease-pencil marks, note text); the interface stays plain.

export const ICON = {
  sheet: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.7h18M9 4v16M15 4v16"/></svg>`,
  frame: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="1"/></svg>`,
  download: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>`,
  keep: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/></svg>`,
  reject: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  note: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z"/><path d="M13.5 7l3.5 3.5"/></svg>`,
};

export function actionButton(kind: keyof typeof ICON, label: string, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `act-btn ${cls}`.trim();
  b.dataset.a = kind;
  b.innerHTML = `${ICON[kind]}<span>${label}</span>`;
  return b;
}
