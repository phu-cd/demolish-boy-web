export function createPlayer(THREE, scene, spawnPosition) {
  const player = new THREE.Group();
  player.name = 'Construction worker';
  player.position.copy(spawnPosition);
  player.rotation.y = 0;

  const materials = {
    orange: new THREE.MeshStandardMaterial({ color: 0xe46b39, roughness: 0.78, flatShading: true }),
    safetyYellow: new THREE.MeshStandardMaterial({ color: 0xf1c84b, roughness: 0.72, flatShading: true }),
    reflective: new THREE.MeshStandardMaterial({ color: 0xf1db8d, roughness: 0.5, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x344d69, roughness: 0.88, flatShading: true }),
    boots: new THREE.MeshStandardMaterial({ color: 0x413d36, roughness: 0.9, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc98761, roughness: 0.9, flatShading: true }),
  };
  const boxGeometries = new Map();

  function box(width, height, depth, material, position, parent) {
    const key = `${width}/${height}/${depth}`;
    if (!boxGeometries.has(key)) {
      boxGeometries.set(key, new THREE.BoxGeometry(width, height, depth));
    }
    const mesh = new THREE.Mesh(boxGeometries.get(key), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(0.53, 0.62, 0.34, materials.orange, [0, 1.05, 0], player);
  box(0.39, 0.48, 0.035, materials.orange, [0, 1.05, -0.19], player);
  for (const side of [-1, 1]) {
    box(0.42, 0.055, 0.025, materials.reflective, [0, 0.88, side * 0.181], player);
    box(0.42, 0.055, 0.025, materials.reflective, [0, 1.15, side * 0.181], player);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 7), materials.skin);
  head.position.set(0, 1.48, 0);
  head.castShadow = true;
  player.add(head);

  const helmetBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 10), materials.safetyYellow);
  helmetBrim.position.set(0, 1.65, 0);
  helmetBrim.castShadow = true;
  player.add(helmetBrim);

  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.53),
    materials.safetyYellow,
  );
  helmetShell.position.set(0, 1.66, 0);
  helmetShell.castShadow = true;
  player.add(helmetShell);

  const legs = [];
  const arms = [];
  let hammerHand = null;
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.15, 0.76, 0);
    player.add(leg);
    box(0.2, 0.66, 0.22, materials.trousers, [0, -0.35, 0], leg);
    box(0.23, 0.105, 0.31, materials.boots, [0, -0.68, -0.06], leg);
    legs.push(leg);

    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 1.31, 0);
    player.add(arm);
    box(0.17, 0.43, 0.18, materials.orange, [0, -0.2, 0], arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), materials.skin);
    hand.position.set(0, -0.44, 0);
    hand.castShadow = true;
    arm.add(hand);
    if (side > 0) {
      hammerHand = new THREE.Group();
      hammerHand.name = 'Right hand tool mount';
      hammerHand.position.set(0, -0.44, 0);
      arm.add(hammerHand);
    }
    arms.push(arm);
  }

  player.userData.walkingParts = { legs, arms, phase: 0 };
  player.userData.hammerHand = hammerHand;
  player.userData.materials = Object.values(materials);
  player.userData.geometries = [...boxGeometries.values(), head.geometry, helmetBrim.geometry, helmetShell.geometry];
  player.userData.height = 1.87;
  scene.add(player);
  return player;
}