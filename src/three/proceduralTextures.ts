import * as THREE from 'three';

export function createStageGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.5);
  bgGrad.addColorStop(0, '#181f2c');
  bgGrad.addColorStop(0.55, '#101520');
  bgGrad.addColorStop(1, '#090c12');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  const radii = [110, 190, 280, 380, 470];
  ctx.lineWidth = 1.5;
  for (let i = 0; i < radii.length; i++) {
    ctx.strokeStyle = i === 1 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(148, 163, 184, 0.14)';
    ctx.beginPath();
    ctx.arc(cx, cy, radii[i], 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const r0 = isMajor ? 268 : 274;
    const r1 = 280;
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0);
    ctx.lineTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 460, cy);
  ctx.lineTo(cx + 460, cy);
  ctx.moveTo(cx, cy - 460);
  ctx.lineTo(cx, cy + 460);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBrushedMetalBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < h; y += 1) {
    const v = Math.floor(110 + rand() * 36);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, w, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 10, cx, cx, cx);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createArchipelagoDiscTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Deep maritime bathymetry ocean gradient
  const seaGrad = ctx.createRadialGradient(size * 0.5, size * 0.5, 40, size * 0.5, size * 0.5, size * 0.5);
  seaGrad.addColorStop(0, '#0c2a44');
  seaGrad.addColorStop(0.65, '#091f34');
  seaGrad.addColorStop(1, '#071322');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle lat/long maritime coordinates
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 64; i < size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Shallow continental shelf aura around Nusantara archipelago
  const shelves: [number, number, number, number, number][] = [
    [250, 440, 120, 48, -0.58],
    [390, 595, 130, 34, 0.08],
    [470, 400, 96, 80, 0.14],
    [620, 455, 58, 72, -0.32],
    [785, 510, 125, 52, 0.24],
  ];
  for (const [x, y, rx, ry, rot] of shelves) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b46519';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.72, ry * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Maritime shipping routes
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(190, 410);
  ctx.quadraticCurveTo(440, 540, 760, 490);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createEarthGlobeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0, '#0f2947');
  oceanGrad.addColorStop(0.5, '#0a335c');
  oceanGrad.addColorStop(1, '#0d2542');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  // Polar ice caps
  ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
  ctx.fillRect(0, 0, w, 34);
  ctx.fillRect(0, h - 30, w, 30);

  // Stylized landmass continents (focused on Nusantara, Asia-Pacific, Australia, Americas, Africa)
  const landmasses: [number, number, number, number, number, string][] = [
    // Nusantara & SE Asia
    [680, 265, 58, 22, -0.35, '#2b6f4a'],
    [715, 295, 48, 12, 0.08, '#327b52'],
    [740, 255, 34, 26, 0.15, '#2c714c'],
    [785, 268, 28, 20, 0.25, '#357f54'],
    // Eurasia
    [620, 155, 170, 70, -0.08, '#3b734b'],
    [470, 165, 85, 55, 0.15, '#46744c'],
    // Australia
    [775, 360, 68, 42, -0.1, '#8c693a'],
    // Africa
    [480, 270, 72, 92, 0.12, '#7d6b3e'],
    // Americas
    [220, 175, 80, 78, -0.25, '#3b744d'],
    [290, 325, 52, 85, 0.18, '#34724a'],
  ];

  for (const [x, y, rx, ry, rot, col] of landmasses) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.18, ry * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Atmospheric cloud bands
  ctx.fillStyle = 'rgba(241, 245, 249, 0.24)';
  for (let i = 0; i < 24; i++) {
    const cx = ((i * 137) % (w - 80)) + 40;
    const cy = 65 + ((i * 79) % (h - 130));
    ctx.beginPath();
    ctx.ellipse(cx, cy, 55 + (i % 4) * 20, 10 + (i % 3) * 5, (i % 5) * 0.12 - 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createSolarCellTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f2347';
  ctx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 8;
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#142e5c' : '#112852';
      ctx.fillRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
    }
  }

  // Silver photovoltaic busbars
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
  ctx.lineWidth = 2;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCircuitBoardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c1724';
  ctx.fillRect(0, 0, size, size);

  // Subtle radial motherboard grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 2;
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 45, cy + Math.sin(a) * 45);
    ctx.lineTo(cx + Math.cos(a) * 140, cy + Math.sin(a) * 140);
    ctx.lineTo(cx + Math.cos(a + 0.14) * 230, cy + Math.sin(a + 0.14) * 230);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a + 0.14) * 230, cy + Math.sin(a + 0.14) * 230, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 82, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}
