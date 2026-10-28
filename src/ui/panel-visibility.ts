import type { UIKitMLAsset, World } from '@iwsdk/core';

/**
 * Show/hide a UIKitML scene panel. Hiding sets the root to `display: none`
 * (so it stops receiving pointer events) and hides the object itself.
 */
export function setPanelVisible(world: World, nodeId: string, visible: boolean): void {
  const panel = world.getSceneObject<UIKitMLAsset>(nodeId);
  if (!panel) return;
  panel.getElementById('root')?.setProperties({ display: visible ? 'flex' : 'none' });
  panel.visible = visible;
}
