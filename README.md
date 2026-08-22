# threnic-shaders

Audio-reactive WGSL shader backgrounds for WebGPU.

## Features

- **5 shader presets** — Tunnel, Warp, Clouds, Volumetric, Storm
- **6 color palettes** — Ember, Ice, Toxic, Vaporwave, Mono, Stone
- **Beat detection** — EMA-based with configurable attack/decay smoothing
- **Blend modes** — Normal, Additive, Screen, Multiply with adjustable opacity
- **Framework-agnostic** — Works with any WebGPU-capable canvas

## Install

```bash
npm i @pnixon/threnic-shaders
```

## Quick Start

```typescript
import { createShaderCanvas } from '@pnixon/threnic-shaders';

const canvas = createShaderCanvas(canvasEl);
canvas.loadPreset('tunnel');
canvas.connectAudio(audioElement);
```

## Presets

| Preset | Description |
|--------|-------------|
| `tunnel` | Stony cave tunnel with depth fog |
| `warp` | Star warp hyperspace effect |
| `clouds` | Volumetric cloud flight |
| `volumetric` | Dense volumetric light shafts |
| `storm` | Electric storm with lightning |

## API

### `createShaderCanvas(canvas: HTMLCanvasElement, options?: ShaderCanvasOptions)`

Creates a managed shader canvas with audio reactivity.

```typescript
const shader = createShaderCanvas(canvas, {
  preset: 'tunnel',
  palette: 'ember',
  opacity: 0.7,
  blend: 'additive',
  reactivity: 0.8,
  attack: 0.05,
  decay: 0.3,
});

shader.connectAudio(audioElement);
shader.loadPreset('warp');
shader.setPalette('ice');
shader.setOpacity(0.5);
shader.destroy();
```

### `ShaderOverlayPass`

Low-level WebGPU render pass for integration into existing pipelines.

```typescript
import { ShaderOverlayPass } from '@pnixon/threnic-shaders';

const pass = new ShaderOverlayPass(device, format, {
  preset: 'clouds',
  palette: 'vaporwave',
});

pass.render(commandEncoder, targetView, {
  time: elapsed,
  bass: bassLevel,
  beat: beatFlash,
});
```

### Presets & Palettes

```typescript
import { PRESETS, PALETTES } from '@pnixon/threnic-shaders';

// List available presets
Object.keys(PRESETS); // ['tunnel', 'warp', 'clouds', 'volumetric', 'storm']

// List available palettes
Object.keys(PALETTES); // ['ember', 'ice', 'toxic', 'vaporwave', 'mono', 'stone']
```

## Browser Support

- Chrome 113+
- Edge 113+
- Firefox (behind flag, Nightly)

WebGPU is required. Falls back gracefully with `isWebGPUSupported()` check.

## License

MIT © 2026 NXN Technologies
