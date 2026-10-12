import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCamera } from './camera.js';
import { createTestMap } from './maps.js';
import { createPlayer } from './player.js';
import { createPlayerController } from './player-controller.js';
import { createInteractionSystem } from './interaction.js';
import { createHammerSystem } from './hammer.js';
import { createBombSystem } from './bomb.js';
import { createRagdollSystem } from './ragdoll.js';
import { createDestructionSystem, DESTRUCTION_CONFIG } from './destruction.js';
import { createScene } from './scene.js';
import { createUI } from './ui.js';
import './style.css';

const mount = document.querySelector('#scene');
const scene = createScene(THREE);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
mount.appendChild(renderer.domElement);

let activeMap = createTestMap(THREE, scene, 'brickhouse');
const player = createPlayer(THREE, scene, new THREE.Vector3(0, -0.04, 5.2));
const ui = createUI(activeMap.count);
let destruction;
let controller;
let interaction;
let hammer;
let bomb;
let ragdoll;
let selectedSlot = 0;
const view = createCamera(THREE, renderer, renderer.domElement, (pointerLocked, failed) => {
  ui.setPointerLocked(pointerLocked, failed);
  if (!pointerLocked) controller?.clearPressed();
}, ui.setCameraMode);
ui.setInvertVerticalHandler(view.setInvertVertical);
controller = createPlayerController(THREE, player, {
  getGroundRegions: () => activeMap.groundRegions ?? [],
  getSolidBounds: () => destruction?.getPlayerCollisionBounds() ?? [],
  getCameraYaw: view.getYaw,
  onGroundedChange: ui.setGrounded,
  onExplosionRespawn: () => {
    view.snap();
    interaction?.clearTarget();
  },
  onRagdollStart: ({ origin, velocity, dismembered }) => ragdoll?.start(origin, velocity, dismembered),
  onReset: () => {
    view.snap();
    ragdoll?.reset();
    destruction?.reset();
    interaction?.clearTarget();
    hammer?.reset();
    bomb?.reset();
  },
});
interaction = createInteractionSystem(THREE, scene, view.camera, player, (target) => {
  document.querySelector('#crosshair').classList.toggle('targeted', Boolean(target));
  ui.setTarget(target);
});
hammer = createHammerSystem(THREE, player, renderer.domElement, interaction, {
  onEquipmentChange: ui.setEquipmentState,
  onHit: (hit) => {
    ui.setHitDurability(hit.target, hit.durability, hit.maxDurability);
    destruction?.handleHammerHit(hit);
  },
});

function createActiveMapSystems() {
  destruction = createDestructionSystem(CANNON, THREE, scene, activeMap.blocks, {
    onStructureChange: ui.setStructureCondition,
  });
  ragdoll = createRagdollSystem(CANNON, THREE, scene, destruction.getWorld(), player, destruction.getGroundMaterial(), {
    onSettle: () => controller.completeRagdollRespawn(),
  });
  bomb = createBombSystem(THREE, scene, player, renderer.domElement, interaction, destruction, {
    onStatus: ui.setBombStatus,
    onDetonate: (position) => controller.applyExplosionImpulse(
      position,
      DESTRUCTION_CONFIG.bombBlastRadius,
      DESTRUCTION_CONFIG.bombPlayerImpulse,
      DESTRUCTION_CONFIG.bombPlayerLift,
      DESTRUCTION_CONFIG.bombDismemberRadius,
    ),
  });
  bomb.setSelected(selectedSlot === 2);
}

function switchMap(mapId) {
  if (mapId === activeMap.id) return;
  controller.reset();
  bomb?.dispose();
  ragdoll?.dispose();
  destruction?.dispose();
  activeMap.dispose();
  activeMap = createTestMap(THREE, scene, mapId);
  controller.setSpawnPosition(activeMap.spawn);
  ui.setMapName(activeMap.id, activeMap.name, activeMap.count, activeMap.materialDescription);
  view.setMode(activeMap.id === 'timberbrick-manor' ? 'FAR' : 'STANDARD');
  view.resetPitch();
  view.setMapFov(activeMap.id === 'timberbrick-manor' ? 66 : null);
  view.snap();
  createActiveMapSystems();
}

createActiveMapSystems();

function selectToolSlot(slot) {
  selectedSlot = slot;
  hammer.selectSlot(slot);
  bomb.setSelected(slot === 2);
  ui.setEquipmentState({ slot });
}

function onToolSlotKeyDown(event) {
  if (!['Digit1', 'Digit2', 'Digit3'].includes(event.code) || event.repeat) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  selectToolSlot(Number(event.code.slice(-1)));
}

window.addEventListener('keydown', onToolSlotKeyDown);
ui.setToolSelectHandler(selectToolSlot);
ui.setMapSelectHandler(switchMap);

const resizeObserver = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) view.resize(width, height);
});
resizeObserver.observe(mount);

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  controller.update(delta);
  view.update(player.position, player.rotation.y, delta);
  interaction.update();
  hammer.update(delta);
  bomb.update(delta);
  destruction.update(delta);
  ragdoll.update(delta);
  renderer.render(scene, view.camera);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(animate);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    controller.dispose();
    view.dispose();
    interaction.dispose();
    hammer.dispose();
    bomb.dispose();
    ragdoll.dispose();
    window.removeEventListener('keydown', onToolSlotKeyDown);
    ui.dispose();
    destruction.dispose();
    activeMap.dispose();
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  });
}