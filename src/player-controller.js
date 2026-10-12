const MOVE_SPEED = 4.5;
const JUMP_SPEED = 6.1;
const GRAVITY = 19;
const PLAYER_RADIUS = 0.32;
const MAX_STEP_HEIGHT = 0.58;
const BLAST_RESPAWN_SPEED = 7.5;
const RAGDOLL_TRIGGER_SPEED = 17;
const BLAST_STOP_SPEED = 0.55;
const BLAST_STOP_DELAY = 0.25;
const BLAST_HORIZONTAL_DAMPING = 0.72;

export function createPlayerController(THREE, player, options) {
  const pressed = new Set();
  const velocity = new THREE.Vector3();
  const spawnPosition = player.position.clone();
  const obstacles = options.obstacles ?? [];
  const walkingParts = player.userData.walkingParts;
  const blastVelocity = new THREE.Vector3();
  let grounded = true;
  let blastFlight = false;
  let respawnAfterBlast = false;
  let blastStoppedFor = 0;
  let ragdollActive = false;
  let disposed = false;

  function setGrounded(value) {
    if (grounded !== value) {
      grounded = value;
      options.onGroundedChange?.(grounded);
    }
  }

  function setSpawnPosition(position) {
    spawnPosition.copy(position);
    player.position.copy(position);
    velocity.set(0, 0, 0);
    blastVelocity.set(0, 0, 0);
    setGrounded(true);
  }

  function reset() {
    pressed.clear();
    player.position.copy(spawnPosition);
    player.rotation.y = 0;
    velocity.set(0, 0, 0);
    blastVelocity.set(0, 0, 0);
    blastFlight = false;
    respawnAfterBlast = false;
    blastStoppedFor = 0;
    ragdollActive = false;
    walkingParts.phase = 0;
    for (const limb of [...walkingParts.legs, ...walkingParts.arms]) limb.rotation.x = 0;
    setGrounded(true);
    options.onReset?.();
  }

  function respawnAfterExplosion() {
    pressed.clear();
    player.position.copy(spawnPosition);
    player.rotation.y = 0;
    velocity.set(0, 0, 0);
    blastVelocity.set(0, 0, 0);
    blastFlight = false;
    respawnAfterBlast = false;
    blastStoppedFor = 0;
    walkingParts.phase = 0;
    setGrounded(true);
    options.onExplosionRespawn?.();
  }

  function completeRagdollRespawn() {
    if (!ragdollActive) return false;
    ragdollActive = false;
    respawnAfterExplosion();
    return true;
  }

  function applyExplosionImpulse(center, radius, impulseStrength, liftImpulse, dismemberRadius = 0) {
    if (ragdollActive) return false;
    const offsetX = player.position.x - center.x;
    const offsetY = player.position.y + player.userData.height * 0.45 - center.y;
    const offsetZ = player.position.z - center.z;
    const distance = Math.hypot(offsetX, offsetY, offsetZ);
    if (distance >= radius) return false;

    const falloff = 1 - distance / radius;
    let directionX = offsetX;
    let directionY = offsetY;
    let directionZ = offsetZ;
    const directionLength = Math.hypot(directionX, directionY, directionZ);
    if (directionLength < 1e-5) {
      directionX = 0;
      directionY = 0;
      directionZ = 1;
    } else {
      directionX /= directionLength;
      directionY /= directionLength;
      directionZ /= directionLength;
    }

    blastVelocity.x += directionX * impulseStrength * falloff;
    blastVelocity.y += (directionY * impulseStrength + Math.max(0, directionY) * liftImpulse) * falloff;
    blastVelocity.z += directionZ * impulseStrength * falloff;
    if (blastVelocity.length() >= RAGDOLL_TRIGGER_SPEED) {
      blastFlight = false;
      respawnAfterBlast = false;
      ragdollActive = true;
      setGrounded(false);
      options.onRagdollStart?.({
        origin: new THREE.Vector3(center.x, center.y, center.z),
        velocity: blastVelocity.clone(),
        dismembered: dismemberRadius > 0 && distance <= dismemberRadius,
      });
      blastVelocity.set(0, 0, 0);
      return true;
    }
    blastFlight = true;
    blastStoppedFor = 0;
    if (blastVelocity.length() >= BLAST_RESPAWN_SPEED) respawnAfterBlast = true;
    setGrounded(false);
    return true;
  }

  function solidBounds() {
    return [...obstacles, ...(options.getSolidBounds?.() ?? [])];
  }

  function overlapsFootprint(x, z, bounds) {
      const nearestX = Math.max(bounds.minX, Math.min(x, bounds.maxX));
      const nearestZ = Math.max(bounds.minZ, Math.min(z, bounds.maxZ));
      const offsetX = x - nearestX;
      const offsetZ = z - nearestZ;
      return offsetX * offsetX + offsetZ * offsetZ < PLAYER_RADIUS * PLAYER_RADIUS;
  }

  function hasHeadClearance(x, z, feet, boundsList) {
    const head = feet + player.userData.height;
    return !boundsList.some((bounds) => (
      overlapsFootprint(x, z, bounds)
      && bounds.maxY > feet + 0.03
      && bounds.minY < head - 0.03
    ));
  }

  function resolveStepHeight(x, z, boundsList) {
    const feet = player.position.y;
    let stepHeight = feet;
    for (const bounds of boundsList) {
      if (!overlapsFootprint(x, z, bounds)) continue;
      if (bounds.maxY <= feet + 0.03 || bounds.minY >= feet + player.userData.height) continue;
      if (bounds.maxY > feet + MAX_STEP_HEIGHT) return null;
      stepHeight = Math.max(stepHeight, bounds.maxY);
    }
    if (stepHeight > feet + 0.03 && !hasHeadClearance(x, z, stepHeight, boundsList)) return null;
    return stepHeight;
  }

  function groundHeightAt(x, z) {
    let groundHeight = -0.04;
    for (const region of options.getGroundRegions?.() ?? []) {
      if (
        x >= region.minX - PLAYER_RADIUS && x <= region.maxX + PLAYER_RADIUS
        && z >= region.minZ - PLAYER_RADIUS && z <= region.maxZ + PLAYER_RADIUS
      ) groundHeight = Math.max(groundHeight, region.height);
    }
    for (const bounds of solidBounds()) {
      if (overlapsFootprint(x, z, bounds) && bounds.maxY <= player.position.y + 0.03) {
        groundHeight = Math.max(groundHeight, bounds.maxY);
      }
    }
    return groundHeight;
  }

  function onKeyDown(event) {
    if (event.code === 'Space') event.preventDefault();
    if (event.code === 'KeyR' && !event.repeat) {
      reset();
      return;
    }
    if (event.code === 'Space' && !event.repeat && grounded) {
      velocity.y = JUMP_SPEED;
      setGrounded(false);
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) pressed.add(event.code);
  }

  function onKeyUp(event) {
    pressed.delete(event.code);
  }

  function clearPressed() {
    pressed.clear();
  }

  function update(delta) {
    if (disposed) return;
    if (ragdollActive) return;
    const step = Math.min(delta, 0.05);
    if (blastFlight || respawnAfterBlast) {
      if (blastFlight) {
        blastVelocity.y -= GRAVITY * step;
        const horizontalDamping = Math.exp(-BLAST_HORIZONTAL_DAMPING * step);
        blastVelocity.x *= horizontalDamping;
        blastVelocity.z *= horizontalDamping;
        player.position.x += blastVelocity.x * step;
        player.position.y += blastVelocity.y * step;
        player.position.z += blastVelocity.z * step;

        const groundHeight = groundHeightAt(player.position.x, player.position.z);
        if (player.position.y <= groundHeight) {
          player.position.y = groundHeight;
          blastVelocity.y = 0;
          blastFlight = false;
          setGrounded(true);
        }
      }

      if (respawnAfterBlast && grounded) {
        const groundDrag = Math.exp(-8 * step);
        blastVelocity.x *= groundDrag;
        blastVelocity.z *= groundDrag;
        if (Math.hypot(blastVelocity.x, blastVelocity.z) <= BLAST_STOP_SPEED) blastStoppedFor += step;
        else blastStoppedFor = 0;
        if (blastStoppedFor >= BLAST_STOP_DELAY) respawnAfterExplosion();
      }

      walkingParts.phase += step * 8;
      const blastSwing = Math.sin(walkingParts.phase) * 0.18;
      walkingParts.legs[0].rotation.x = blastSwing;
      walkingParts.legs[1].rotation.x = -blastSwing;
      walkingParts.arms[0].rotation.x = -blastSwing;
      walkingParts.arms[1].rotation.x = blastSwing;
      return;
    }

    const forwardInput = Number(pressed.has('KeyW')) - Number(pressed.has('KeyS'));
    const rightInput = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
    const moving = forwardInput !== 0 || rightInput !== 0;

    if (moving) {
      const cameraYaw = options.getCameraYaw();
      const directionX = -Math.sin(cameraYaw) * forwardInput + Math.cos(cameraYaw) * rightInput;
      const directionZ = -Math.cos(cameraYaw) * forwardInput - Math.sin(cameraYaw) * rightInput;
      const length = Math.hypot(directionX, directionZ);
      const normalizedX = directionX / length;
      const normalizedZ = directionZ / length;
      player.rotation.y = Math.atan2(-normalizedX, -normalizedZ);

      const distance = MOVE_SPEED * step;
      const nextX = player.position.x + normalizedX * distance;
      const boundsList = solidBounds();
      const xStepHeight = resolveStepHeight(nextX, player.position.z, boundsList);
      if (xStepHeight !== null) {
        player.position.x = nextX;
        if (xStepHeight > player.position.y + 0.03) {
          player.position.y = xStepHeight;
          velocity.y = 0;
          setGrounded(true);
        }
      }
      const nextZ = player.position.z + normalizedZ * distance;
      const zStepHeight = resolveStepHeight(player.position.x, nextZ, boundsList);
      if (zStepHeight !== null) {
        player.position.z = nextZ;
        if (zStepHeight > player.position.y + 0.03) {
          player.position.y = zStepHeight;
          velocity.y = 0;
          setGrounded(true);
        }
      }

      walkingParts.phase += step * 10;
    }

    const groundHeight = groundHeightAt(player.position.x, player.position.z);
    if (grounded && groundHeight > player.position.y && groundHeight - player.position.y <= MAX_STEP_HEIGHT) {
      player.position.y = groundHeight;
      velocity.y = 0;
    } else if (!grounded || player.position.y > groundHeight) {
      velocity.y -= GRAVITY * step;
      player.position.y += velocity.y * step;
      if (player.position.y <= groundHeight) {
        player.position.y = groundHeight;
        velocity.y = 0;
        setGrounded(true);
      }
    }

    const swing = moving && grounded ? Math.sin(walkingParts.phase) * 0.48 : 0;
    walkingParts.legs[0].rotation.x = swing;
    walkingParts.legs[1].rotation.x = -swing;
    walkingParts.arms[0].rotation.x = -swing * 0.72;
    walkingParts.arms[1].rotation.x = swing * 0.72;
  }

  function dispose() {
    disposed = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clearPressed);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.hidden) clearPressed();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearPressed);
  document.addEventListener('visibilitychange', onVisibilityChange);
  options.onGroundedChange?.(grounded);

  return { update, reset, setSpawnPosition, clearPressed, applyExplosionImpulse, completeRagdollRespawn, dispose };
}