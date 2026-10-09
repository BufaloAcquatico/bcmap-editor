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
    className: '', textContent: '', style: {}, title: '', innerHTML: '',
    addEventListener: vi.fn(), appendChild: vi.fn(), querySelectorAll: vi.fn(() => [])
  }))
} as any;
global.window = { addEventListener: vi.fn(), devicePixelRatio: 1 } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: '' })) as any;

// Helper to create mock mouse events
const createMouseEvent = (overrides: Partial<MouseEvent> = {}): MouseEvent => ({
  clientX: 0,
  clientY: 0,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  ...overrides
} as unknown as MouseEvent);

describe('Drag-to-Paint', () => {
  let editor: BCMapEditor;
  
  beforeEach(() => {
    vi.clearAllMocks();
    editor = new BCMapEditor('testCanvas');
    editor.setSelectedTile({ ID: 215, Type: 'FloorExterior', Style: 'LongGrass' });
  });

  it('should set isPainting on left mouse down', () => {
    editor.onCanvasMouseDown(createMouseEvent({ button: 0 }));
    expect((editor as any).isPainting).toBe(true);
  });

  it('should not set isPainting on right click', () => {
    editor.onCanvasMouseDown(createMouseEvent({ button: 2 }));
    expect((editor as any).isPainting).toBe(false);
  });

  it('should not set isPainting on middle click', () => {
    editor.onCanvasMouseDown(createMouseEvent({ button: 1 }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
  });

  it('should not set isPainting with Ctrl+left click (pan)', () => {
    editor.onCanvasMouseDown(createMouseEvent({ button: 0, ctrlKey: true }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
  });

  it('should clear isPainting on mouse up', () => {
    editor.onCanvasMouseDown(createMouseEvent({ button: 0 }));
    expect((editor as any).isPainting).toBe(true);
    
    editor.onCanvasMouseUp();
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isDragging).toBe(false);
    expect((editor as any).isPanning).toBe(false);
  });

  it('should paint on click (onCanvasClick)', () => {
    expect(() => editor.onCanvasClick(createMouseEvent())).not.toThrow();
  });

  it('should set isPainting and isPanning correctly for different buttons', () => {
    // Left click -> painting
    editor.onCanvasMouseDown(createMouseEvent({ button: 0 }));
    expect((editor as any).isPainting).toBe(true);
    expect((editor as any).isPanning).toBe(false);
    editor.onCanvasMouseUp();
    
    // Middle click -> panning
    editor.onCanvasMouseDown(createMouseEvent({ button: 1 }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
    editor.onCanvasMouseUp();
    
    // Right click -> panning
    editor.onCanvasMouseDown(createMouseEvent({ button: 2 }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
    editor.onCanvasMouseUp();
    
    // Ctrl+Left -> panning
    editor.onCanvasMouseDown(createMouseEvent({ button: 0, ctrlKey: true }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
    editor.onCanvasMouseUp();
    
    // Meta+Left -> panning
    editor.onCanvasMouseDown(createMouseEvent({ button: 0, metaKey: true }));
    expect((editor as any).isPainting).toBe(false);
    expect((editor as any).isPanning).toBe(true);
    editor.onCanvasMouseUp();
  });
});
