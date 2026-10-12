export const DESTRUCTION_CONFIG = {
  gravity: -9.82,
  fixedTimeStep: 1 / 60,
  maxSubSteps: 4,
  maxActiveDebris: 96,
  debrisMass: 1.35,
  hammerImpulse: 7.5,
  hammerLiftImpulse: 1.8,
  bombBlastRadius: 3.8,
  bombBlockImpulse: 8,
  bombBlockLift: 2,
  bombPlayerImpulse: 36,
  bombPlayerLift: 14,
  bombDismemberRadius: 1.35,
  nearbyImpulseRadius: 1.55,
  nearbyImpulse: 2.1,
  chainDetachRadius: 0.98,
  chainImpulse: 2.4,
  supportGapTolerance: 0.075,
  supportOverlapRatio: 0.2,
  unsupportedImpulse: 0.28,
  unsupportedLift: 0.12,
  groundFriction: 0.78,
  blockFriction: 0.62,
  restitution: 0.04,
};

export function createDestructionSystem(CANNON, THREE, scene, initialBlocks, callbacks = {}) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, DESTRUCTION_CONFIG.gravity, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.axisIndex = 1;
  world.defaultContactMaterial.friction = DESTRUCTION_CONFIG.blockFriction;
  world.defaultContactMaterial.restitution = DESTRUCTION_CONFIG.restitution;

  const blockMaterial = new CANNON.Material('building-block');
  const groundMaterial = new CANNON.Material('ground');
  world.addContactMaterial(new CANNON.ContactMaterial(blockMaterial, groundMaterial, {
    friction: DESTRUCTION_CONFIG.groundFriction,
    restitution: DESTRUCTION_CONFIG.restitution,
  }));

  const blockStates = new Map();
  const activeDebris = new Map();
  let blocks = [];
  let debrisSequence = 0;
  let disposed = false;

  function publishStructureChange() {
    const brokenCount = [...blockStates.values()].filter((state) => state.detached).length;
    callbacks.onStructureChange?.(brokenCount, blocks.length);
  }

  function createBoxShape(mesh) {
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    const halfExtents = new CANNON.Vec3(
      (bounds.max.x - bounds.min.x) * 0.5 * Math.abs(mesh.scale.x),
      (bounds.max.y - bounds.min.y) * 0.5 * Math.abs(mesh.scale.y),
      (bounds.max.z - bounds.min.z) * 0.5 * Math.abs(mesh.scale.z),
    );
    return new CANNON.Box(halfExtents);
  }

  function getMeshBounds(mesh) {
    mesh.geometry.computeBoundingBox();
    const localBounds = mesh.geometry.boundingBox;
    const halfX = (localBounds.max.x - localBounds.min.x) * 0.5 * Math.abs(mesh.scale.x);
    const halfY = (localBounds.max.y - localBounds.min.y) * 0.5 * Math.abs(mesh.scale.y);
    const halfZ = (localBounds.max.z - localBounds.min.z) * 0.5 * Math.abs(mesh.scale.z);
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const rotation = mesh.getWorldQuaternion(new THREE.Quaternion());
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(rotation).elements;
    const extentX = Math.abs(matrix[0]) * halfX + Math.abs(matrix[4]) * halfY + Math.abs(matrix[8]) * halfZ;
    const extentY = Math.abs(matrix[1]) * halfX + Math.abs(matrix[5]) * halfY + Math.abs(matrix[9]) * halfZ;
    const extentZ = Math.abs(matrix[2]) * halfX + Math.abs(matrix[6]) * halfY + Math.abs(matrix[10]) * halfZ;
    return {
      center,
      minX: center.x - extentX,
      maxX: center.x + extentX,
      minY: center.y - extentY,
      maxY: center.y + extentY,
      minZ: center.z - extentZ,
      maxZ: center.z + extentZ,
      footprint: (extentX * 2) * (extentZ * 2),
    };
  }

  function setBodyTransformFromMesh(body, mesh) {
    mesh.updateMatrixWorld(true);
    const position = mesh.getWorldPosition(new THREE.Vector3());
    const quaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }

  function createStaticBody(mesh) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: blockMaterial,
    });
    body.addShape(createBoxShape(mesh));
    setBodyTransformFromMesh(body, mesh);
    world.addBody(body);
    return body;
  }

  function addGroundColliders() {
    const floor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: groundMaterial });
    floor.addShape(new CANNON.Plane());
    floor.position.set(0, -0.04, 0);
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    const pad = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: groundMaterial });
    pad.addShape(new CANNON.Box(new CANNON.Vec3(4.6, 0.09, 1.6)));
    pad.position.set(0, 0.02, 0);
    world.addBody(pad);
    return [floor, pad];
  }

  addGroundColliders();

  function registerBlocks(nextBlocks) {
    blocks = [...nextBlocks];
    scene.updateMatrixWorld(true);
    for (const mesh of blocks) {
      const originalPosition = mesh.position.clone();
      const originalQuaternion = mesh.quaternion.clone();
      const originalScale = mesh.scale.clone();
      const staticBody = createStaticBody(mesh);
      blockStates.set(mesh, {
        position: originalPosition,
        quaternion: originalQuaternion,
        scale: originalScale,
        staticBody,
        shape: staticBody.shapes[0],
        collisionBounds: getMeshBounds(mesh),
        detached: false,
        retired: false,
      });
      mesh.userData.physicsBody = staticBody;
      mesh.userData.broken = false;
      if (mesh.userData.durability === undefined) mesh.userData.durability = mesh.userData.maxDurability ?? 100;
      if (mesh.userData.maxDurability === undefined) mesh.userData.maxDurability = mesh.userData.durability;
      mesh.userData.interactable = mesh.userData.interactable ?? true;
    }
    publishStructureChange();
  }

  registerBlocks(initialBlocks);

  function removeDebris(mesh, retireVisual) {
    const debris = activeDebris.get(mesh);
    if (!debris) return;
    world.removeBody(debris.body);
    activeDebris.delete(mesh);
    mesh.userData.physicsBody = null;
    if (retireVisual) {
      mesh.visible = false;
      scene.remove(mesh);
      blockStates.get(mesh).retired = true;
    }
  }

  function enforceDebrisLimit() {
    if (activeDebris.size < DESTRUCTION_CONFIG.maxActiveDebris) return;
    const debris = [...activeDebris.entries()];
    const settled = debris.find(([, entry]) => entry.body.sleepState === CANNON.Body.SLEEPING);
    const [oldestMesh] = settled ?? debris.reduce((oldest, entry) => (
      entry[1].sequence < oldest[1].sequence ? entry : oldest
    ));
    removeDebris(oldestMesh, true);
  }

  function normalizeImpactDirection(direction, point, mesh) {
    const result = direction
      ? new THREE.Vector3(direction.x, direction.y, direction.z)
      : new THREE.Vector3().subVectors(point, mesh.position);
    if (result.lengthSq() < 1e-8) result.set(0, 0, -1);
    result.normalize();
    return result;
  }

  function impulseDynamicBody(body, impactPoint, direction, strength, lift) {
    const impulse = new CANNON.Vec3(
      direction.x * strength,
      direction.y * strength + lift,
      direction.z * strength,
    );
    const relativePoint = new CANNON.Vec3(
      impactPoint.x - body.position.x,
      impactPoint.y - body.position.y,
      impactPoint.z - body.position.z,
    );
    body.wakeUp();
    body.applyImpulse(impulse, relativePoint);
  }

  function disturbNearbyDebris(source, impactPoint, direction) {
    for (const [mesh, entry] of activeDebris) {
      if (mesh === source) continue;
      const dx = entry.body.position.x - impactPoint.x;
      const dy = entry.body.position.y - impactPoint.y;
      const dz = entry.body.position.z - impactPoint.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= DESTRUCTION_CONFIG.nearbyImpulseRadius) continue;
      const falloff = 1 - distance / DESTRUCTION_CONFIG.nearbyImpulseRadius;
      impulseDynamicBody(
        entry.body,
        impactPoint,
        direction,
        DESTRUCTION_CONFIG.nearbyImpulse * falloff,
        0.35 * falloff,
      );
    }
  }

  function hasSupport(mesh) {
    const bounds = getMeshBounds(mesh);
    const padTop = 0.11;
    const floorTop = -0.04;
    if (bounds.minY <= floorTop + 0.035) return true;

    const padOverlapX = Math.max(0, Math.min(bounds.maxX, 4.6) - Math.max(bounds.minX, -4.6));
    const padOverlapZ = Math.max(0, Math.min(bounds.maxZ, 1.6) - Math.max(bounds.minZ, -1.6));
    if (bounds.minY <= padTop + DESTRUCTION_CONFIG.supportGapTolerance
      && padOverlapX * padOverlapZ / bounds.footprint >= DESTRUCTION_CONFIG.supportOverlapRatio) return true;

    let supportedArea = 0;
    for (const [supportMesh, supportState] of blockStates) {
      if (supportMesh === mesh || supportState.detached || supportState.retired) continue;
      const support = getMeshBounds(supportMesh);
      const verticalGap = bounds.minY - support.maxY;
      if (verticalGap < -0.035 || verticalGap > DESTRUCTION_CONFIG.supportGapTolerance) continue;
      const overlapX = Math.max(0, Math.min(bounds.maxX, support.maxX) - Math.max(bounds.minX, support.minX));
      const overlapZ = Math.max(0, Math.min(bounds.maxZ, support.maxZ) - Math.max(bounds.minZ, support.minZ));
      supportedArea += overlapX * overlapZ;
    }
    return supportedArea / bounds.footprint >= DESTRUCTION_CONFIG.supportOverlapRatio;
  }

  function releaseUnsupportedBlocks(direction) {
    let released;
    do {
      released = false;
      for (const [mesh, state] of blockStates) {
        if (state.detached || state.retired || hasSupport(mesh)) continue;
        const center = getMeshBounds(mesh).center;
        if (detachBlock(mesh, center, direction, DESTRUCTION_CONFIG.unsupportedImpulse, DESTRUCTION_CONFIG.unsupportedLift, false)) {
          released = true;
        }
      }
    } while (released && activeDebris.size < DESTRUCTION_CONFIG.maxActiveDebris);
  }

  function detachBlock(
    mesh,
    impactPosition,
    impactDirection,
    impulseStrength = DESTRUCTION_CONFIG.hammerImpulse,
    liftImpulse = DESTRUCTION_CONFIG.hammerLiftImpulse,
    disturbNeighbors = true,
  ) {
    const state = blockStates.get(mesh);
    if (disposed || !state || state.detached || mesh.userData.broken) return false;

    world.removeBody(state.staticBody);
    enforceDebrisLimit();

    if (!mesh.parent) scene.add(mesh);
    mesh.visible = true;
    mesh.updateMatrixWorld(true);
    const body = new CANNON.Body({
      mass: DESTRUCTION_CONFIG.debrisMass,
      material: blockMaterial,
      linearDamping: 0.08,
      angularDamping: 0.16,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 0.9,
    });
    body.addShape(state.shape);
    setBodyTransformFromMesh(body, mesh);
    world.addBody(body);
    state.collisionBounds = getMeshBounds(mesh);

    state.detached = true;
    mesh.userData.broken = true;
    mesh.userData.interactable = false;
    mesh.userData.physicsBody = body;
    activeDebris.set(mesh, { body, sequence: debrisSequence++ });

    const point = impactPosition
      ? new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z)
      : mesh.getWorldPosition(new THREE.Vector3());
    const direction = normalizeImpactDirection(impactDirection, point, mesh);
    impulseDynamicBody(
      body,
      point,
      direction,
      impulseStrength,
      liftImpulse,
    );
    if (disturbNeighbors) disturbNearbyDebris(mesh, point, direction);
    publishStructureChange();
    return true;
  }

  function detachNearbyBlocks(source, impactPoint, direction) {
    const neighbors = [];
    for (const [mesh, state] of blockStates) {
      if (mesh === source || state.detached || state.retired) continue;
      const center = mesh.getWorldPosition(new THREE.Vector3());
      const distance = center.distanceTo(impactPoint);
      if (distance < DESTRUCTION_CONFIG.chainDetachRadius) neighbors.push({ mesh, distance });
    }

    neighbors.sort((first, second) => first.distance - second.distance);
    for (const neighbor of neighbors.slice(0, 3)) {
      const falloff = 1 - neighbor.distance / DESTRUCTION_CONFIG.chainDetachRadius;
      detachBlock(
        neighbor.mesh,
        impactPoint,
        direction,
        DESTRUCTION_CONFIG.chainImpulse * Math.max(falloff, 0.2),
        0.45,
      );
    }
  }

  function handleHammerHit({ target, durability, impactPosition, direction }) {
    if (durability <= 0) {
      const point = impactPosition
        ? new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z)
        : target.getWorldPosition(new THREE.Vector3());
      const normalizedDirection = normalizeImpactDirection(direction, point, target);
      if (detachBlock(target, point, normalizedDirection)) {
        detachNearbyBlocks(target, point, normalizedDirection);
        releaseUnsupportedBlocks(normalizedDirection);
      }
    }
    else if (impactPosition) {
      const point = new THREE.Vector3(impactPosition.x, impactPosition.y, impactPosition.z);
      disturbNearbyDebris(target, point, normalizeImpactDirection(direction, point, target));
    }
  }

  function detonateBomb(
    position,
    radius = DESTRUCTION_CONFIG.bombBlastRadius,
    strength = DESTRUCTION_CONFIG.bombBlockImpulse,
    liftStrength = DESTRUCTION_CONFIG.bombBlockLift,
  ) {
    const center = new THREE.Vector3(position.x, position.y, position.z);
    const existingDebris = [...activeDebris.entries()];
    for (const [mesh, state] of blockStates) {
      if (state.retired) continue;
      const bounds = getMeshBounds(mesh);
      const direction = bounds.center.clone().sub(center);
      const centerDistance = direction.length();
      const halfDiagonal = Math.hypot(
        (bounds.maxX - bounds.minX) * 0.5,
        (bounds.maxY - bounds.minY) * 0.5,
        (bounds.maxZ - bounds.minZ) * 0.5,
      );
      const surfaceDistance = Math.max(0, centerDistance - halfDiagonal);
      if (surfaceDistance > radius || state.detached) continue;

      const falloff = 1 - surfaceDistance / radius;
      if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
      else direction.normalize();
      mesh.userData.durability = 0;
      if (detachBlock(
        mesh,
        bounds.center,
        direction,
        strength * falloff,
        liftStrength * falloff,
        false,
      )) {
      }
    }

    for (const [mesh, { body }] of existingDebris) {
      const debrisCenter = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const direction = debrisCenter.sub(center);
      const distance = direction.length();
      if (distance > radius || direction.lengthSq() < 1e-8) continue;
      direction.normalize();
      const falloff = 1 - distance / radius;
      impulseDynamicBody(
        body,
        new THREE.Vector3(body.position.x, body.position.y, body.position.z),
        direction,
        strength * falloff,
        liftStrength * falloff,
      );
    }

    releaseUnsupportedBlocks(new THREE.Vector3(0, 1, 0));
  }

  function reset() {
    for (const mesh of [...activeDebris.keys()]) removeDebris(mesh, false);

    for (const [mesh, state] of blockStates) {
      mesh.position.copy(state.position);
      mesh.quaternion.copy(state.quaternion);
      mesh.scale.copy(state.scale);
      mesh.visible = true;
      if (!mesh.parent) scene.add(mesh);
      mesh.userData.durability = mesh.userData.maxDurability;
      mesh.userData.interactable = true;
      mesh.userData.broken = false;
      mesh.userData.physicsBody = state.staticBody;
      state.detached = false;
      state.retired = false;
      setBodyTransformFromMesh(state.staticBody, mesh);
      state.staticBody.velocity.set(0, 0, 0);
      state.staticBody.angularVelocity.set(0, 0, 0);
      state.staticBody.force.set(0, 0, 0);
      state.staticBody.torque.set(0, 0, 0);
      state.staticBody.sleepState = CANNON.Body.AWAKE;
      state.staticBody.aabbNeedsUpdate = true;
      if (!world.bodies.includes(state.staticBody)) world.addBody(state.staticBody);
      state.collisionBounds = getMeshBounds(mesh);
    }
    world.broadphase.dirty = true;
    publishStructureChange();
  }

  function replaceBlocks(nextBlocks) {
    for (const mesh of [...activeDebris.keys()]) removeDebris(mesh, false);
    for (const [mesh, state] of blockStates) {
      world.removeBody(state.staticBody);
      mesh.userData.physicsBody = null;
    }
    blockStates.clear();
    activeDebris.clear();
    registerBlocks(nextBlocks);
    world.broadphase.dirty = true;
  }

  function update(delta) {
    if (disposed) return;
    world.step(DESTRUCTION_CONFIG.fixedTimeStep, Math.min(delta, 0.1), DESTRUCTION_CONFIG.maxSubSteps);
    for (const [mesh, { body }] of activeDebris) {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      mesh.updateMatrixWorld(true);
      blockStates.get(mesh).collisionBounds = getMeshBounds(mesh);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const body of [...world.bodies]) world.removeBody(body);
    for (const mesh of blocks) {
      if (!mesh.parent) scene.add(mesh);
      mesh.visible = true;
      mesh.userData.physicsBody = null;
    }
    activeDebris.clear();
    blockStates.clear();
  }

  return {
    update,
    getWorld: () => world,
    getGroundMaterial: () => groundMaterial,
    detachBlock,
    handleHammerHit,
    detonateBomb,
    getPlayerCollisionBounds: () => [...blockStates.values()]
      .filter((state) => !state.retired)
      .map((state) => state.collisionBounds),
    reset,
    replaceBlocks,
    dispose,
    getActiveDebrisCount: () => activeDebris.size,
  };
}