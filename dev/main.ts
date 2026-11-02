/**
 * Dev entry — full-featured demo with live WGSL code editor.
 * Imports from package source (../src) via Vite.
 */
import {
  createShaderCanvas,
  PRESETS,
  PALETTES,
  SHADER_PRELUDE,
  SHADER_EPILOGUE,
  getPresetById,
  AudioAnalyser,
  type ShaderCanvas,
  type ShaderPreset,
} from '../src/index';

// ─── DOM refs ──────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const presetSel = document.getElementById('preset') as HTMLSelectElement;
const paletteSel = document.getElementById('palette') as HTMLSelectElement;
const micBtn = document.getElementById('mic') as HTMLButtonElement;
const fileBtn = document.getElementById('fileBtn') as HTMLButtonElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const systemBtn = document.getElementById('systemBtn') as HTMLButtonElement;
const deviceSel = document.getElementById('deviceSel') as HTMLSelectElement;
const refreshDevicesBtn = document.getElementById('refreshDevices') as HTMLButtonElement;
const codeEditor = document.getElementById('codeEditor') as HTMLTextAreaElement;
const compileBtn = document.getElementById('compileBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const errorEl = document.getElementById('compileError')!;
const fullSourceBtn = document.getElementById('fullSourceBtn') as HTMLButtonElement;
const fullSourcePre = document.getElementById('fullSource') as HTMLPreElement;
const opacitySlider = document.getElementById('opacity') as HTMLInputElement;
const opacityVal = document.getElementById('opacityVal')!;
const bgColorInput = document.getElementById('bgColor') as HTMLInputElement;
const bgColorVal = document.getElementById('bgColorVal')!;
const sensitivitySlider = document.getElementById('sensitivity') as HTMLInputElement;
const sensitivityVal = document.getElementById('sensitivityVal')!;
const p0Slider = document.getElementById('p0') as HTMLInputElement;
const p0Val = document.getElementById('p0Val')!;
const p0Label = document.getElementById('p0Label')!;
const p1Slider = document.getElementById('p1') as HTMLInputElement;
const p1Val = document.getElementById('p1Val')!;
const p1Label = document.getElementById('p1Label')!;

// ─── State ──────────────────────────────────────────────────────

let shader: ShaderCanvas | null = null;
let currentPresetBody = '';

// ─── Init ───────────────────────────────────────────────────────

async function init() {
  statusEl.textContent = 'Initializing WebGPU…';

  try {
    shader = await createShaderCanvas(canvas, {
      preset: 'tunnel',
      palette: 'stone',
    });

    statusEl.textContent = `✓ Running — ${PRESETS.length} presets, ${PALETTES.length} palettes`;
    loadPresetIntoEditor('tunnel');
    updateParamLabels('tunnel');
  } catch (e: any) {
    statusEl.textContent = `✗ Init failed: ${e.message}`;
    console.error(e);
    return;
  }

  // ─── Preset switcher ──────────────────────────────────────────
  presetSel.addEventListener('change', async () => {
    const id = presetSel.value;
    if (shader) {
      await shader.loadPreset(id);
      loadPresetIntoEditor(id);
      updateParamLabels(id);
    }
  });

  // ─── Palette switcher ─────────────────────────────────────────
  paletteSel.addEventListener('change', () => {
    if (shader) shader.setPalette(paletteSel.value);
  });

  // ─── Sliders ──────────────────────────────────────────────────
  opacitySlider.addEventListener('input', () => {
    const v = parseFloat(opacitySlider.value);
    opacityVal.textContent = v.toFixed(2);
    if (shader) shader.setConfig({ opacity: v });
  });

  // Background color picker
  bgColorInput.addEventListener('input', () => {
    const hex = bgColorInput.value;
    bgColorVal.textContent = hex;
    canvas.style.backgroundColor = hex;
  });

  sensitivitySlider.addEventListener('input', () => {
    const v = parseFloat(sensitivitySlider.value);
    sensitivityVal.textContent = v.toFixed(2);
    if (shader) shader.setConfig({ sensitivity: v });
  });

  p0Slider.addEventListener('input', () => {
    const v = parseFloat(p0Slider.value);
    p0Val.textContent = v.toFixed(2);
    if (shader) shader.setConfig({ p0: v });
  });

  p1Slider.addEventListener('input', () => {
    const v = parseFloat(p1Slider.value);
    p1Val.textContent = v.toFixed(2);
    if (shader) shader.setConfig({ p1: v });
  });

  // ─── Audio: Mic ───────────────────────────────────────────────
  micBtn.addEventListener('click', async () => {
    if (!shader) return;
    try {
      resetAudioButtons();
      await shader.connectMicrophone();
      micBtn.textContent = '🔴 Mic Active';
      micBtn.classList.add('active');
      statusEl.textContent = '✓ Microphone connected';
    } catch (e: any) {
      statusEl.textContent = `Mic error: ${e.message}`;
    }
  });

  // ─── Audio: File ──────────────────────────────────────────────
  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (!shader || !fileInput.files?.length) return;
    const url = URL.createObjectURL(fileInput.files[0]);
    const audio = document.getElementById('audioEl') as HTMLAudioElement;
    audio.src = url;
    audio.play();
    shader.connectAudio(audio);
    resetAudioButtons();
    fileBtn.textContent = '🔊 Playing';
    fileBtn.classList.add('active');
  });

  // ─── Audio: System (getDisplayMedia) ──────────────────────────
  systemBtn.addEventListener('click', async () => {
    if (!shader) return;
    try {
      resetAudioButtons();
      statusEl.textContent = 'Select a tab/screen with audio…';
      await shader.connectSystemAudio();
      systemBtn.textContent = '🖥️ Capturing';
      systemBtn.classList.add('active');
      statusEl.textContent = '✓ System audio connected';
    } catch (e: any) {
      statusEl.textContent = `System audio: ${e.message}`;
    }
  });

  // ─── Audio: Device selector ───────────────────────────────────
  refreshDevicesBtn.addEventListener('click', refreshDeviceList);
  deviceSel.addEventListener('change', async () => {
    if (!shader || !deviceSel.value) return;
    try {
      resetAudioButtons();
      await shader.connectDevice(deviceSel.value);
      statusEl.textContent = `✓ Device connected: ${deviceSel.options[deviceSel.selectedIndex].text}`;
      deviceSel.classList.add('active');
    } catch (e: any) {
      statusEl.textContent = `Device error: ${e.message}`;
    }
  });

  // Populate device list on load (labels may be empty until permission granted)
  refreshDeviceList();

  // ─── Code editor: Compile ─────────────────────────────────────
  compileBtn.addEventListener('click', () => compileCustomShader());

  // ─── Code editor: Reset ───────────────────────────────────────
  resetBtn.addEventListener('click', () => {
    loadPresetIntoEditor(presetSel.value);
    errorEl.textContent = '';
    errorEl.style.display = 'none';
    compileCustomShader();
  });

  // ─── Full source toggle ───────────────────────────────────────
  fullSourceBtn.addEventListener('click', () => {
    const visible = fullSourcePre.style.display !== 'none';
    if (visible) {
      fullSourcePre.style.display = 'none';
      fullSourceBtn.textContent = '👁 Show Full WGSL';
    } else {
      fullSourcePre.textContent = SHADER_PRELUDE + '\n' + codeEditor.value + '\n' + SHADER_EPILOGUE;
      fullSourcePre.style.display = 'block';
      fullSourceBtn.textContent = '✕ Hide Full WGSL';
    }
  });

  // Ctrl+Enter to compile
  codeEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      compileCustomShader();
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function loadPresetIntoEditor(id: string) {
  const preset = getPresetById(id);
  if (preset) {
    currentPresetBody = preset.body;
    codeEditor.value = preset.body.trim();
    autoResize(codeEditor);
  }
}

