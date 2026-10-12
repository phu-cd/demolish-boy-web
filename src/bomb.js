export const BOMB_CONFIG = {
  fuseSeconds: 3,
  placementRange: 3.25,
  ignitionRange: 2.15,
  shellRadius: 0.23,
  surfaceOffset: 0.235,
  playerClearance: 0.72,
  visualRemovalDelay: 0.55,
  dragCancelDistance: 8,
};

const BOMB_STATES = {
  SELECTED: 'HELD / SELECTED',
  PLACED: 'PLACED',
  IGNITED: 'IGNITED',
  DETONATED: 'DETONATED',
  REMOVED: 'REMOVED',
};

export function createBombSystem(THREE, scene, player, canvas, interaction, destruction, callbacks = {}) {
  const up = new THREE.Vector3(0, 1, 0);
  const placementPreview = new THREE.Group();
  placementPreview.name = 'Bomb placement preview';
  placementPreview.userData.interactionIgnore = true;
  const previewShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BOMB_CONFIG.shellRadius, 1),
    new THREE.MeshStandardMaterial({ color: 0x303a3d, roughness: 0.52, flatShading: true, transparent: true, opacity: 0.45 }),
  );
  previewShell.userData.interactionIgnore = true;
  placementPreview.add(previewShell);
  const previewRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.018, 5, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 0.65 }),
  );
  previewRing.rotation.x = Math.PI / 2;
  previewRing.userData.interactionIgnore = true;
  placementPreview.add(previewRing);
  placementPreview.visible = false;
  scene.add(placementPreview);

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x303a3d, roughness: 0.5, metalness: 0.25, flatShading: true });
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x89969a, roughness: 0.42, metalness: 0.62, flatShading: true });
  const fuseMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ba4e, emissive: 0x9d4a1b, emissiveIntensity: 0.8, roughness: 0.6, flatShading: true });
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf79, toneMapped: false });
  const sparkGeometry = new THREE.TetrahedronGeometry(0.055, 0);

  let selected = false;
  let activeBomb = null;
  let state = BOMB_STATES.REMOVED;
  let pointerPress = null;
  let disposed = false;

  function createBombVisual() {
    const group = new THREE.Group();
    group.name = 'Placed demolition bomb';
    group.userData.interactionIgnore = true;

    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(BOMB_CONFIG.shellRadius, 1), shellMaterial);
    shell.castShadow = true;
    shell.userData.interactionIgnore = true;
    group.add(shell);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.026, 6, 12), bandMaterial);
    band.userData.interactionIgnore = true;
    group.add(band);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 8), bandMaterial);
    cap.position.y = 0.22;
    cap.castShadow = true;
    cap.userData.interactionIgnore = true;
    group.add(cap);

    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.15, 6), fuseMaterial);
    fuse.position.set(0, 0.32, 0);
    fuse.rotation.z = -0.22;
    fuse.userData.interactionIgnore = true;
    group.add(fuse);

    const spark = new THREE.Group();
    spark.position.set(0.018, 0.405, 0);
    spark.userData.interactionIgnore = true;
    for (let index = 0; index < 3; index += 1) {
      const particle = new THREE.Mesh(sparkGeometry, sparkMaterial);
      particle.position.set(Math.cos(index * 2.1) * 0.055, index * 0.035, Math.sin(index * 2.1) * 0.055);
      particle.userData.interactionIgnore = true;
      spark.add(particle);
    }
    spark.visible = false;
    group.add(spark);

    const light = new THREE.PointLight(0xff9b3f, 0, 1.5, 2);
    light.position.copy(spark.position);
    group.add(light);
    return { group, spark, light, shell };
  }

  function publishStatus(remaining = null) {
    callbacks.onStatus?.({
      state,
      selected,
      remaining,
      active: Boolean(activeBomb),
    });
  }

  function setSelected(value) {
    selected = Boolean(value);
    if (selected && !activeBomb) state = BOMB_STATES.SELECTED;
    else if (!activeBomb) state = BOMB_STATES.REMOVED;
    publishStatus();
  }

  function getPlacement() {
    const hit = interaction.getPlacementHit();
    if (!hit || hit.distance > BOMB_CONFIG.placementRange) return null;
    const position = hit.point.clone().addScaledVector(hit.normal, BOMB_CONFIG.surfaceOffset);
    if (position.distanceTo(player.position) < BOMB_CONFIG.playerClearance) return null;
    return { ...hit, position };
  }

  function placeBomb() {
    if (!selected || activeBomb) return false;
    const placement = getPlacement();
    if (!placement) return false;

    const visual = createBombVisual();
    visual.group.position.copy(placement.position);
    visual.group.quaternion.setFromUnitVectors(up, placement.normal);
    scene.add(visual.group);
    activeBomb = {
      ...visual,
      state: BOMB_STATES.PLACED,
      remaining: BOMB_CONFIG.fuseSeconds,
      removalTimer: 0,
      time: 0,
    };
    state = BOMB_STATES.PLACED;
    placementPreview.visible = false;
    publishStatus();
    return true;
  }

  function igniteNearest() {
    if (!activeBomb || activeBomb.state !== BOMB_STATES.PLACED) return false;
    const distance = activeBomb.group.position.distanceTo(player.position);
    if (distance > BOMB_CONFIG.ignitionRange) return false;
    activeBomb.state = BOMB_STATES.IGNITED;
    activeBomb.ignitedAt = performance.now();
    state = BOMB_STATES.IGNITED;
    activeBomb.spark.visible = true;
    publishStatus(activeBomb.remaining);
    return true;
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.target !== canvas || !selected || activeBomb) return;
    pointerPress = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
  }

  function onPointerMove(event) {
    if (!pointerPress || pointerPress.pointerId !== event.pointerId) return;
    if (document.pointerLockElement === canvas) {
      pointerPress.travel += Math.hypot(event.movementX, event.movementY);
    } else {
      pointerPress.travel += Math.hypot(event.clientX - pointerPress.x, event.clientY - pointerPress.y);
      pointerPress.x = event.clientX;
      pointerPress.y = event.clientY;
    }
  }

  function onPointerUp(event) {
    if (!pointerPress || pointerPress.pointerId !== event.pointerId) return;
    const travel = pointerPress.travel;
    pointerPress = null;
    if (travel <= BOMB_CONFIG.dragCancelDistance) placeBomb();
  }

  function onKeyDown(event) {
    if (event.code !== 'KeyF' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (igniteNearest()) event.preventDefault();
  }

  function update(delta) {
    if (disposed) return;
    const step = Math.min(delta, 0.05);
    if (selected && !activeBomb) {
      const placement = getPlacement();
      placementPreview.visible = Boolean(placement);
      if (placement) {
        placementPreview.position.copy(placement.position);
        placementPreview.quaternion.setFromUnitVectors(up, placement.normal);
      }
    } else {
      placementPreview.visible = false;
    }

    if (!activeBomb) return;
    activeBomb.time += step;
    if (activeBomb.state === BOMB_STATES.IGNITED) {
      const elapsed = (performance.now() - activeBomb.ignitedAt) / 1000;
      activeBomb.remaining = Math.max(0, BOMB_CONFIG.fuseSeconds - elapsed);
      const sparkPulse = 0.6 + Math.abs(Math.sin(activeBomb.time * 25)) * 1.4;
      activeBomb.light.intensity = sparkPulse;
      activeBomb.spark.scale.setScalar(0.75 + Math.abs(Math.sin(activeBomb.time * 18)) * 0.6);
      callbacks.onStatus?.({ state, selected, remaining: activeBomb.remaining, active: true });
      if (activeBomb.remaining <= 0) {
        activeBomb.state = BOMB_STATES.DETONATED;
        state = BOMB_STATES.DETONATED;
        activeBomb.spark.visible = false;
        activeBomb.light.intensity = 7;
        activeBomb.shell.material = new THREE.MeshBasicMaterial({ color: 0xffc65b, toneMapped: false });
        activeBomb.shell.scale.setScalar(2.2);
        activeBomb.removalTimer = BOMB_CONFIG.visualRemovalDelay;
        const blastPosition = activeBomb.group.position.clone();
        destruction.detonateBomb(blastPosition);
        callbacks.onDetonate?.(blastPosition);
        publishStatus(0);
      }
    } else if (activeBomb.state === BOMB_STATES.DETONATED) {
      activeBomb.removalTimer -= step;
      if (activeBomb.removalTimer <= 0) {
        scene.remove(activeBomb.group);
        activeBomb.group.traverse((object) => {
          if (object.isMesh && object.geometry !== sparkGeometry) object.geometry.dispose();
          if (object.material?.isMaterial && object.material !== shellMaterial && object.material !== bandMaterial && object.material !== fuseMaterial && object.material !== sparkMaterial) object.material.dispose();
        });
        activeBomb.shell.scale.setScalar(1);
        activeBomb = null;
        state = selected ? BOMB_STATES.SELECTED : BOMB_STATES.REMOVED;
        publishStatus();
      }
    }
  }

  function reset() {
    pointerPress = null;
    if (activeBomb) {
      scene.remove(activeBomb.group);
      activeBomb.group.traverse((object) => {
        if (object.isMesh && object.geometry !== sparkGeometry) object.geometry.dispose();
        if (object.material?.isMaterial && object.material !== shellMaterial && object.material !== bandMaterial && object.material !== fuseMaterial && object.material !== sparkMaterial) object.material.dispose();
      });
      activeBomb.shell.scale.setScalar(1);
      activeBomb = null;
    }
    placementPreview.visible = false;
    state = selected ? BOMB_STATES.SELECTED : BOMB_STATES.REMOVED;
    publishStatus();
  }

  function dispose() {
    disposed = true;
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    reset();
    scene.remove(placementPreview);
    previewShell.geometry.dispose();
    previewShell.material.dispose();
    previewRing.geometry.dispose();
    previewRing.material.dispose();
    sparkGeometry.dispose();
    shellMaterial.dispose();
    bandMaterial.dispose();
    fuseMaterial.dispose();
    sparkMaterial.dispose();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  publishStatus();

  return {
    setSelected,
    update,
    reset,
    dispose,
    getState: () => activeBomb?.state ?? state,
    getActiveBomb: () => activeBomb?.group ?? null,
  };
}