import { createComponent, Types } from '@iwsdk/core';

/**
 * A grabbable structure model. `structureId` is empty while the model is a
 * tray token or being carried from the tray (not yet part of the plan).
 */
export const Placeable = createComponent('Placeable', {
  structureId: { type: Types.String, default: '' },
  structureType: { type: Types.String, default: 'residential' },
});

/** Tag: this placeable is still sitting in the supply tray. */
export const TrayToken = createComponent('TrayToken', {});

/** Marks the terrain board entity that receives tap/click placement. */
export const TerrainBoard = createComponent('TerrainBoard', {});

/** Marks the supply tray slab (tap a slot to arm a structure type). */
export const SupplyTray = createComponent('SupplyTray', {});
