const MOUSE_SENSITIVITY = 0.0025;
const MIN_PITCH = -0.65;
const MAX_PITCH = 1.15;
const DEFAULT_PITCH = Math.atan2(1.3, Math.hypot(3.4, 6.3));
const CAMERA_VIEWS = [
  { label: 'CLOSE', distance: 5.4 },
  { label: 'STANDARD', distance: 7.16 },
  { label: 'FAR', distance: 9.2 },
];

export function createCamera(THREE, renderer, element, onPointerLockChange, onCameraModeChange) {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
  const lookTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let yaw = Math.atan2(3.4, 6.3);
  let pitch = DEFAULT_PITCH;
  let framingScale = 1;
  let initialized = false;
  let fallbackDragging = false;
  let invertVertical = false;
  let cameraViewIndex = 1;
  let currentDistance = CAMERA_VIEWS[cameraViewIndex].distance;
  let mapFovOverride = null;

  function update(position, delta, snap = false) {
    const followAmount = 1 - Math.exp(-8 * Math.min(delta, 0.1));
    const targetDistance = CAMERA_VIEWS[cameraViewIndex].distance;
    if (snap || !initialized) currentDistance = targetDistance;
    else currentDistance += (targetDistance - currentDistance) * followAmount;

    const orbitDistance = currentDistance * framingScale;
    const horizontalDistance = orbitDistance * Math.cos(pitch);
    offset.set(
      Math.sin(yaw) * horizontalDistance,
      1.95 + Math.max(0, Math.sin(pitch)) * orbitDistance,
      Math.cos(yaw) * horizontalDistance,
    );
    desiredPosition.copy(position).add(offset);
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    focus.copy(position).add(forward.multiplyScalar(1.3 * orbitDistance / CAMERA_VIEWS[1].distance));
    focus.y += 1.95 + Math.max(0, -Math.sin(pitch)) * orbitDistance;
    lookTarget.copy(focus);

    if (snap || !initialized) {
      camera.position.copy(desiredPosition);
      initialized = true;
    } else {
      camera.position.lerp(desiredPosition, followAmount);
    }
    camera.lookAt(lookTarget);
  }

  function onMouseMove(event) {
    if (document.pointerLockElement !== element && !fallbackDragging) return;
    yaw -= event.movementX * MOUSE_SENSITIVITY;
    const verticalDirection = invertVertical ? -1 : 1;
    pitch = THREE.MathUtils.clamp(
      pitch + event.movementY * MOUSE_SENSITIVITY * verticalDirection,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  function onMouseDown(event) {
    if (event.button === 0 && document.pointerLockElement !== element) fallbackDragging = true;
  }

  function onMouseUp() {
    fallbackDragging = false;
  }

  function onWindowBlur() {
    fallbackDragging = false;
  }

  function onKeyDown(event) {
    if (event.code === 'KeyV' && !event.repeat) {
      cameraViewIndex = (cameraViewIndex + 1) % CAMERA_VIEWS.length;
      onCameraModeChange?.(CAMERA_VIEWS[cameraViewIndex].label);
      return;
    }
    if (event.code !== 'Escape') return;
    fallbackDragging = false;
    if (document.pointerLockElement === element) document.exitPointerLock();
    else onPointerLockChange?.(false, false);
  }

  function onCanvasClick() {
    if (document.pointerLockElement === element || !element.requestPointerLock) return;
    try {
      const request = element.requestPointerLock();
      request?.catch?.(() => onPointerLockChange?.(false, true));
    } catch {
      onPointerLockChange?.(false, true);
    }
  }

  function handlePointerLockChange() {
    const locked = document.pointerLockElement === element;
    if (locked) fallbackDragging = false;
    onPointerLockChange?.(locked, false);
  }

  function handlePointerLockError() {
    onPointerLockChange?.(false, true);
  }

  function resize(width, height) {
    framingScale = width < 600 ? 1.75 : width < 900 ? 1.35 : 1;
    camera.fov = mapFovOverride ?? (width < 600 ? 68 : width < 900 ? 58 : 48);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function setInvertVertical(inverted) {
    invertVertical = Boolean(inverted);
  }

  function setMode(mode) {
    const index = CAMERA_VIEWS.findIndex((viewMode) => viewMode.label === mode);
    if (index < 0 || index === cameraViewIndex) return;
    cameraViewIndex = index;
    onCameraModeChange?.(CAMERA_VIEWS[cameraViewIndex].label);
  }

  function setPitch(value) {
    pitch = THREE.MathUtils.clamp(value, MIN_PITCH, MAX_PITCH);
  }

  function setMapFov(value = null) {
    mapFovOverride = value;
    camera.fov = mapFovOverride ?? (camera.aspect < 0.75 ? 68 : camera.aspect < 1 ? 58 : 48);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    element.removeEventListener('click', onCanvasClick);
    element.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', handlePointerLockChange);
    document.removeEventListener('pointerlockerror', handlePointerLockError);
    if (document.pointerLockElement === element) document.exitPointerLock();
  }

  element.addEventListener('click', onCanvasClick);
  element.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  document.addEventListener('pointerlockerror', handlePointerLockError);
  onCameraModeChange?.(CAMERA_VIEWS[cameraViewIndex].label);

  return {
    camera,
    resize,
    update,
    getYaw: () => yaw,
    getMode: () => CAMERA_VIEWS[cameraViewIndex].label,
    setMode,
    setPitch,
    setMapFov,
    resetPitch: () => { pitch = DEFAULT_PITCH; },
    setInvertVertical,
    snap: () => { initialized = false; },
    dispose,
  };
}