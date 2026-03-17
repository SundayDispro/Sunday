import * as fabric from 'fabric';

export interface CanvasSetupOptions {
  backgroundColor?: string;
}

export function createFabricCanvas(
  element: HTMLCanvasElement,
  options: CanvasSetupOptions = {},
): fabric.Canvas {
  const canvas = new fabric.Canvas(element, {
    backgroundColor: options.backgroundColor ?? '#ffffff',
    selection: true,
    preserveObjectStacking: true,
  });

  return canvas;
}

