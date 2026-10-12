import { BLOCK_DURABILITY } from './building.js';

const HOUSE = { width: 10.4, depth: 6.4, lowerHeight: 3.1, upperFloor: 3.15, upperHeight: 2.8, peak: 8.15 };

export function createManor(THREE, scene) {
	const materials = {
		masonry: new THREE.MeshStandardMaterial({ color: 0xb86d50, roughness: 0.92, flatShading: true }),
		masonryLight: new THREE.MeshStandardMaterial({ color: 0xd18a65, roughness: 0.9, flatShading: true }),
		timber: new THREE.MeshStandardMaterial({ color: 0x795032, roughness: 0.83, flatShading: true }),
		timberLight: new THREE.MeshStandardMaterial({ color: 0xa87345, roughness: 0.78, flatShading: true }),
		plaster: new THREE.MeshStandardMaterial({ color: 0xe4d1a6, roughness: 0.96, flatShading: true }),
		roof: new THREE.MeshStandardMaterial({ color: 0x874b3e, roughness: 0.82, flatShading: true }),
		roofLight: new THREE.MeshStandardMaterial({ color: 0xb86549, roughness: 0.83, flatShading: true }),
		glass: new THREE.MeshStandardMaterial({ color: 0x86bcc1, roughness: 0.36, flatShading: true }),
		metal: new THREE.MeshStandardMaterial({ color: 0x394749, roughness: 0.56, metalness: 0.45, flatShading: true }),
		plant: new THREE.MeshStandardMaterial({ color: 0x668254, roughness: 0.9, flatShading: true }),
	};
	const geometries = new Map();
	const blocks = [];
	const decorations = [];
	let componentIndex = 0;

	function boxGeometry(width, height, depth) {
		const key = `${width}/${height}/${depth}`;
		if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(width, height, depth));
		return geometries.get(key);
	}

	function addBox(name, size, position, material, materialClass, structural = true, options = {}) {
		const mesh = new THREE.Mesh(boxGeometry(...size), material);
		mesh.name = name;
		mesh.position.set(...position);
		if (options.rotation) mesh.rotation.set(...options.rotation);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.kind = options.kind ?? (structural ? 'manor-component' : 'decoration');
		mesh.userData.componentId = `timberbrick-manor:${materialClass}:${String(++componentIndex).padStart(4, '0')}`;
		mesh.userData.materialClass = materialClass;
		mesh.userData.flammable = materialClass === 'timber' || materialClass === 'roof-timber' || options.flammable === true;
		mesh.userData.interactable = structural;
		if (structural) {
			mesh.userData.maxDurability = options.durability ?? BLOCK_DURABILITY;
			mesh.userData.durability = mesh.userData.maxDurability;
			blocks.push(mesh);
		} else {
			decorations.push(mesh);
		}
		scene.add(mesh);
		return mesh;
	}

	function beam(name, from, to, thickness, material = materials.timberLight, materialClass = 'timber') {
		const start = new THREE.Vector3(...from);
		const end = new THREE.Vector3(...to);
		const delta = end.clone().sub(start);
		const mesh = addBox(name, [thickness, delta.length(), thickness], start.add(end).multiplyScalar(0.5).toArray(), material, materialClass, true, { kind: 'timber-beam' });
		mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
		return mesh;
	}

	function windowFrame(x, y, z, prefix, upper = false) {
		const width = upper ? 1.12 : 1.25;
		const height = upper ? 1.18 : 1.55;
		const frame = 0.13;
		for (const side of [-1, 1]) addBox(`${prefix} frame post ${side}`, [frame, height, 0.17], [x + side * width / 2, y + height / 2, z], materials.timberLight, 'timber');
		addBox(`${prefix} frame lintel`, [width + frame, frame, 0.17], [x, y + height, z], materials.timberLight, 'timber');
		addBox(`${prefix} frame sill`, [width + frame, frame, 0.2], [x, y + frame, z], materials.timberLight, 'timber');
		addBox(`${prefix} glazing`, [width - 0.25, height - 0.35, 0.045], [x, y + height / 2 + 0.04, z - 0.055], materials.glass, 'decorative', false);
		addBox(`${prefix} mullion vertical`, [0.08, height - 0.25, 0.065], [x, y + height / 2, z - 0.09], materials.timber, 'timber', true, { kind: 'timber-beam' });
		addBox(`${prefix} mullion horizontal`, [width - 0.2, 0.08, 0.065], [x, y + height / 2, z - 0.09], materials.timber, 'timber', true, { kind: 'timber-beam' });
	}

	addBox('masonry foundation slab', [HOUSE.width + 0.5, 0.24, HOUSE.depth + 0.5], [0, 0.12, 0], materials.masonry, 'masonry', true, { durability: 180 });

	const halfW = HOUSE.width / 2;
	const halfD = HOUSE.depth / 2;
	const rowHeight = 0.56;
	for (const zSide of [-1, 1]) {
		const z = zSide * halfD;
		for (let row = 0; row < 6; row += 1) {
			const y = 0.24 + row * 0.51 + 0.27;
			const stagger = (row % 2) * 0.38;
			for (let x = -halfW + 0.42 + stagger; x <= halfW - 0.3; x += 0.78) {
				if (zSide < 0 && row < 4 && Math.abs(x) < 0.85) continue;
				if (zSide < 0 && row < 3 && (Math.abs(x - 3.1) < 0.55 || Math.abs(x + 3.1) < 0.55)) continue;
				addBox(`masonry front-back ${row}-${x.toFixed(1)}-${zSide}`, [0.74, rowHeight, 0.32], [x, y, z], (row + Math.round(x * 10)) % 2 ? materials.masonry : materials.masonryLight, 'masonry', true, { kind: 'masonry-block', durability: 120 });
			}
		}
	}
	for (const xSide of [-1, 1]) {
		const x = xSide * halfW;
		for (let row = 0; row < 6; row += 1) {
			for (let z = -halfD + 0.38 + (row % 2) * 0.34; z <= halfD - 0.3; z += 0.72) {
				if (row < 4 && Math.abs(z) < 0.62) continue;
				addBox(`masonry side ${row}-${z.toFixed(1)}-${xSide}`, [0.32, rowHeight, 0.68], [x, 0.24 + row * 0.51 + 0.27, z], materials.masonry, 'masonry', true, { kind: 'masonry-block', durability: 120 });
			}
		}
	}

	addBox('entry door timber', [1.25, 2.15, 0.12], [0, 1.31, -halfD - 0.21], materials.timberLight, 'decorative', false, { flammable: true });
	addBox('entry transom glass', [0.94, 0.42, 0.05], [0, 2.42, -halfD - 0.28], materials.glass, 'decorative', false);
	for (const x of [-3.1, 3.1]) windowFrame(x, 0.26, -halfD - 0.2, `lower window ${x}`);

	const upperBottom = HOUSE.upperFloor;
	const upperTop = upperBottom + HOUSE.upperHeight;
	const frontZ = -halfD - 0.18;
	const backZ = halfD + 0.18;
	for (const x of [-5.05, -3.35, -1.68, 0, 1.68, 3.35, 5.05]) {
		addBox(`front timber post ${x}`, [0.2, HOUSE.upperHeight, 0.2], [x, upperBottom + HOUSE.upperHeight / 2, frontZ], materials.timber, 'timber', true, { kind: 'timber-post', durability: 90 });
		addBox(`rear timber post ${x}`, [0.2, HOUSE.upperHeight, 0.2], [x, upperBottom + HOUSE.upperHeight / 2, backZ], materials.timber, 'timber', true, { kind: 'timber-post', durability: 90 });
	}
	for (const z of [-2.1, 0, 2.1]) {
		for (const xSide of [-1, 1]) addBox(`side timber post ${xSide}-${z}`, [0.2, HOUSE.upperHeight, 0.2], [xSide * (halfW + 0.08), upperBottom + HOUSE.upperHeight / 2, z], materials.timber, 'timber', true, { kind: 'timber-post', durability: 90 });
	}
	for (const [name, z] of [['front', frontZ], ['rear', backZ]]) {
		addBox(`${name} timber sill plate`, [HOUSE.width + 0.35, 0.22, 0.24], [0, upperBottom + 0.06, z], materials.timberLight, 'timber', true, { kind: 'timber-beam' });
		addBox(`${name} timber top plate`, [HOUSE.width + 0.35, 0.24, 0.24], [0, upperTop - 0.08, z], materials.timberLight, 'timber', true, { kind: 'timber-beam' });
	}
	for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) {
		beam(`front diagonal brace left ${x}`, [x - 0.5, upperBottom + 0.2, frontZ - 0.05], [x, upperBottom + 0.85, frontZ - 0.05], 0.12);
		beam(`front diagonal brace right ${x}`, [x, upperBottom + 0.85, frontZ - 0.05], [x + 0.5, upperBottom + 0.2, frontZ - 0.05], 0.12);
	}
	for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) {
		beam(`rear diagonal brace left ${x}`, [x - 0.5, upperBottom + 0.2, backZ + 0.05], [x, upperBottom + 0.85, backZ + 0.05], 0.12);
		beam(`rear diagonal brace right ${x}`, [x, upperBottom + 0.85, backZ + 0.05], [x + 0.5, upperBottom + 0.2, backZ + 0.05], 0.12);
	}
	for (const [elevation, facadeZ, outward] of [['front', frontZ, -1], ['rear', backZ, 1]]) {
		for (const x of [-4, 0, 4]) windowFrame(x, upperBottom + 0.55, facadeZ + outward * 0.18, `${elevation} upper window ${x}`, true);
		for (const x of [-4.15, -2.5, -0.85, 0.85, 2.5, 4.15]) {
			for (const y of [upperBottom + 0.43, upperBottom + 1.28, upperBottom + 2.13]) {
				if (y < upperBottom + 2 && (Math.abs(x) < 0.5 || Math.abs(x) > 3.7)) continue;
				addBox(`${elevation} plaster infill ${x}-${y.toFixed(1)}`, [1.48, 0.72, 0.1], [x, y, facadeZ - outward * 0.1], materials.plaster, 'decorative', false);
			}
		}
	}
	for (const x of [-1.45, 1.45]) {
		addBox(`porch timber column ${x}`, [0.22, 2.65, 0.22], [x, 1.325, -4.5], materials.timber, 'timber', true, { kind: 'timber-post', durability: 90 });
	}
	addBox('porch front header', [3.25, 0.2, 0.22], [0, 2.58, -4.5], materials.timberLight, 'timber', true, { kind: 'timber-beam' });
	beam('porch canopy left rafter', [-1.65, 2.75, -3.72], [-1.65, 3.45, -5.25], 0.16, materials.timber, 'roof-timber');
	beam('porch canopy right rafter', [1.65, 2.75, -3.72], [1.65, 3.45, -5.25], 0.16, materials.timber, 'roof-timber');
	addBox('porch canopy roof', [3.55, 0.16, 1.75], [0, 3.32, -4.5], materials.roofLight, 'roof-timber', true, { kind: 'roof-timber', durability: 100, rotation: [-0.18, 0, 0] });

	const roofBase = upperTop + 0.04;
	const roofSpan = halfW + 0.75;
	const roofRise = 2.12;
	const roofAngle = Math.atan2(roofRise, roofSpan);
	for (const z of [-3.55, -1.2, 1.2, 3.55]) {
		beam(`roof rafter left ${z}`, [0, roofBase + roofRise, z], [-roofSpan, roofBase, z], 0.2, materials.timber, 'roof-timber');
		beam(`roof rafter right ${z}`, [0, roofBase + roofRise, z], [roofSpan, roofBase, z], 0.2, materials.timber, 'roof-timber');
	}
	beam('roof ridge beam', [0, roofBase + roofRise, -3.65], [0, roofBase + roofRise, 3.65], 0.24, materials.timberLight, 'roof-timber');
	const roofSlopeLength = Math.hypot(roofSpan, roofRise);
	for (const side of [-1, 1]) {
		addBox(`roof timber plane ${side}`, [roofSlopeLength, 0.18, 7.4], [side * roofSpan / 2, roofBase + roofRise / 2, 0], materials.roofLight, 'roof-timber', true, { kind: 'roof-timber', durability: 110, rotation: [0, 0, -side * roofAngle] });
		for (let row = 0; row < 9; row += 1) {
			const fraction = (row + 0.5) / 9;
			addBox(`roof shingle timber ${side}-${row}`, [1.25, 0.13, 7.25], [side * roofSpan * fraction, roofBase + roofRise * (1 - fraction) + 0.14, 0], row % 2 ? materials.roof : materials.roofLight, 'roof-timber', true, { kind: 'roof-timber', durability: 55, rotation: [0, 0, -side * roofAngle] });
		}
	}

	for (const [x, z] of [[-3.8, -1.8], [3.8, 1.7]]) {
		addBox(`masonry chimney shaft ${x}`, [0.8, 2.1, 0.78], [x, 7.05, z], materials.masonry, 'masonry', true, { kind: 'chimney', durability: 150 });
		addBox(`chimney cap ${x}`, [1, 0.22, 0.98], [x, 8.2, z], materials.masonryLight, 'decorative', false);
	}
	for (const [x, z] of [[-8, -6], [-8, 6], [8, -6], [8, 6]]) {
		addBox(`yard fence marker ${x}-${z}`, [0.16, 1.05, 0.16], [x, 0.525, z], materials.timber, 'decorative', false, { flammable: true });
	}

	return {
		id: 'timberbrick-manor',
		name: 'Timberbrick Manor',
		materialDescription: 'MASONRY / TIMBER',
		blocks,
		decorations,
		count: blocks.length,
		spawn: new THREE.Vector3(0, -0.04, 8),
		groundRegions: [{ minX: -42, maxX: 42, minZ: -42, maxZ: 42, height: -0.04 }],
		collider: { minX: -halfW - 0.7, maxX: halfW + 0.7, minY: -0.04, maxY: HOUSE.peak + 1, minZ: -halfD - 0.7, maxZ: halfD + 0.7 },
		dispose() {
			for (const mesh of [...blocks, ...decorations]) scene.remove(mesh);
			for (const geometry of geometries.values()) geometry.dispose();
			for (const material of Object.values(materials)) material.dispose();
		},
	};
}
