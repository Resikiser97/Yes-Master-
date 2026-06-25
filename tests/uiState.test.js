import assert from 'node:assert/strict';

import { applyUiClick, ensureUiState } from '../src/ui/uiState.js';

function testUiPanelClicksToggleLocalState() {
  const world = {};
  ensureUiState(world);

  assert.equal(world.uiState.playerExpanded, false);
  assert.equal(world.uiState.coreExpanded, false);

  assert.equal(applyUiClick(world, 'playerPanel'), true);
  assert.equal(world.uiState.playerExpanded, true);
  assert.equal(applyUiClick(world, 'playerPanel'), true);
  assert.equal(world.uiState.playerExpanded, false);

  assert.equal(applyUiClick(world, 'corePanel'), true);
  assert.equal(world.uiState.coreExpanded, true);
  assert.equal(applyUiClick(world, 'unknown'), false);
  assert.equal(world.uiState.coreExpanded, true);
}

testUiPanelClicksToggleLocalState();

console.log('ui state tests passed');
