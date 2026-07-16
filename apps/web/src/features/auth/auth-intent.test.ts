import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './auth-intent';

describe('safeReturnTo', () => {
  it('preserves protected KSU paths, queries, and fragments', () => {
    expect(safeReturnTo('/app/planner?draft=42#stops')).toBe('/app/planner?draft=42#stops');
  });

  it('rejects public and external redirect targets', () => {
    expect(safeReturnTo('https://attacker.example/app/planner')).toBe('/app/routes');
    expect(safeReturnTo('//attacker.example/app/planner')).toBe('/app/routes');
    expect(safeReturnTo('/signin')).toBe('/app/routes');
  });
});
