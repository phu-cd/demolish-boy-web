export function createScene(THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8e7dd);
  scene.fog = new THREE.Fog(0xd8e7dd, 24, 48);

  const hemisphere = new THREE.HemisphereLight(0xf8f1dc, 0x82947d, 2.1);
  scene.add(hemisphere);

  const sunlight = new THREE.DirectionalLight(0xfff1d2, 3.2);
  sunlight.position.set(-7, 13, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -12;
  sunlight.shadow.camera.right = 12;
  sunlight.shadow.camera.top = 12;
  sunlight.shadow.camera.bottom = -8;
  sunlight.shadow.normalBias = 0.035;
  scene.add(sunlight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0xc4d3bd, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x869681, 0x9aaa95);
  grid.position.y = -0.025;
  grid.userData.interactionIgnore = true;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(9.2, 0.18, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xe4dfc9, roughness: 0.93 }),
  );
  pad.position.set(0, 0.02, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);

  return scene;
}