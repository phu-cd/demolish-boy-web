const BLOCKS_WIDE = 8;
const BLOCKS_TALL = 5;
const BLOCKS_DEEP = 3;
const BLOCK_WIDTH = 0.94;
const BLOCK_HEIGHT = 0.5;
const BLOCK_DEPTH = 0.78;
const JOINT = 0.045;
export const BLOCK_DURABILITY = 100;

const CLAY_COLORS = [0xc96348, 0xd57552, 0xb9513d, 0xdd8059, 0xc96a4e];
const CAP_COLORS = [0x768d68, 0x839675, 0x6d8464];

export function createBuilding(THREE, scene) {
  const geometry = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH);
  const materials = [...CLAY_COLORS, ...CAP_COLORS].map((color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.84,
    flatShading: true,
  }));
  const blocks = [];
  let componentIndex = 0;

  for (let level = 0; level < BLOCKS_TALL; level += 1) {
    for (let depth = 0; depth < BLOCKS_DEEP; depth += 1) {
      for (let column = 0; column < BLOCKS_WIDE; column += 1) {
        const stagger = level % 2 === 1 ? (BLOCK_WIDTH + JOINT) / 2 : 0;
        const block = new THREE.Mesh(geometry, materials[(column * 3 + depth + level * 2) % CLAY_COLORS.length]);
        block.position.set(
          (column - (BLOCKS_WIDE - 1) / 2) * (BLOCK_WIDTH + JOINT) + stagger,
          BLOCK_HEIGHT / 2 + level * (BLOCK_HEIGHT + JOINT),
          (depth - (BLOCKS_DEEP - 1) / 2) * (BLOCK_DEPTH + JOINT),
        );
        block.castShadow = true;
        block.receiveShadow = true;
        block.userData.kind = 'wall-block';
        block.userData.interactable = true;
        block.userData.componentId = `brickhouse:masonry:${componentIndex++}`;
        block.userData.materialClass = 'masonry';
        block.userData.flammable = false;
        block.userData.maxDurability = BLOCK_DURABILITY;
        block.userData.durability = BLOCK_DURABILITY;
        scene.add(block);
        blocks.push(block);
      }
    }
  }

  const capGeometry = new THREE.BoxGeometry(1.24, 0.2, BLOCK_DEPTH + 0.14);
  for (let depth = 0; depth < BLOCKS_DEEP; depth += 1) {
    for (let column = 0; column < BLOCKS_WIDE / 2; column += 1) {
      const cap = new THREE.Mesh(capGeometry, materials[CLAY_COLORS.length + (column + depth) % CAP_COLORS.length]);
      cap.position.set(
        (column - (BLOCKS_WIDE / 2 - 1) / 2) * 1.28,
        BLOCKS_TALL * (BLOCK_HEIGHT + JOINT) + 0.04,
        (depth - (BLOCKS_DEEP - 1) / 2) * (BLOCK_DEPTH + JOINT),
      );
      cap.castShadow = true;
      cap.receiveShadow = true;
      cap.userData.kind = 'cap-block';
      cap.userData.interactable = true;
      cap.userData.componentId = `brickhouse:masonry-cap:${componentIndex++}`;
      cap.userData.materialClass = 'masonry';
      cap.userData.flammable = false;
      cap.userData.maxDurability = BLOCK_DURABILITY;
      cap.userData.durability = BLOCK_DURABILITY;
      scene.add(cap);
      blocks.push(cap);
    }
  }

  return {
    blocks,
    count: blocks.length,
    id: 'brickhouse',
    name: 'Brickhouse Test Assembly',
    materialDescription: 'CLAY / CONCRETE',
    spawn: new THREE.Vector3(0, -0.04, 5.2),
    groundRegions: [{ minX: -4.6, maxX: 4.6, minZ: -1.6, maxZ: 1.6, height: 0.11 }],
    collider: { minX: -4.42, maxX: 4.42, minY: -0.04, maxY: 2.9, minZ: -1.62, maxZ: 1.62 },
    dispose() {
      const geometries = new Set();
      const materials = new Set();
      for (const block of blocks) {
        scene.remove(block);
        geometries.add(block.geometry);
        for (const material of Array.isArray(block.material) ? block.material : [block.material]) materials.add(material);
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}