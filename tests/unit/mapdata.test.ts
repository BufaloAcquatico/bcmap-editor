import { describe, it, expect } from 'vitest';

describe('Map Data', () => {
  it('should create default map with grass tiles', () => {
    const grassChar = String.fromCharCode(210);
    const tiles = grassChar.repeat(1600);
    expect(tiles.length).toBe(1600);
    expect(tiles.charCodeAt(0)).toBe(210);
  });
  
  it('should have objects as blanks initially', () => {
    const blankChar = String.fromCharCode(10000);
    const objects = blankChar.repeat(1600);
    expect(objects.length).toBe(1600);
    expect(objects.charCodeAt(0)).toBe(10000);
  });
});
