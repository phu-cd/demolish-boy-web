export function createUI(blockCount) {
  const blockCountElement = document.querySelector('#block-count');
  blockCountElement.textContent = String(blockCount).padStart(3, '0');

  const playerStateElement = document.querySelector('#player-state');
  const playerStateDot = document.querySelector('#player-state-dot');
  const cameraInstructionElement = document.querySelector('#camera-instruction');
  const cameraModeElement = document.querySelector('#camera-mode');
  const targetDurabilityElement = document.querySelector('#target-durability');
  const bombStatusElement = document.querySelector('#bomb-status');
  const bombCountdownElement = document.querySelector('#bomb-countdown');
  const mapSelector = document.querySelector('#map-selector');
  const mapNameElement = document.querySelector('#map-name');
  const mapMaterialElement = document.querySelector('#map-material');
  const mapTitleElement = document.querySelector('#map-title');
  const descriptionElement = document.querySelector('.site-description');
  const conditionElement = document.querySelector('#building-condition');
  const conditionDot = document.querySelector('#building-condition-dot');
  const invertVerticalButton = document.querySelector('#invert-vertical');
  const durabilityElement = document.querySelector('#target-durability');
  const toolSlotButtons = [...document.querySelectorAll('[data-tool-slot]')];
  let currentTarget = null;
  let onToolSlotSelect = () => {};
  let onMapSelect = () => {};
  let invertVertical = false;
  let onInvertVerticalChange = () => {};

  function setGrounded(grounded) {
    playerStateElement.textContent = grounded ? 'GROUNDED' : 'AIRBORNE';
    playerStateDot.classList.toggle('airborne', !grounded);
  }

  function setPointerLocked(locked, failed = false) {
    cameraInstructionElement.textContent = locked
      ? 'ESC TO RELEASE MOUSE LOOK'
      : failed ? 'DRAG TO LOOK / ESC TO RELEASE' : 'CLICK SCENE TO LOOK';
  }

  function setCameraMode(mode) {
    cameraModeElement.textContent = mode;
  }

  function setTarget(target) {
    currentTarget = target;
    if (!target) {
      targetDurabilityElement.textContent = '-- / --';
      return;
    }
    targetDurabilityElement.textContent = `${target.userData.durability} / ${target.userData.maxDurability}`;
  }

  function setHitDurability(target, durability, maxDurability) {
    if (target === currentTarget) targetDurabilityElement.textContent = `${durability} / ${maxDurability}`;
  }

  function setStructureCondition(brokenCount, totalCount) {
    const intact = brokenCount === 0;
    conditionElement.textContent = intact ? 'INTACT' : brokenCount >= totalCount ? 'DEMOLISHED' : `BREACHED ${brokenCount}`;
    conditionDot.classList.toggle('airborne', !intact);
  }

  function setEquipmentState({ slot }) {
    for (const button of toolSlotButtons) {
      const selected = Number(button.dataset.toolSlot) === slot;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  function setBombStatus({ state, selected, remaining, active }) {
    const visibleState = active ? state : selected ? 'HELD / SELECTED' : state;
    bombStatusElement.textContent = visibleState;
    bombCountdownElement.textContent = remaining === null || remaining === undefined
      ? '--'
      : `${remaining.toFixed(1)}s`;
    bombStatusElement.dataset.state = state.toLowerCase().replaceAll(' ', '-').replaceAll('/', '');
  }

  function setToolSelectHandler(handler) {
    onToolSlotSelect = handler;
  }

  function setMapSelectHandler(handler) {
    onMapSelect = handler;
  }

  function onMapChange() {
    onMapSelect(mapSelector.value);
  }

  function setMapName(id, name, count, materialDescription) {
    mapSelector.value = id;
    mapNameElement.textContent = name;
    blockCountElement.textContent = String(count).padStart(3, '0');
    mapMaterialElement.textContent = materialDescription;
    mapTitleElement.textContent = id === 'brickhouse' ? 'The Blockhouse.' : name;
    mapTitleElement.closest('.site-label').classList.toggle('manor-map', id === 'timberbrick-manor');
    descriptionElement.textContent = id === 'brickhouse'
      ? 'A small assembly of big ideas.'
      : 'Masonry below. Timber above.';
  }

  function onToolSlotClick(event) {
    onToolSlotSelect(Number(event.currentTarget.dataset.toolSlot));
  }

  function renderInvertVertical() {
    invertVerticalButton.textContent = invertVertical ? 'ON' : 'OFF';
    invertVerticalButton.setAttribute('aria-pressed', String(invertVertical));
  }

  function toggleInvertVertical() {
    invertVertical = !invertVertical;
    renderInvertVertical();
    onInvertVerticalChange(invertVertical);
  }

  function setInvertVerticalHandler(handler) {
    onInvertVerticalChange = handler;
    onInvertVerticalChange(invertVertical);
  }

  function dispose() {
    invertVerticalButton.removeEventListener('click', toggleInvertVertical);
    for (const button of toolSlotButtons) button.removeEventListener('click', onToolSlotClick);
    mapSelector.removeEventListener('change', onMapChange);
  }

  invertVerticalButton.addEventListener('click', toggleInvertVertical);
  for (const button of toolSlotButtons) button.addEventListener('click', onToolSlotClick);
  mapSelector.addEventListener('change', onMapChange);
  renderInvertVertical();

  return {
    setGrounded,
    setPointerLocked,
    setCameraMode,
    setTarget,
    setHitDurability,
    setStructureCondition,
    setEquipmentState,
    setBombStatus,
    setToolSelectHandler,
    setMapSelectHandler,
    setMapName,
    setInvertVerticalHandler,
    dispose,
  };
}