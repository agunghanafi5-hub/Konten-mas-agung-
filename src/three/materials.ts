import * as THREE from 'three';

export interface StudioMaterialLibrary {
  brushedGold: THREE.MeshPhysicalMaterial;
  anodizedBronze: THREE.MeshStandardMaterial;
  darkSlateStone: THREE.MeshStandardMaterial;
  matteCeramic: THREE.MeshStandardMaterial;
  machinedTitanium: THREE.MeshPhysicalMaterial;
  copperAccent: THREE.MeshStandardMaterial;
  amberCore: THREE.MeshStandardMaterial;
  emeraldAccent: THREE.MeshStandardMaterial;
  cyanGlow: THREE.MeshStandardMaterial;
  opticalGlass: THREE.MeshPhysicalMaterial;
  solarPanel: THREE.MeshPhysicalMaterial;
  lushTerrain: THREE.MeshStandardMaterial;
  oceanWater: THREE.MeshPhysicalMaterial;
  circuitBoard: THREE.MeshStandardMaterial;
  earthGlobe: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export interface MaterialTextureSet {
  brushedBump: THREE.Texture;
  earthTex: THREE.Texture;
  solarCellTex: THREE.Texture;
  circuitTex: THREE.Texture;
}

export function createStudioMaterials(
  textures: MaterialTextureSet,
  isSoftwareGl: boolean
): StudioMaterialLibrary {
  const { brushedBump, earthTex, solarCellTex, circuitTex } = textures;

  const brushedGold = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#eab308'),
    metalness: 0.92,
    roughness: 0.22,
    anisotropy: 0.8,
    bumpMap: brushedBump,
    bumpScale: 0.004,
  });

  const anodizedBronze = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#926239'),
    metalness: 0.84,
    roughness: 0.34,
    bumpMap: brushedBump,
    bumpScale: 0.003,
  });

  const darkSlateStone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1e2533'),
    metalness: 0.08,
    roughness: 0.82,
  });

  const matteCeramic = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cbd5e1'),
    metalness: 0.04,
    roughness: 0.68,
  });

  const machinedTitanium = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#94a3b8'),
    metalness: 0.9,
    roughness: 0.24,
    anisotropy: 0.7,
    bumpMap: brushedBump,
    bumpScale: 0.003,
  });

  const copperAccent = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d97745'),
    metalness: 0.88,
    roughness: 0.28,
  });

  const amberCore = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f59e0b'),
    emissive: new THREE.Color('#d97706'),
    emissiveIntensity: 0.85,
    metalness: 0.15,
    roughness: 0.25,
  });

  const emeraldAccent = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#10b981'),
    emissive: new THREE.Color('#059669'),
    emissiveIntensity: 0.75,
    metalness: 0.12,
    roughness: 0.3,
  });

  const cyanGlow = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#38bdf8'),
    emissive: new THREE.Color('#0284c7'),
    emissiveIntensity: 0.85,
    metalness: 0.15,
    roughness: 0.22,
  });

  const opticalGlass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e2f1ff'),
    metalness: 0.0,
    roughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.92,
    transparent: true,
    opacity: isSoftwareGl ? 0.34 : 1.0,
    ior: 1.56,
    thickness: 1.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
  });

  const solarPanel = new THREE.MeshPhysicalMaterial({
    map: solarCellTex,
    metalness: 0.42,
    roughness: 0.18,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });

  const lushTerrain = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2c6b45'),
    metalness: 0.02,
    roughness: 0.88,
  });

  const oceanWater = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0284c7'),
    metalness: 0.18,
    roughness: 0.16,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });

  const circuitBoard = new THREE.MeshStandardMaterial({
    map: circuitTex,
    metalness: 0.32,
    roughness: 0.44,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const earthGlobe = new THREE.MeshStandardMaterial({
    map: earthTex,
    metalness: 0.08,
    roughness: 0.62,
  });

  const all: THREE.Material[] = [
    brushedGold,
    anodizedBronze,
    darkSlateStone,
    matteCeramic,
    machinedTitanium,
    copperAccent,
    amberCore,
    emeraldAccent,
    cyanGlow,
    opticalGlass,
    solarPanel,
    lushTerrain,
    oceanWater,
    circuitBoard,
    earthGlobe,
  ];

  return {
    brushedGold,
    anodizedBronze,
    darkSlateStone,
    matteCeramic,
    machinedTitanium,
    copperAccent,
    amberCore,
    emeraldAccent,
    cyanGlow,
    opticalGlass,
    solarPanel,
    lushTerrain,
    oceanWater,
    circuitBoard,
    earthGlobe,
    dispose: () => {
      for (const mat of all) {
        mat.dispose();
      }
    },
  };
}
