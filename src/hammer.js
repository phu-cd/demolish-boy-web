import { BLOCK_DURABILITY } from './building.js';

const HAMMER_DAMAGE = 25;
const HAMMER_COOLDOWN = 0.72;
const SWING_DURATION = 0.29;
const HIT_TIME = 0.145;
const FLASH_DURATION = 0.16;
const DRAG_CANCEL_DISTANCE = 8;
const HOLD_REPEAT_DELAY = 0.18;
const HAMMER_FACE_FORWARD = Math.PI / 2;

export function createHammerSystem(THREE, player, canvas, interaction, callbacks = {}) {
  const hammerPivot = new THREE.Group();
  hammerPivot.name = 'Equipped hammer';
  hammerPivot.visible = false;
  player.userData.hammerHand.add(hammerPivot);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5735, roughness: 0.88, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0x75848a, metalness: 0.55, roughness: 0.4, flatShading: true });
  const strikingFace = new THREE.MeshStandardMaterial({ color: 0x536169, metalness: 0.65, roughness: 0.32, flatShading: true });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.54, 7), wood);
  handle.position.y = 0.27;
  handle.castShadow = true;
  hammerPivot.add(handle);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.2), steel);
  head.position.y = 0.56;
  head.castShadow = true;
  hammerPivot.add(head);

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.215), strikingFace);
  face.position.x = 0.235;
  face.position.y = 0.56;
  face.castShadow = true;
  hammerPivot.add(face);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 7), new THREE.MeshStandardMaterial({
    color: 0x463e35,
    roughness: 0.95,
    flatShading: true,
  }));
  grip.position.y = 0.055;
  grip.castShadow = true;
  hammerPivot.add(grip);

  const restingPose = { x: -0.08, z: -0.24 };
  const windupPose = { x: 1.12, z: -0.72 };
  const impactPose = { x: -1.28, z: -0.12 };
  const followThroughPose = { x: -0.62, z: 0.18 };
  hammerPivot.rotation.set(restingPose.x, HAMMER_FACE_FORWARD, restingPose.z);

  const flashedMaterials = new Map();
  let selectedSlot = 0;
  let equipped = false;
  let attack = null;
  let cooldown = 0;
  let pointerPress = null;
  let repeatHeld = false;
  let disposed = false;

  function publishEquipState() {
    callbacks.onEquipmentChange?.({ slot: selectedSlot, equipped, tool: equipped ? 'HAMMER' : 'EMPTY' });
  }

  function selectSlot(slot) {
    if (![1, 2, 3].includes(slot)) return;
    selectedSlot = slot;
    equipped = slot === 1;
    hammerPivot.visible = equipped;
    if (!equipped && attack) {
      attack = null;
      repeatHeld = false;
      hammerPivot.rotation.set(restingPose.x, HAMMER_FACE_FORWARD, restingPose.z);
    }
    if (!equipped) pointerPress = null;
    publishEquipState();
  }

  function flashBlock(block) {
    if (flashedMaterials.has(block)) return;
    const original = block.material;
    const flash = original.clone();
    if ('emissive' in flash) {
      flash.emissive.setHex(0xffa43b);
      flash.emissiveIntensity = 1.4;
    }
    block.material = flash;
    flashedMaterials.set(block, { original, flash, remaining: FLASH_DURATION });
  }

  function applyCapturedHit(capturedAttack) {
    const { target } = capturedAttack;
    if (!target || target.userData.interactable !== true || target.userData.durability <= 0) return;
    const maxDurability = target.userData.maxDurability ?? BLOCK_DURABILITY;
    target.userData.durability = Math.max(0, target.userData.durability - HAMMER_DAMAGE);
    flashBlock(target);
    callbacks.onHit?.({
      target,
      durability: target.userData.durability,
      maxDurability,
      damage: HAMMER_DAMAGE,
      impactPosition: capturedAttack.impactPosition,
      direction: capturedAttack.direction,
    });
  }

  function beginAttack() {
    if (!equipped || attack || cooldown > 0) return;
    const target = interaction.getTarget();
    const impactPosition = target ? interaction.getTargetPoint?.() : null;
    const direction = impactPosition
      ? impactPosition.clone().sub(player.position).normalize()
      : new THREE.Vector3(0, 0, -1);
    attack = { elapsed: 0, target, impactPosition, direction, hit: false };
    cooldown = HAMMER_COOLDOWN;
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.target !== canvas) return;
    pointerPress = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      travel: 0,
      heldFor: 0,
      started: false,
      dragged: false,
    };
  }

  function onPointerMove(event) {
    const press = pointerPress;
    if (!press || press.pointerId !== event.pointerId) return;
    if (document.pointerLockElement === canvas) {
      press.travel += Math.hypot(event.movementX, event.movementY);
    } else {
      press.travel += Math.hypot(event.clientX - press.x, event.clientY - press.y);
      press.x = event.clientX;
      press.y = event.clientY;
      if (press.travel > DRAG_CANCEL_DISTANCE) {
        press.dragged = true;
        repeatHeld = false;
      }
    }
  }

  function onPointerUp(event) {
    const press = pointerPress;
    if (!press || press.pointerId !== event.pointerId) return;
    pointerPress = null;
    repeatHeld = false;
    if (!press.started && !press.dragged && press.travel <= DRAG_CANCEL_DISTANCE) beginAttack();
  }

  function onWindowBlur() {
    pointerPress = null;
    repeatHeld = false;
  }

  function update(delta) {
    if (disposed) return;
    const step = Math.min(delta, 0.05);
    cooldown = Math.max(0, cooldown - step);

    if (pointerPress && !pointerPress.dragged && !pointerPress.started) {
      pointerPress.heldFor += step;
      if (pointerPress.heldFor >= HOLD_REPEAT_DELAY) {
        pointerPress.started = true;
        repeatHeld = true;
        beginAttack();
      }
    }
    if (repeatHeld && !attack && cooldown <= 0) beginAttack();

    for (const [block, flash] of flashedMaterials) {
      flash.remaining -= step;
      if (flash.remaining <= 0) {
        block.material = flash.original;
        flash.flash.dispose();
        flashedMaterials.delete(block);
      }
    }

    if (!attack) return;
    attack.elapsed += step;
    if (!attack.hit && attack.elapsed >= HIT_TIME) {
      attack.hit = true;
      applyCapturedHit(attack);
    }

    if (attack.elapsed < 0.08) {
      const amount = THREE.MathUtils.smoothstep(attack.elapsed, 0, 0.08);
      hammerPivot.rotation.x = THREE.MathUtils.lerp(restingPose.x, windupPose.x, amount);
      hammerPivot.rotation.z = THREE.MathUtils.lerp(restingPose.z, windupPose.z, amount);
    } else if (attack.elapsed < 0.16) {
      const amount = THREE.MathUtils.smoothstep(attack.elapsed, 0.08, 0.16);
      hammerPivot.rotation.x = THREE.MathUtils.lerp(windupPose.x, impactPose.x, amount);
      hammerPivot.rotation.z = THREE.MathUtils.lerp(windupPose.z, impactPose.z, amount);
    } else if (attack.elapsed < 0.21) {
      const amount = THREE.MathUtils.smoothstep(attack.elapsed, 0.16, 0.21);
      hammerPivot.rotation.x = THREE.MathUtils.lerp(impactPose.x, followThroughPose.x, amount);
      hammerPivot.rotation.z = THREE.MathUtils.lerp(impactPose.z, followThroughPose.z, amount);
    } else if (attack.elapsed < SWING_DURATION) {
      const amount = THREE.MathUtils.smoothstep(attack.elapsed, 0.21, SWING_DURATION);
      hammerPivot.rotation.x = THREE.MathUtils.lerp(followThroughPose.x, restingPose.x, amount);
      hammerPivot.rotation.z = THREE.MathUtils.lerp(followThroughPose.z, restingPose.z, amount);
    } else {
      hammerPivot.rotation.set(restingPose.x, HAMMER_FACE_FORWARD, restingPose.z);
      attack = null;
    }
  }

  function dispose() {
    disposed = true;
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('blur', onWindowBlur);
    for (const [block, flash] of flashedMaterials) {
      block.material = flash.original;
      flash.flash.dispose();
    }
    flashedMaterials.clear();
  }

  function reset() {
    attack = null;
    cooldown = 0;
    pointerPress = null;
    repeatHeld = false;
    hammerPivot.rotation.set(restingPose.x, HAMMER_FACE_FORWARD, restingPose.z);
    for (const [block, flash] of flashedMaterials) {
      block.material = flash.original;
      flash.flash.dispose();
    }
    flashedMaterials.clear();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('blur', onWindowBlur);

  return { update, selectSlot, reset, dispose };
}