import { createComponent, Types } from '@iwsdk/core';

/** Marks an entity as a structure whose position is owned by GameState. */
export const Placeable = createComponent('Placeable', {
  structureId: { type: Types.String, default: '' },
});

/** Marks the terrain board entity that receives tap/click/poke placement. */
export const TerrainBoard = createComponent('TerrainBoard', {});
