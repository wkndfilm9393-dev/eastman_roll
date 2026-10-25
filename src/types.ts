export type Mark = 'none' | 'keep' | 'reject';

export interface ImageSrc { avif: string; webp: string; w: number; h: number }

export interface Frame {
  id: string;
  number: string;          // printed edge number: "1", "1A"…
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  color: string;           // dominant colour, used as placeholder
  src: { thumb: ImageSrc; screen: ImageSrc; full: string };
}

export interface Manifest {
  rollCode: string;
  roll: string;
  title: string;
  stock: string;
  date: string;
  frameCount: number;
  frames: Frame[];
}

export type PrintSize = '3x5' | '4x6';
export const PRINT_SIZES: { id: PrintSize; label: string }[] = [
  { id: '3x5', label: '3×5' },
  { id: '4x6', label: '4×6' },
];

export interface PrintRequest { copies: number; size: PrintSize }

export interface FrameState { id: string; mark: Mark; note?: string; print?: PrintRequest; updatedAt: number }

export interface RollSession {
  rollCode: string;
  frames: Record<string, FrameState>;
  labNote?: string;
  labNoteAt?: number;      // when labNote last changed, for merging devices
  submittedAt?: number;
  narrations?: { id: string; audioUrl: string; logUrl: string; duration: number }[];
}

export type Mode = 'sheet' | 'gate';

/** What goes to the lab: frame numbers and requests only — never images. */
export interface Picks {
  rollCode: string;
  keep: string[];                 // frame numbers as printed on the film
  reject: string[];
  prints: { frame: string; copies: number; size: PrintSize }[];
  notes: { frame: string; text: string }[];
  labNote?: string;
}

/** One send to the lab, kept as sent so the lab works from a stable record. */
export interface Submission { at: number; picks: Picks }

/** GET /api/roll/:code */
export interface RollResponse {
  manifest: Manifest;
  session: RollSession | null;
  submissions: Submission[];
}

export interface ViewActions {
  openLoupe(i: number): void;
  editNote(i: number): void;
  showFrame(i: number): void;   // jump to frame-by-frame at frame i
}
