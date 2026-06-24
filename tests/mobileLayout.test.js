import assert from 'node:assert/strict';

// Mock window for Node environment
globalThis.window = {
  innerWidth: 900,
  innerHeight: 400,
  navigator: { standalone: false },
  matchMedia: () => ({ matches: false }),
};
const { computeMobileGameViewportPx, computeThreeColumnLayout } = await import('../src/ui/mobileLayout.js');

const baseCfg = {
  render: { tilePx: 16 },
  map: { viewportPx: { width: 800, height: 600 } },
};

{
  const viewport = computeMobileGameViewportPx(baseCfg);
  assert.deepEqual(viewport, { width: 544, height: 408 }, 'mobile game viewport should crop requested tiles');
  assert.deepEqual(baseCfg.map.viewportPx, { width: 800, height: 600 }, 'desktop/base viewport should stay unchanged');
}

// Normal landscape dimensions
{
  window.innerWidth = 900;
  window.innerHeight = 400;
  const layout = computeThreeColumnLayout(baseCfg);

  assert.ok(layout.sideWidth > 0, 'sideWidth should be positive');
  assert.ok(layout.centerWidth > 0, 'centerWidth should be positive');
  assert.ok(layout.canvasWidth > 0, 'canvasWidth should be positive');
  assert.ok(layout.canvasHeight > 0, 'canvasHeight should be positive');
  assert.ok(layout.canvasWidth <= layout.centerWidth, 'canvas should fit within center');
  assert.equal(layout.sideWidth * 2 + layout.centerWidth, window.innerWidth, 'widths should sum to viewport');
}

// Small screen — values should not go negative
{
  window.innerWidth = 400;
  window.innerHeight = 200;
  const layout = computeThreeColumnLayout(baseCfg);

  assert.ok(layout.sideWidth >= 0, 'sideWidth should not be negative');
  assert.ok(layout.centerWidth >= 0, 'centerWidth should not be negative');
  assert.ok(layout.canvasWidth >= 0, 'canvasWidth should not be negative');
  assert.ok(layout.canvasHeight >= 0, 'canvasHeight should not be negative');
}

// Large screen
{
  window.innerWidth = 1920;
  window.innerHeight = 1080;
  const layout = computeThreeColumnLayout(baseCfg);

  assert.ok(layout.sideWidth >= 150, 'sideWidth should respect minimum');
  assert.ok(layout.sideWidth <= 164, 'sideWidth should respect maximum');
  assert.ok(layout.canvasWidth > 0);
  assert.ok(layout.canvasHeight > 0);
}

console.log('mobileLayout tests passed');
