export const INTERACTION_RANGE = 2.5;
export const VERTICAL_RANGE_BONUS = 0.3;

export function getInteractionRange(verticalDirection) {
  const verticality = Math.min(1, Math.abs(verticalDirection));
  return INTERACTION_RANGE * (1 + VERTICAL_RANGE_BONUS * verticality);
}

export function createInteractionSystem(THREE, scene, camera, player, onTargetChange = () => {}) {
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);
  const helper = new THREE.BoxHelper(new THREE.Object3D(), 0xffffff);
  helper.material.transparent = true;
  helper.material.opacity = 1;
  helper.material.depthWrite = false;
  helper.material.toneMapped = false;
  helper.visible = false;
  helper.renderOrder = 2;
  helper.raycast = () => {};
  scene.add(helper);

  let currentTarget = null;
  let currentHitPoint = null;
  let currentPlacementHit = null;
  let disposed = false;

  function belongsToPlayer(object) {
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (ancestor === player) return true;
    }
    return false;
  }

  function ignoresInteractionRay(object) {
    for (let current = object; current; current = current.parent) {
      if (current.userData.interactionIgnore) return true;
    }
    return false;
  }

  function setTarget(target) {
    if (target === currentTarget) return;
    currentTarget = target;
    helper.visible = Boolean(target);
    onTargetChange(target);
  }

  function update() {
    if (disposed) return;
    raycaster.setFromCamera(screenCenter, camera);
    const activeRange = getInteractionRange(raycaster.ray.direction.y);
    raycaster.far = camera.position.distanceTo(player.position) + activeRange;
    const intersections = raycaster.intersectObjects(scene.children, true);
    const obstruction = intersections.find((hit) => !belongsToPlayer(hit.object) && !ignoresInteractionRay(hit.object));
    const inRange = obstruction && obstruction.point.distanceTo(player.position) <= activeRange;
    const target = inRange && obstruction.object.userData.interactable === true ? obstruction.object : null;

    currentHitPoint = target ? obstruction.point.clone() : null;
    if (inRange) {
      const normal = obstruction.face?.normal
        ? obstruction.face.normal.clone().transformDirection(obstruction.object.matrixWorld).normalize()
        : raycaster.ray.direction.clone().negate();
      currentPlacementHit = {
        object: obstruction.object,
        point: obstruction.point.clone(),
        normal,
        distance: obstruction.point.distanceTo(player.position),
      };
    } else {
      currentPlacementHit = null;
    }
    setTarget(target);
    if (target) helper.setFromObject(target);
  }

  function clearTarget() {
    currentHitPoint = null;
    currentPlacementHit = null;
    setTarget(null);
  }

  function dispose() {
    disposed = true;
    scene.remove(helper);
    helper.geometry.dispose();
    helper.material.dispose();
    clearTarget();
  }

  return {
    update,
    getTarget: () => currentTarget,
    getTargetPoint: () => currentHitPoint?.clone() ?? null,
    getPlacementHit: () => currentPlacementHit ? {
      ...currentPlacementHit,
      point: currentPlacementHit.point.clone(),
      normal: currentPlacementHit.normal.clone(),
    } : null,
    clearTarget,
    dispose,
  };
}