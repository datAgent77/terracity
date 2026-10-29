import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'hud-panel': {
    url: publicAssetUrl('ui/hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'TerraCity HUD',
  },
  'actions-panel': {
    url: publicAssetUrl('ui/actions.uikitml'),
    type: AssetType.UIKitML,
    name: 'Plan Actions',
  },
  'tray-labels': {
    url: publicAssetUrl('ui/tray-labels.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tray Labels',
  },
  'time-panel': {
    url: publicAssetUrl('ui/time.uikitml'),
    type: AssetType.UIKitML,
    name: 'Time Control',
  },
  'overlay-panel': {
    url: publicAssetUrl('ui/overlay.uikitml'),
    type: AssetType.UIKitML,
    name: 'Intro and Result',
  },
  // Authored showcase neighbourhood (scripts/assets/build_villa_district.py).
  'villa-district': {
    url: publicAssetUrl('models/villa-district.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'Garden district (3 eras)',
  },
  'compare-panel': {
    url: publicAssetUrl('ui/compare.uikitml'),
    type: AssetType.UIKitML,
    name: 'Plan Comparison',
  },
});
