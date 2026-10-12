export const RAGDOLL_CONFIG = {
  maxDuration: 10,
  settleSpeed: 0.48,
  settleDelay: 0.65,
  jointAngle: 0.95,
  jointTwistAngle: 0.72,
  jointMaxForce: 18000,
  bodyLinearDamping: 0.08,
  bodyAngularDamping: 0.045,
  groundRestitution: 0.28,
  groundFriction: 0.52,
  torsoSpin: 36,
  headSpin: 45,
  armSpin: 81,
  legSpin: 60,
  limbWobble: 33,
  dismemberSeparationImpulse: 9,
  dismemberSeparationLift: 4,
};

export function createRagdollSystem(CANNON, THREE, scene, world, player, groundMaterial, callbacks = {}) {
  const ragdollMaterial = new CANNON.Material('player-ragdoll');
  const ragdollGroundContact = new CANNON.ContactMaterial(ragdollMaterial, groundMaterial, {
    friction: RAGDOLL_CONFIG.groundFriction,
    restitution: RAGDOLL_CONFIG.groundRestitution,
  });
  world.addContactMaterial(ragdollGroundContact);
  const materials = {
    vest: new THREE.MeshStandardMaterial({ color: 0xe46b39, roughness: 0.82, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x344d69, roughness: 0.9, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc98761, roughness: 0.9, flatShading: true }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xf1c84b, roughness: 0.72, flatShading: true }),
    boots: new THREE.MeshStandardMaterial({ color: 0x413d36, roughness: 0.9, flatShading: true }),
  };
  const segments = [];
  const constraints = [];
  let active = false;
  let elapsed = 0;
  let settledFor = 0;
  let constraintsActive = false;
  let disposed = false;

  function createSegment(name, shape, geometry, material, localPosition) {
    const body = new CANNON.Body({
      mass: name === 'torso' ? 5 : name === 'head' ? 1.2 : 1.6,
      material: ragdollMaterial,
      linearDamping: RAGDOLL_CONFIG.bodyLinearDamping,
      angularDamping: RAGDOLL_CONFIG.bodyAngularDamping,
      allowSleep: true,
      sleepSpeedLimit: 0.16,
      sleepTimeLimit: 0.8,
    });
    body.addShape(shape);

    const visual = new THREE.Group();
    visual.name = `Ragdoll ${name}`;
    const mesh = new THREE.Mesh(geometry, material);
    if (name === 'helmet') mesh.position.y = -0.02;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    visual.add(mesh);

    if (name === 'helmet') {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.53),
        materials.helmet,
      );
      shell.position.y = -0.01;
      shell.castShadow = true;
      visual.add(shell);
    }
    if (name === 'head') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 10), materials.helmet);
      brim.position.y = 0.1;
      brim.castShadow = true;
      visual.add(brim);
    }
    if (name.startsWith('leg')) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.105, 0.31), materials.boots);
      boot.position.set(0, -0.36, -0.045);
      boot.castShadow = true;
      visual.add(boot);
    }

    visual.visible = false;
    scene.add(visual);
    segments.push({ name, body, visual, localPosition });
    return body;
  }

  const torso = createSegment(
    'torso',
    new CANNON.Box(new CANNON.Vec3(0.265, 0.31, 0.17)),
    new THREE.BoxGeometry(0.53, 0.62, 0.34),
    materials.vest,
    new THREE.Vector3(0, 1.05, 0),
  );
  const head = createSegment(
    'head',
    new CANNON.Sphere(0.17),
    new THREE.SphereGeometry(0.17, 10, 7),
    materials.skin,
    new THREE.Vector3(0, 1.49, 0),
  );
  const helmet = createSegment(
    'helmet',
    new CANNON.Box(new CANNON.Vec3(0.245, 0.1, 0.245)),
    new THREE.CylinderGeometry(0.245, 0.245, 0.045, 10),
    materials.helmet,
    new THREE.Vector3(0, 1.67, 0),
  );
  const arms = [];
  const legs = [];
  for (const side of [-1, 1]) {
    arms.push(createSegment(
      `arm-${side}`,
      new CANNON.Box(new CANNON.Vec3(0.085, 0.245, 0.09)),
      new THREE.BoxGeometry(0.17, 0.49, 0.18),
      materials.vest,
      new THREE.Vector3(side * 0.34, 1.08, 0),
    ));
    legs.push(createSegment(
      `leg-${side}`,
      new CANNON.Box(new CANNON.Vec3(0.105, 0.33, 0.115)),
      new THREE.BoxGeometry(0.21, 0.66, 0.23),
      materials.trousers,
      new THREE.Vector3(side * 0.15, 0.39, 0),
    ));
  }

  function addJoint(bodyA, bodyB, pivotA, pivotB, axis) {
    const constraint = new CANNON.ConeTwistConstraint(bodyA, bodyB, {
      pivotA: new CANNON.Vec3(...pivotA),
      pivotB: new CANNON.Vec3(...pivotB),
      axisA: new CANNON.Vec3(...axis),
      axisB: new CANNON.Vec3(...axis),
      angle: RAGDOLL_CONFIG.jointAngle,
      twistAngle: RAGDOLL_CONFIG.jointTwistAngle,
      maxForce: RAGDOLL_CONFIG.jointMaxForce,
      collideConnected: false,
    });
    constraints.push(constraint);
  }

  addJoint(torso, head, [0, 0.32, 0], [0, -0.17, 0], [0, 1, 0]);
  addJoint(head, helmet, [0, 0.15, 0], [0, -0.07, 0], [0, 1, 0]);
  for (const side of [-1, 1]) {
    const index = (side + 1) / 2;
    addJoint(torso, arms[index], [side * 0.26, 0.2, 0], [-side * 0.08, 0.2, 0], [side, 0, 0]);
    addJoint(torso, legs[index], [side * 0.14, -0.29, 0], [0, 0.31, 0], [side, 0, 0]);
  }

  function start(origin, launchVelocity, dismembered = false) {
    if (disposed || active) return false;
    active = true;
    elapsed = 0;
    settledFor = 0;
    player.visible = false;

    const rootPosition = player.position.clone();
    const rootRotation = new THREE.Quaternion().setFromEuler(player.rotation);
    const rootCannonRotation = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), player.rotation.y);
    const away = rootPosition.clone().sub(origin);
    if (away.lengthSq() > 1e-6) away.normalize();
    else away.set(1, 0, 0);
    const spinAxis = new THREE.Vector3().crossVectors(away, new THREE.Vector3(0, 1, 0));
    if (spinAxis.lengthSq() < 1e-6) spinAxis.set(0, 0, 1);
    else spinAxis.normalize();
    const tumbleAxis = new THREE.Vector3().crossVectors(spinAxis, away).normalize();

    for (const segment of segments) {
      const worldOffset = segment.localPosition.clone().applyQuaternion(rootRotation);
      const position = rootPosition.clone().add(worldOffset);
      const separation = position.clone().sub(origin);
      if (separation.lengthSq() < 1e-6) separation.copy(away);
      else separation.normalize();
      segment.body.position.set(position.x, position.y, position.z);
      segment.body.quaternion.copy(rootCannonRotation);
      segment.body.velocity.set(
        launchVelocity.x + (dismembered ? separation.x * RAGDOLL_CONFIG.dismemberSeparationImpulse : away.x * (segment.name === 'torso' ? 0 : 0.35)),
        launchVelocity.y + (dismembered ? RAGDOLL_CONFIG.dismemberSeparationLift : 0),
        launchVelocity.z + (dismembered ? separation.z * RAGDOLL_CONFIG.dismemberSeparationImpulse : away.z * (segment.name === 'torso' ? 0 : 0.35)),
      );
      const side = segment.name.endsWith('--1') ? -1 : segment.name.endsWith('-1') ? 1 : 0;
      const spin = segment.name === 'torso'
        ? RAGDOLL_CONFIG.torsoSpin
        : segment.name === 'head'
          ? RAGDOLL_CONFIG.headSpin
          : segment.name.startsWith('arm')
            ? RAGDOLL_CONFIG.armSpin
            : RAGDOLL_CONFIG.legSpin;
      const wobble = side * RAGDOLL_CONFIG.limbWobble;
      segment.body.angularVelocity.set(
        spinAxis.x * spin + tumbleAxis.x * wobble,
        spinAxis.y * spin + tumbleAxis.y * wobble,
        spinAxis.z * spin + tumbleAxis.z * wobble,
      );
      segment.body.wakeUp();
      world.addBody(segment.body);
      segment.visual.visible = true;
      segment.visual.position.copy(position);
      segment.visual.quaternion.set(rootCannonRotation.x, rootCannonRotation.y, rootCannonRotation.z, rootCannonRotation.w);
    }
    if (!dismembered) {
      for (const constraint of constraints) world.addConstraint(constraint);
      constraintsActive = true;
    }
    callbacks.onStart?.();
    return true;
  }

  function finish() {
    if (constraintsActive) {
      for (const constraint of constraints) world.removeConstraint(constraint);
      constraintsActive = false;
    }
    for (const segment of segments) {
      world.removeBody(segment.body);
      segment.visual.visible = false;
      segment.body.velocity.set(0, 0, 0);
      segment.body.angularVelocity.set(0, 0, 0);
      segment.body.force.set(0, 0, 0);
      segment.body.torque.set(0, 0, 0);
    }
    active = false;
    settledFor = 0;
    player.visible = true;
    callbacks.onSettle?.();
  }

  function update(delta) {
    if (!active) return;
    const step = Math.min(delta, 0.05);
    elapsed += step;
    let totalMotion = 0;
    const ragdollCenter = new THREE.Vector3();
    for (const segment of segments) {
      const { body, visual } = segment;
      visual.position.set(body.position.x, body.position.y, body.position.z);
      visual.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      ragdollCenter.x += body.position.x;
      ragdollCenter.y += body.position.y;
      ragdollCenter.z += body.position.z;
      totalMotion += body.velocity.length() + body.angularVelocity.length() * 0.22;
    }
    ragdollCenter.multiplyScalar(1 / segments.length);
    player.position.set(ragdollCenter.x, ragdollCenter.y - 1.05, ragdollCenter.z);

    if (totalMotion / segments.length < RAGDOLL_CONFIG.settleSpeed) settledFor += step;
    else settledFor = 0;
    if (settledFor >= RAGDOLL_CONFIG.settleDelay || elapsed >= RAGDOLL_CONFIG.maxDuration) finish();
  }

  function reset() {
    if (active) finish();
  }

  function dispose() {
    if (active) reset();
    disposed = true;
    for (const segment of segments) {
      scene.remove(segment.visual);
      segment.visual.traverse((object) => {
        if (object.isMesh) object.geometry.dispose();
      });
      segment.body.shapes.length = 0;
    }
    for (const material of Object.values(materials)) material.dispose();
    world.removeContactMaterial(ragdollGroundContact);
  }

  return {
    start,
    update,
    reset,
    dispose,
    isActive: () => active,
  };
}