function updateParamLabels(id: string) {
  const preset = getPresetById(id);
  if (preset) {
    p0Label.textContent = preset.params[0]?.label ?? 'Param 0';
    p1Label.textContent = preset.params[1]?.label ?? 'Param 1';
    p0Slider.value = String(preset.params[0]?.default ?? 0);
    p1Slider.value = String(preset.params[1]?.default ?? 0.5);
    p0Val.textContent = (preset.params[0]?.default ?? 0).toFixed(2);
    p1Val.textContent = (preset.params[1]?.default ?? 0.5).toFixed(2);
    if (shader) {
      shader.setConfig({
        p0: preset.params[0]?.default ?? 0,
        p1: preset.params[1]?.default ?? 0.5,
      });
    }
  }
}

async function compileCustomShader() {
  if (!shader || !shader.pass) return;

  const body = codeEditor.value;

  // Create a temporary preset with the edited body
  const tempPreset: ShaderPreset = {
    id: '__custom__',
    label: 'Custom',
    description: 'User-edited shader',
    palette: paletteSel.value,
    params: [],
    body: body,
  };

  const ok = await shader.pass.loadPreset(tempPreset);
  if (ok) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    statusEl.textContent = '✓ Shader compiled successfully';
  } else {
    errorEl.style.display = 'block';
    errorEl.textContent = '✗ Shader compilation failed — check browser console for details';
    statusEl.textContent = '✗ Compilation error';
  }
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

codeEditor?.addEventListener('input', () => autoResize(codeEditor));

// ─── Audio Helpers ──────────────────────────────────────────────

function resetAudioButtons() {
  micBtn.textContent = '🎤 Mic';
  micBtn.classList.remove('active');
  fileBtn.textContent = '📁 File';
  fileBtn.classList.remove('active');
  systemBtn.textContent = '🖥️ System';
  systemBtn.classList.remove('active');
  deviceSel.classList.remove('active');
}

async function refreshDeviceList() {
  try {
    const devices = await AudioAnalyser.listDevices();
    // Clear existing options
    deviceSel.innerHTML = '<option value="">— Select device —</option>';

    // Group by kind
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    const outputs = devices.filter((d) => d.kind === 'audiooutput');

    if (inputs.length > 0) {
      const group = document.createElement('optgroup');
      group.label = '🎤 Input Devices';
      for (const d of inputs) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label;
        group.appendChild(opt);
      }
      deviceSel.appendChild(group);
    }

    if (outputs.length > 0) {
      const group = document.createElement('optgroup');
      group.label = '🔊 Output Devices';
      for (const d of outputs) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label;
        group.appendChild(opt);
      }
      deviceSel.appendChild(group);
    }

    statusEl.textContent = `Found ${devices.length} audio device(s)`;
  } catch (e: any) {
    statusEl.textContent = `Device enumeration failed: ${e.message}`;
  }
}

// ─── Boot ───────────────────────────────────────────────────────
init();
