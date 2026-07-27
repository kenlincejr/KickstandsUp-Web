import { describe, expect, it } from 'vitest';
import { nextActiveIndex } from './select-keyboard';

describe('nextActiveIndex', () => {
  it('moves down and wraps at the end', () => {
    expect(nextActiveIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextActiveIndex(2, 3, 'ArrowDown')).toBe(0);
  });

  it('moves up and wraps at the start', () => {
    expect(nextActiveIndex(1, 3, 'ArrowUp')).toBe(0);
    expect(nextActiveIndex(0, 3, 'ArrowUp')).toBe(2);
  });

  it('jumps to the ends', () => {
    expect(nextActiveIndex(1, 4, 'Home')).toBe(0);
    expect(nextActiveIndex(1, 4, 'End')).toBe(3);
  });

  it('leaves non-movement keys to the caller', () => {
    expect(nextActiveIndex(1, 4, 'Enter')).toBeNull();
    expect(nextActiveIndex(1, 4, 'a')).toBeNull();
  });

  it('is safe on an empty or out-of-range list', () => {
    expect(nextActiveIndex(0, 0, 'ArrowDown')).toBeNull();
    expect(nextActiveIndex(-1, 3, 'ArrowDown')).toBe(1);
    expect(nextActiveIndex(99, 3, 'ArrowUp')).toBe(2);
  });
});
