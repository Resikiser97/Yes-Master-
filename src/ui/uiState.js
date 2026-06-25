export function ensureUiState(world) {
  world.uiState ??= { playerExpanded: false, backpackExpanded: true, coreExpanded: false };
  return world.uiState;
}

export function applyUiClick(world, uiClick) {
  if (!uiClick) return false;
  const uiState = ensureUiState(world);
  if (uiClick === 'playerPanel') {
    uiState.playerExpanded = !uiState.playerExpanded;
    return true;
  }
  if (uiClick === 'corePanel') {
    uiState.coreExpanded = !uiState.coreExpanded;
    return true;
  }
  return false;
}
