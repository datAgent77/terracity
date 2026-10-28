import { defineComponents } from '@iwsdk/core';
import {
  Placeable,
  SupplyTray,
  TerrainBoard,
  TrayToken,
} from './interactions/placeable-component.js';

export default defineComponents([Placeable, TrayToken, TerrainBoard, SupplyTray]);
