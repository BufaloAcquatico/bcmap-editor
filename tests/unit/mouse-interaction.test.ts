import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BCMapEditor } from '../../src/editor';

// Mock DOM for testing
const mockCtx = {
  clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
  drawImage: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(),
  moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1
};
const mockCanvas = {
  id: 'testCanvas', width: 800, height: 600,
  getContext: vi.fn(() => mockCtx),
  getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
  addEventListener: vi.fn()
};
const mockElements: Record<string, any> = {};
mockElements['testCanvas'] = mockCanvas;
mockElements['tileCategories'] = { style: { display: '' }, innerHTML: '', querySelectorAll: vi.fn(() => []), appendChild: vi.fn() };
mockElements['objectCategories'] = { style: { display: '' }, innerHTML: '', querySelectorAll: vi.fn(() => []), appendChild: vi.fn() };
mockElements['zoomLevel'] = { textContent: '' };
global.document = {
  getElementById: vi.fn((id) => mockElements[id] || null),
  querySelector: vi.fn(() => null),
  querySelectorAll: vi.fn(() => []),
  createElement: vi.fn(() => ({
    className: '',
    textContent: '',
    style: {},
    title: '',
    innerHTML: '',
    addEventListener: vi.fn(),
    appendChild: vi.fn(),
    querySelectorAll: vi.fn(() => [])
  }))
} as any;
global.window = { addEventListener: vi.fn() } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: '' })) as any;

describe('Mouse Interaction and Rendering', () => {
  let editor: BCMapEditor;
  
  beforeEach(() => {
    vi.clearAllMocks();
    editor = new BCMapEditor('testCanvas');
  });

  it('should handle mouse events without crashing', () => {
    const canvas = mockCanvas as any;
    expect(canvas.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(canvas.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(canvas.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(canvas.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
  });

  it('should render multiple times without errors', () => {
    expect(() => {
      editor.render();
      editor.render();
      editor.render();
    }).not.toThrow();
  });

  it('should populate pickers without errors', () => {
    expect(() => editor.populatePickers()).not.toThrow();
  });

  it('should handle setCurrentLayer with both values', () => {
    editor.setCurrentLayer('tile');
    expect(editor.getCurrentLayer()).toBe('tile');
    editor.setCurrentLayer('object');
    expect(editor.getCurrentLayer()).toBe('object');
  });

  it('should newMap reset all state', () => {
    editor.newMap();
    const data = editor.getMapData();
    expect(data.Tiles.length).toBe(1600);
    expect(data.Objects.length).toBe(1600);
    expect(data.Tiles.charCodeAt(0)).toBe(210);
    expect(data.Objects.charCodeAt(0)).toBe(10000);
  });

  it('should getTileCatalog return non-empty array with proper structure', () => {
    const catalog = editor.getTileCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toHaveProperty('ID');
    expect(catalog[0]).toHaveProperty('Type');
    expect(catalog[0]).toHaveProperty('Style');
  });

  it('should getObjectCatalog return non-empty array with proper structure', () => {
    const catalog = editor.getObjectCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toHaveProperty('ID');
    expect(catalog[0]).toHaveProperty('Type');
    expect(catalog[0]).toHaveProperty('Style');
  });
});
