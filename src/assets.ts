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
  // Authored city kit (scripts/assets/build_city_kit.py): districts, town,
  // solar, wind, park, road and sprawl parts sharing one atlas material.
  'city-kit': {
    url: publicAssetUrl('models/city-kit.glb'),
    type: AssetType.GLTF,
    priority: 'critical',
    name: 'City kit',
  },
  'street-panel': {
    url: publicAssetUrl('ui/street.uikitml'),
    type: AssetType.UIKitML,
    name: 'Street Visit',
  },
  'compare-panel': {
    url: publicAssetUrl('ui/compare.uikitml'),
    type: AssetType.UIKitML,
    name: 'Plan Comparison',
  },
});
