/**
 * Balancing table for the five buildable structures. Every number the player
 * sees comes from here; SIMULATION_ASSUMPTIONS.md documents the meaning.
 */
import { StructureType, TerrainType } from './scenario.js';

export interface StructureSpec {
  type: StructureType;
  label: string;
  /** Short noun used in cause → consequence lines. */
  noun: string;
  /** Base construction cost in budget credits (M€). */
  cost: number;
  /** Extra cost per hill elevation step (slope works, foundations). */
  slopeCostPerStep: number;
  /** Residents housed (only counted when connected to the road network). */
  population: number;
  /** Renewable supply in energy units (1 unit ≈ demand of 1,000 residents). */
  energy: number;
  /** Direct environmental effect in health points. */
  environment: number;
  /** Additional environmental effect when built on fertile farmland. */
  farmlandPenalty: number;
  /** Extra cost when built across the river (roads only: a bridge). */
  bridgeCost?: number;
  /** Terrains this structure may be built on. */
  allowed: readonly TerrainType[];
  /** Highest hill elevation allowed (inclusive). */
  maxElevation: number;
  /** Keyboard shortcut index (1-5) and tray order. */
  slot: number;
}

const LAND = [TerrainType.Plain, TerrainType.Farmland, TerrainType.Hill] as const;

export const STRUCTURES: Record<StructureType, StructureSpec> = {
  residential: {
    type: StructureType.Residential, label: 'Homes', noun: 'homes', slot: 1,
    cost: 12, slopeCostPerStep: 6, population: 4000, energy: 0, environment: -3,
    // Homes only on flat land and gentle slopes (elevation 1): steeper hills
    // carry erosion, wildfire, drainage and emergency-access risk
    // (horizontal-urbanism directive, 2026-10-29; see HORIZONTAL_URBANISM_DESIGN.md).
    farmlandPenalty: -6, allowed: LAND, maxElevation: 1,
  },
  solar: {
    type: StructureType.Solar, label: 'Solar', noun: 'solar farm', slot: 2,
    cost: 9, slopeCostPerStep: 4, population: 0, energy: 4, environment: -1,
    farmlandPenalty: -5, allowed: LAND, maxElevation: 1,
  },
  wind: {
    type: StructureType.Wind, label: 'Wind', noun: 'wind turbine', slot: 3,
    cost: 14, slopeCostPerStep: 0, population: 0, energy: 5, environment: -2,
    farmlandPenalty: -1, allowed: LAND, maxElevation: 3,
  },
  park: {
    type: StructureType.Park, label: 'Park', noun: 'park', slot: 4,
    cost: 4, slopeCostPerStep: 0, population: 0, energy: 0, environment: 4,
    farmlandPenalty: -2, allowed: LAND, maxElevation: 3,
  },
  road: {
    type: StructureType.Road, label: 'Road', noun: 'road', slot: 5,
    cost: 2, slopeCostPerStep: 2, population: 0, energy: 0, environment: -1,
    farmlandPenalty: -1, allowed: [...LAND, TerrainType.River], maxElevation: 2, bridgeCost: 6,
  },
};

export const STRUCTURE_ORDER: readonly StructureType[] = Object.values(STRUCTURES)
  .sort((a, b) => a.slot - b.slot)
  .map((s) => s.type);
