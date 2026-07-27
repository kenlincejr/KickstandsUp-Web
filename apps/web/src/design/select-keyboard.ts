// Keyboard arithmetic for the day-kit `Select` listbox, kept pure so it can be
// tested without a DOM (this workspace's vitest run has no jsdom, and the
// suite only collects `*.test.ts`).

export type SelectKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'Enter' | ' ' | 'Escape' | (string & {});

/**
 * The next highlighted option for a keypress, or `null` when the key is not a
 * movement key (the caller then leaves the event alone). Movement wraps, which
 * is what a native listbox does on ↑ from the first row.
 */
export function nextActiveIndex(current: number, length: number, key: SelectKey): number | null {
  if (length <= 0) return null;
  const clamped = current < 0 || current >= length ? 0 : current;
  switch (key) {
    case 'ArrowDown': return (clamped + 1) % length;
    case 'ArrowUp': return (clamped - 1 + length) % length;
    case 'Home': return 0;
    case 'End': return length - 1;
    default: return null;
  }
}
