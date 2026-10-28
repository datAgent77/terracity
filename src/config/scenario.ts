/**
 * TerraCity scenario + board constants. Pure data — safe to import from tests,
 * the asset manifest, and runtime systems alike.
 */

/** Number of tile columns (x axis, west → east). */
export const GRID_COLS = 14;
/** Number of tile rows (z axis, north/sea → south/player). */
export const GRID_ROWS = 10;
/** Edge length of one tile in metres (tabletop scale). */
export const TILE_SIZE = 0.06;
/** Height of one elevation step in metres. */
export const ELEVATION_STEP = 0.012;
/** Base slab thickness of every land tile in metres. */
export const TILE_BASE_HEIGHT = 0.02;

/**
 * World-space centre of the diorama table top. The player sits at the origin
 * looking toward -Z; the board rests at a comfortable seated reach.
 */
export const BOARD_CENTER: readonly [number, number, number] = [0, 0.78, -0.5];

export const TerrainType = {
  Sea: 'sea',
  Beach: 'beach',
  River: 'river',
  Farmland: 'farmland',
  Plain: 'plain',
  Hill: 'hill',
  Protected: 'protected',
  Town: 'town',
} as const;
export type TerrainType = (typeof TerrainType)[keyof typeof TerrainType];

export const StructureType = {
  Residential: 'residential',
} as const;
export type StructureType = (typeof StructureType)[keyof typeof StructureType];
