import { createBuilding } from './building.js';
import { createManor } from './manor.js';

const MAP_FACTORIES = {
  brickhouse: createBuilding,
  'timberbrick-manor': createManor,
};

export function createTestMap(THREE, scene, mapId) {
  const factory = MAP_FACTORIES[mapId];
  if (!factory) throw new Error(`Unknown test map: ${mapId}`);
  return factory(THREE, scene);
}

export const TEST_MAPS = Object.freeze([
  { id: 'brickhouse', name: 'Brickhouse Test Assembly' },
  { id: 'timberbrick-manor', name: 'Timberbrick Manor' },
]);