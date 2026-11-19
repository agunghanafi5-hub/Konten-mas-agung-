import * as THREE from 'three';
import type { SceneTheme } from '../types/video';
import type { ContentSimulationCue } from '../utils/contentCue';
import type { StudioMaterialLibrary } from './materials';

export interface DioramaRig {
  group: THREE.Group;
  disposables: THREE.BufferGeometry[];
  extraMaterials: THREE.Material[];
  animate: (
    elapsed: number,
    dt: number,
    explode: number,
    cue?: ContentSimulationCue,
    chapterProgress?: number
  ) => void;
}

const _tmpVec = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();
const _tmpVec3 = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpMat = new THREE.Matrix4();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _upVec = new THREE.Vector3(0, 1, 0);

function registerExplode(obj: THREE.Object3D, offset: THREE.Vector3) {
  obj.userData.basePos = obj.position.clone();
  obj.userData.explodeOffset = offset;
}

function applyExplode(group: THREE.Group, explode: number) {
  group.traverse((child) => {
    const base = child.userData.basePos as THREE.Vector3 | undefined;
    const off = child.userData.explodeOffset as THREE.Vector3 | undefined;
    if (base && off) {
      child.position.set(
        base.x + off.x * explode,
        base.y + off.y * explode,
        base.z + off.z * explode
      );
    }
  });
}

function enableShadows(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      const mat = m.material as THREE.MeshPhysicalMaterial | undefined;
      if (mat && (mat.transmission || mat.transparent)) {
        m.castShadow = false;
      } else {
        m.castShadow = true;
      }
      m.receiveShadow = true;
    }
  });
}

// ============================================================================
// 1. NUSANTARA: Simulasi Jembatan Kabel, Kereta Cepat, Kapal Kargo & Sinyal 5G
// ============================================================================
function buildNusantaraDiorama(
  mats: StudioMaterialLibrary,
  archipelagoTex: THREE.Texture
): DioramaRig {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  // Part 1: Architectural octagonal plinth
  const basinGeo = new THREE.CylinderGeometry(2.65, 2.82, 0.24, 16);
  disposables.push(basinGeo);
  const basin = new THREE.Mesh(basinGeo, mats.darkSlateStone);
  basin.position.y = 0.12;
  group.add(basin);
  registerExplode(basin, new THREE.Vector3(0, -0.18, 0));

  // Part 2: Maritime bathymetry sea surface
  const seaMat = new THREE.MeshPhysicalMaterial({
    map: archipelagoTex,
    roughness: 0.22,
    metalness: 0.24,
    clearcoat: 0.75,
    clearcoatRoughness: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  extraMaterials.push(seaMat);
  const seaGeo = new THREE.CylinderGeometry(2.48, 2.48, 0.04, 64);
  disposables.push(seaGeo);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = 0.25;
  group.add(sea);
  registerExplode(sea, new THREE.Vector3(0, 0.06, 0));

  // Part 3: Twin sculpted volcanic island hubs with lush tropical hills & skyline spires
  const islandShape = new THREE.Shape();
  islandShape.moveTo(-0.68, -0.4);
  islandShape.quadraticCurveTo(0, -0.62, 0.72, -0.3);
  islandShape.quadraticCurveTo(0.84, 0.34, 0.2, 0.54);
  islandShape.quadraticCurveTo(-0.56, 0.46, -0.68, -0.4);
  const islandGeo = new THREE.ExtrudeGeometry(islandShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  islandGeo.rotateX(-Math.PI / 2);

  const hillGeo = new THREE.ConeGeometry(0.36, 0.38, 12);
  const cityTowerGeo = new THREE.BoxGeometry(0.14, 0.42, 0.14);
  const spireGeo = new THREE.CylinderGeometry(0.015, 0.04, 0.35, 10);
  disposables.push(islandGeo, hillGeo, cityTowerGeo, spireGeo);

  const buildIslandCluster = (x: number, z: number, rotY: number) => {
    const islandGrp = new THREE.Group();
    islandGrp.position.set(x, 0.27, z);
    islandGrp.rotation.y = rotY;

    const land = new THREE.Mesh(islandGeo, mats.lushTerrain);
    land.position.y = 0;
    const hill = new THREE.Mesh(hillGeo, mats.lushTerrain);
    hill.position.set(-0.22, 0.38, -0.08);
    const towerA = new THREE.Mesh(cityTowerGeo, mats.machinedTitanium);
    towerA.position.set(0.22, 0.41, 0.08);
    const towerB = new THREE.Mesh(cityTowerGeo, mats.brushedGold);
    towerB.scale.set(0.85, 1.35, 0.85);
    towerB.position.set(0.05, 0.48, 0.2);
    const monument = new THREE.Mesh(spireGeo, mats.brushedGold);
    monument.position.set(0.05, 0.86, 0.2);

    islandGrp.add(land, hill, towerA, towerB, monument);
    group.add(islandGrp);
    registerExplode(islandGrp, new THREE.Vector3(Math.sign(x) * 0.38, 0.2, 0));
  };

  buildIslandCluster(-1.26, 0.24, 0.12);
  buildIslandCluster(1.26, -0.18, 2.25);

  // Part 4: Cable-Stayed High-Speed Rail Viaduct (curved deck + twin pylons + tensioned stay cables)
  const railCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.55, 0.56, 0.34),
    new THREE.Vector3(-0.7, 0.92, 0.14),
    new THREE.Vector3(0.65, 0.92, -0.06),
    new THREE.Vector3(1.52, 0.56, -0.24),
  ]);
  const railGeo = new THREE.TubeGeometry(railCurve, 56, 0.056, 12, false);
  const pylonGeo = new THREE.CylinderGeometry(0.045, 0.075, 1.48, 12);
  const crossbeamGeo = new THREE.BoxGeometry(0.32, 0.06, 0.07);
  const cableGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
  disposables.push(railGeo, pylonGeo, crossbeamGeo, cableGeo);

  const bridgeGroup = new THREE.Group();
  const railDeck = new THREE.Mesh(railGeo, mats.machinedTitanium);
  bridgeGroup.add(railDeck);

  // Bridge pylons & fan stay cables
  for (const pylonT of [0.28, 0.72]) {
    const pt = railCurve.getPointAt(pylonT);
    const tangent = railCurve.getTangentAt(pylonT);
    const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    for (const side of [-0.14, 0.14]) {
      const pylon = new THREE.Mesh(pylonGeo, mats.matteCeramic);
      pylon.position.set(pt.x + perp.x * side, 0.96, pt.z + perp.z * side);
      bridgeGroup.add(pylon);
    }

    const beam = new THREE.Mesh(crossbeamGeo, mats.brushedGold);
    beam.position.set(pt.x, 1.56, pt.z);
    beam.rotation.y = Math.atan2(tangent.x, tangent.z);
    bridgeGroup.add(beam);

    const anchorTop = new THREE.Vector3(pt.x, 1.56, pt.z);
    for (const deltaT of [-0.16, -0.09, 0.09, 0.16]) {
      const targetPt = railCurve.getPointAt(Math.max(0.04, Math.min(0.96, pylonT + deltaT)));
      const cable = new THREE.Mesh(cableGeo, mats.amberCore);
      const mid = _tmpVec.addVectors(anchorTop, targetPt).multiplyScalar(0.5);
      const len = anchorTop.distanceTo(targetPt);
      cable.position.copy(mid);
      cable.scale.set(1, len, 1);
      cable.quaternion.setFromUnitVectors(
        _upVec,
        _tmpVec2.subVectors(targetPt, anchorTop).normalize()
      );
      bridgeGroup.add(cable);
    }
  }
  group.add(bridgeGroup);
  registerExplode(bridgeGroup, new THREE.Vector3(0, 0.45, 0));

  // Part 5: Composite 5-Part Aerodynamic Bullet Train (Whoosh-style)
  const trainGroup = new THREE.Group();
  const carGeo = new THREE.BoxGeometry(0.42, 0.12, 0.13);
  const noseGeo = new THREE.ConeGeometry(0.068, 0.16, 14);
  noseGeo.rotateZ(-Math.PI / 2);
  const tailGeo = new THREE.ConeGeometry(0.068, 0.14, 14);
  tailGeo.rotateZ(Math.PI / 2);
  const windowStripGeo = new THREE.BoxGeometry(0.36, 0.036, 0.142);
  const pantoGeo = new THREE.BoxGeometry(0.08, 0.04, 0.05);
  disposables.push(carGeo, noseGeo, tailGeo, windowStripGeo, pantoGeo);

  const carBody = new THREE.Mesh(carGeo, mats.matteCeramic);
  const trainNose = new THREE.Mesh(noseGeo, mats.copperAccent);
  trainNose.position.x = 0.28;
  const trainTail = new THREE.Mesh(tailGeo, mats.copperAccent);
  trainTail.position.x = -0.27;
  const trainWindows = new THREE.Mesh(windowStripGeo, mats.cyanGlow);
  trainWindows.position.y = 0.02;
  const pantograph = new THREE.Mesh(pantoGeo, mats.brushedGold);
  pantograph.position.y = 0.08;
  trainGroup.add(carBody, trainNose, trainTail, trainWindows, pantograph);
  group.add(trainGroup);

  // Part 6: Realistic Tapered-Bow Container Ship + Wake Ripples
  const shipGroup = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.28, -0.09);
  hullShape.lineTo(0.16, -0.09);
  hullShape.quadraticCurveTo(0.32, 0, 0.16, 0.09);
  hullShape.lineTo(-0.28, 0.09);
  hullShape.closePath();
  const shipHullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  shipHullGeo.rotateX(-Math.PI / 2);

  const deckGeo = new THREE.BoxGeometry(0.38, 0.025, 0.14);
  const shipBridgeGeo = new THREE.BoxGeometry(0.1, 0.16, 0.13);
  const funnelGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.09, 10);
  const contGeo = new THREE.BoxGeometry(0.08, 0.055, 0.055);
  const wakeGeo = new THREE.RingGeometry(0.14, 0.2, 24);
  wakeGeo.rotateX(-Math.PI / 2);
  disposables.push(shipHullGeo, deckGeo, shipBridgeGeo, funnelGeo, contGeo, wakeGeo);

  const shipHull = new THREE.Mesh(shipHullGeo, mats.copperAccent);
  const deck = new THREE.Mesh(deckGeo, mats.darkSlateStone);
  deck.position.set(-0.03, 0.11, 0);
  const shipBridge = new THREE.Mesh(shipBridgeGeo, mats.matteCeramic);
  shipBridge.position.set(-0.18, 0.18, 0);
  const funnel = new THREE.Mesh(funnelGeo, mats.amberCore);
  funnel.position.set(-0.2, 0.29, 0);

  const c1 = new THREE.Mesh(contGeo, mats.brushedGold);
  c1.position.set(0.04, 0.145, -0.032);
  const c2 = new THREE.Mesh(contGeo, mats.emeraldAccent);
  c2.position.set(0.04, 0.145, 0.032);
  const c3 = new THREE.Mesh(contGeo, mats.cyanGlow);
  c3.position.set(-0.05, 0.145, 0);

  const wakeMat = new THREE.MeshBasicMaterial({
    color: '#bae6fd',
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  extraMaterials.push(wakeMat);
  const wakeRing = new THREE.Mesh(wakeGeo, wakeMat);
  wakeRing.position.set(-0.26, 0.015, 0);

  shipGroup.add(shipHull, deck, shipBridge, funnel, c1, c2, c3, wakeRing);
  group.add(shipGroup);

  // Part 7: Telecom Relay Towers & Dual Fiber/Satellite Beam Arc
  const towerGeo = new THREE.CylinderGeometry(0.024, 0.075, 0.84, 12);
  const dishRingGeo = new THREE.TorusGeometry(0.11, 0.016, 10, 24);
  const beaconGeo = new THREE.OctahedronGeometry(0.08, 0);
  disposables.push(towerGeo, dishRingGeo, beaconGeo);

  const towerW = new THREE.Mesh(towerGeo, mats.machinedTitanium);
  towerW.position.set(-1.26, 0.92, 0.24);
  const dishW = new THREE.Mesh(dishRingGeo, mats.brushedGold);
  dishW.position.set(-1.26, 1.32, 0.24);
  const beaconW = new THREE.Mesh(beaconGeo, mats.emeraldAccent);
  beaconW.position.set(-1.26, 1.44, 0.24);
  group.add(towerW, dishW, beaconW);

  const towerE = new THREE.Mesh(towerGeo, mats.machinedTitanium);
  towerE.position.set(1.26, 0.92, -0.18);
  const dishE = new THREE.Mesh(dishRingGeo, mats.brushedGold);
  dishE.position.set(1.26, 1.32, -0.18);
  const beaconE = new THREE.Mesh(beaconGeo, mats.emeraldAccent);
  beaconE.position.set(1.26, 1.44, -0.18);
  group.add(towerE, dishE, beaconE);

  const signalArcCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.26, 1.44, 0.24),
    new THREE.Vector3(0, 2.48, 0.04),
    new THREE.Vector3(1.26, 1.44, -0.18),
  ]);
  const signalArcGeo = new THREE.TubeGeometry(signalArcCurve, 40, 0.018, 8, false);
  const pulseGeo = new THREE.SphereGeometry(0.065, 14, 14);
  disposables.push(signalArcGeo, pulseGeo);

  const signalArc = new THREE.Mesh(signalArcGeo, mats.amberCore);
  const pulseA = new THREE.Mesh(pulseGeo, mats.cyanGlow);
  const pulseB = new THREE.Mesh(pulseGeo, mats.emeraldAccent);
  group.add(signalArc, pulseA, pulseB);
  registerExplode(signalArc, new THREE.Vector3(0, 0.78, 0));

  enableShadows(group);

  return {
    group,
    disposables,
    extraMaterials,
    animate: (elapsed, _dt, explode, cue) => {
      applyExplode(group, explode);
      const speedMul = cue?.tempoMultiplier ?? 1;
      const e = elapsed * speedMul;

      // Bullet train smooth ping-pong along cable-stayed viaduct
      const trainFreq = cue?.focus === 'rail' ? 0.92 : 0.72;
      const trainT = 0.5 - 0.44 * Math.cos(e * trainFreq);
      railCurve.getPointAt(trainT, _tmpVec);
      railCurve.getTangentAt(trainT, _tmpVec2);
      const dirSign = Math.sin(e * trainFreq) >= 0 ? 1 : -1;
      _tmpVec2.multiplyScalar(dirSign);
      trainGroup.position.set(_tmpVec.x, _tmpVec.y + 0.095 + explode * 0.45, _tmpVec.z);
      _tmpQuat.setFromUnitVectors(_xAxis, _tmpVec2.normalize());
      trainGroup.quaternion.copy(_tmpQuat);

      // Ship smooth maritime patrol curve with realistic pitch & wake pulsing
      const shipFreq = cue?.focus === 'maritime' ? 0.65 : 0.48;
      const shipAngle = e * shipFreq;
      const sx = Math.cos(shipAngle) * 1.25;
      const sz = Math.sin(shipAngle * 2) * 0.58 + 0.35;
      const nextAngle = shipAngle + 0.03;
      const nx = Math.cos(nextAngle) * 1.25;
      const nz = Math.sin(nextAngle * 2) * 0.58 + 0.35;
      shipGroup.position.set(sx, 0.28 + Math.sin(e * 2.2) * 0.012 + explode * 0.06, sz);
      shipGroup.rotation.y = Math.atan2(-(nz - sz), nx - sx);
      shipGroup.rotation.z = Math.sin(e * 2.1) * 0.04;

      const wakePhase = (e * 1.1) % 1;
      wakeRing.scale.setScalar(0.8 + wakePhase * 0.85);
      wakeMat.opacity = (1 - wakePhase) * 0.42;

      // Dual data pulses along telecom beam
      const p1 = (e * 0.58) % 1;
      signalArcCurve.getPointAt(p1, _tmpVec);
      pulseA.position.set(_tmpVec.x, _tmpVec.y + explode * 0.78, _tmpVec.z);

      const p2 = (e * 0.58 + 0.5) % 1;
      signalArcCurve.getPointAt(p2, _tmpVec);
      pulseB.position.set(_tmpVec.x, _tmpVec.y + explode * 0.78, _tmpVec.z);

      beaconW.rotation.y = e * 1.6;
      beaconE.rotation.y = -e * 1.6;
      dishW.rotation.y = e * 0.9;
      dishE.rotation.y = -e * 0.9;
    },
  };
}

// ============================================================================
// 2. TEKNOLOGI: Simulasi Pusat Data AI, Pendingin Cair & Inti Prosesor Silikon
// ============================================================================
function buildTeknologiDiorama(mats: StudioMaterialLibrary): DioramaRig {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  // Part 1: Hexagonal Motherboard Base + PCB Circuit Texture
  const baseGeo = new THREE.CylinderGeometry(2.38, 2.58, 0.24, 6);
  const pcbCapGeo = new THREE.CylinderGeometry(2.26, 2.26, 0.02, 6);
  disposables.push(baseGeo, pcbCapGeo);

  const base = new THREE.Mesh(baseGeo, mats.darkSlateStone);
  base.position.y = 0.12;
  const pcbCap = new THREE.Mesh(pcbCapGeo, mats.circuitBoard);
  pcbCap.position.y = 0.25;
  group.add(base, pcbCap);
  registerExplode(base, new THREE.Vector3(0, -0.15, 0));

  // Part 2: 4 Detailed Server Racks + Copper Heatpipes + 32 Instanced Blinking Rack LEDs
  const rackGeo = new THREE.BoxGeometry(0.48, 0.96, 0.38);
  const fanHousingGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16);
  fanHousingGeo.rotateX(Math.PI / 2);
  const capGeo = new THREE.BoxGeometry(0.52, 0.06, 0.42);
  const ledGeo = new THREE.BoxGeometry(0.055, 0.022, 0.02);
  disposables.push(rackGeo, fanHousingGeo, capGeo, ledGeo);

  const ledMesh = new THREE.InstancedMesh(ledGeo, mats.emeraldAccent, 24);
  ledMesh.frustumCulled = false;
  group.add(ledMesh);

  const ledCoords: { x: number; y: number; z: number; rotY: number }[] = [];
  const conduitCurves: THREE.CatmullRomCurve3[] = [];
  const coolingFans: THREE.Mesh[] = [];

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const rx = Math.cos(a) * 1.62;
    const rz = Math.sin(a) * 1.62;

    const rackGrp = new THREE.Group();
    rackGrp.position.set(rx, 0.74, rz);
    rackGrp.rotation.y = -a + Math.PI / 2;

    const rack = new THREE.Mesh(rackGeo, mats.machinedTitanium);
    const cap = new THREE.Mesh(capGeo, mats.copperAccent);
    cap.position.y = 0.51;
    const fan = new THREE.Mesh(fanHousingGeo, mats.brushedGold);
    fan.position.set(0, -0.24, 0.19);
    coolingFans.push(fan);

    rackGrp.add(rack, cap, fan);
    group.add(rackGrp);
    registerExplode(rackGrp, new THREE.Vector3(Math.cos(a) * 0.45, 0.16, Math.sin(a) * 0.45));

    // Store world coords for 6 LEDs per rack
    for (let row = 0; row < 6; row++) {
      const localX = (row % 2 === 0 ? -0.1 : 0.1);
      const localY = 0.34 - Math.floor(row / 2) * 0.12;
      _tmpVec.set(localX, localY, 0.2).applyAxisAngle(_upVec, -a + Math.PI / 2);
      ledCoords.push({
        x: rx + _tmpVec.x,
        y: 0.74 + _tmpVec.y,
        z: rz + _tmpVec.z,
        rotY: -a + Math.PI / 2,
      });
    }

    // Copper cooling pipe + fiber optic conduit into central processor
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rx * 0.82, 1.24, rz * 0.82),
      new THREE.Vector3(rx * 0.52, 1.88, rz * 0.52),
      new THREE.Vector3(Math.cos(a) * 0.42, 2.08, Math.sin(a) * 0.42),
    ]);
    conduitCurves.push(curve);

    const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.032, 10, false);
    disposables.push(tubeGeo);
    const tube = new THREE.Mesh(tubeGeo, mats.copperAccent);
    group.add(tube);
  }

  // Part 3: Central Silicon Heatsink Socket & Multi-Ring Neural Core
  const socketGeo = new THREE.BoxGeometry(0.92, 0.14, 0.92);
  const finGeo = new THREE.BoxGeometry(0.76, 0.24, 0.04);
  disposables.push(socketGeo, finGeo);

  const socketBase = new THREE.Mesh(socketGeo, mats.anodizedBronze);
  socketBase.position.y = 0.34;
  group.add(socketBase);
  for (let f = -3; f <= 3; f++) {
    const fin = new THREE.Mesh(finGeo, mats.machinedTitanium);
    fin.position.set(0, 0.52, f * 0.11);
    group.add(fin);
  }

  const gimbalOuterGeo = new THREE.TorusGeometry(0.98, 0.042, 14, 60);
  const gimbalInnerGeo = new THREE.TorusGeometry(0.72, 0.032, 14, 48);
  const crystalGeo = new THREE.OctahedronGeometry(0.36, 1);
  const glassGeo = new THREE.SphereGeometry(0.56, 32, 32);
  disposables.push(gimbalOuterGeo, gimbalInnerGeo, crystalGeo, glassGeo);

  const gimbalOuter = new THREE.Mesh(gimbalOuterGeo, mats.brushedGold);
  gimbalOuter.position.y = 2.08;
  group.add(gimbalOuter);
  registerExplode(gimbalOuter, new THREE.Vector3(0, 0.65, 0));

  const gimbalInner = new THREE.Mesh(gimbalInnerGeo, mats.copperAccent);
  gimbalInner.position.y = 2.08;
  group.add(gimbalInner);
  registerExplode(gimbalInner, new THREE.Vector3(0, 0.85, 0));

  const crystal = new THREE.Mesh(crystalGeo, mats.cyanGlow);
  crystal.position.y = 2.08;
  group.add(crystal);
  registerExplode(crystal, new THREE.Vector3(0, 1.0, 0));

  const glassShell = new THREE.Mesh(glassGeo, mats.opticalGlass);
  glassShell.renderOrder = 2;
  glassShell.position.y = 2.08;
  group.add(glassShell);
  registerExplode(glassShell, new THREE.Vector3(0, 1.25, 0));

  // Part 4: 32 Instanced Streaming Data Packets
  const packetCount = 32;
  const packetGeo = new THREE.SphereGeometry(0.058, 12, 12);
  disposables.push(packetGeo);
  const packets = new THREE.InstancedMesh(packetGeo, mats.cyanGlow, packetCount);
  packets.frustumCulled = false;
  group.add(packets);

  // Part 5: Holographic Telemetry Wave Ring
  const waveRingGeo = new THREE.TorusGeometry(0.65, 0.022, 10, 56);
  disposables.push(waveRingGeo);
  const waveRingMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.8,
  });
  extraMaterials.push(waveRingMat);
  const waveRing = new THREE.Mesh(waveRingGeo, waveRingMat);
  waveRing.rotation.x = Math.PI / 2;
  waveRing.position.y = 2.85;
  group.add(waveRing);

  enableShadows(group);

  return {
    group,
    disposables,
    extraMaterials,
    animate: (elapsed, _dt, explode, cue) => {
      applyExplode(group, explode);
      const e = elapsed * (cue?.tempoMultiplier ?? 1);

      gimbalOuter.rotation.x = e * 0.72;
      gimbalOuter.rotation.y = e * 0.42;
      gimbalInner.rotation.z = -e * 0.98;
      gimbalInner.rotation.x = Math.PI / 4;
      crystal.rotation.y = e * 1.35;

      for (let i = 0; i < coolingFans.length; i++) {
        coolingFans[i].rotation.z = e * 4.2;
      }

      // Blink server blade LEDs cleanly
      for (let i = 0; i < ledCoords.length; i++) {
        const lc = ledCoords[i];
        const activeScale = Math.sin(e * 6 + i * 1.7) > -0.2 ? 1.0 : 0.25;
        _tmpVec.set(lc.x, lc.y + explode * 0.16, lc.z);
        _tmpQuat.setFromAxisAngle(_upVec, lc.rotY);
        _tmpVec2.set(activeScale, 1, 1);
        _tmpMat.compose(_tmpVec, _tmpQuat, _tmpVec2);
        ledMesh.setMatrixAt(i, _tmpMat);
      }
      ledMesh.instanceMatrix.needsUpdate = true;

      // Streaming packets
      for (let i = 0; i < packetCount; i++) {
        const curve = conduitCurves[i % 4];
        const t = (e * 0.7 + (i / packetCount) * 1.4) % 1;
        curve.getPointAt(t, _tmpVec);
        const s = 0.75 + Math.sin(t * Math.PI) * 0.55;
        _tmpVec2.setScalar(s);
        _tmpQuat.identity();
        _tmpMat.compose(_tmpVec, _tmpQuat, _tmpVec2);
        packets.setMatrixAt(i, _tmpMat);
      }
      packets.instanceMatrix.needsUpdate = true;

      const wavePhase = (e * 0.72) % 1;
      const ws = 0.68 + wavePhase * 1.9;
      waveRing.scale.set(ws, ws, 1);
      waveRing.position.y = 2.45 + wavePhase * 0.85 + explode * 0.8;
      waveRingMat.opacity = (1 - wavePhase) * 0.85;
    },
  };
}

// ============================================================================
// 3. SAINS: Simulasi Laut Gelombang Real-Time, Turbin Angin, Panel Surya & Sensor Iklim
// ============================================================================
function buildSainsDiorama(mats: StudioMaterialLibrary): DioramaRig {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  // Part 1: Stone plinth
  const baseGeo = new THREE.CylinderGeometry(2.55, 2.74, 0.22, 24);
  disposables.push(baseGeo);
  const base = new THREE.Mesh(baseGeo, mats.darkSlateStone);
  base.position.y = 0.11;
  group.add(base);
  registerExplode(base, new THREE.Vector3(0, -0.15, 0));

  // Part 2: Continuous Deforming Real-Time Ocean Surface Mesh (28x28 grid clipped into circular disc)
  const oceanGeo = new THREE.PlaneGeometry(4.4, 4.4, 28, 28);
  oceanGeo.rotateX(-Math.PI / 2);
  // Clamp corners smoothly to circular basin radius
  const posAttr = oceanGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 2.38) {
      const k = 2.38 / r;
      posAttr.setX(i, x * k);
      posAttr.setZ(i, z * k);
    }
  }
  oceanGeo.computeVertexNormals();
  disposables.push(oceanGeo);

  const oceanMesh = new THREE.Mesh(oceanGeo, mats.oceanWater);
  oceanMesh.position.y = 0.34;
  group.add(oceanMesh);
  registerExplode(oceanMesh, new THREE.Vector3(0, 0.05, 0));

  // Part 3: Two Offshore Wind Turbines with Yellow Splash-Zone Monopile Jackets & Tapered Airfoils
  const rotors: THREE.Group[] = [];
  const jacketGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.52, 16);
  const towerGeo = new THREE.CylinderGeometry(0.05, 0.1, 1.85, 16);
  const nacelleGeo = new THREE.BoxGeometry(0.18, 0.16, 0.36);
  const hubGeo = new THREE.ConeGeometry(0.085, 0.18, 16);
  hubGeo.rotateX(Math.PI / 2);

  // Tapered airfoil blade shape
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.045, 0);
  bladeShape.lineTo(0.03, 0);
  bladeShape.quadraticCurveTo(0.04, 0.45, 0.012, 0.92);
  bladeShape.lineTo(-0.01, 0.92);
  bladeShape.quadraticCurveTo(-0.045, 0.35, -0.045, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 1,
  });
  disposables.push(jacketGeo, towerGeo, nacelleGeo, hubGeo, bladeGeo);

  const turbineCoords: [number, number, number][] = [
    [-0.95, 0.22, -0.48],
    [0.98, 0.22, 0.25],
  ];

  for (const [tx, ty, tz] of turbineCoords) {
    const turb = new THREE.Group();
    turb.position.set(tx, ty, tz);

    const jacket = new THREE.Mesh(jacketGeo, mats.amberCore);
    jacket.position.y = 0.26;
    const tower = new THREE.Mesh(towerGeo, mats.matteCeramic);
    tower.position.y = 1.38;
    const nacelle = new THREE.Mesh(nacelleGeo, mats.machinedTitanium);
    nacelle.position.set(0, 2.32, 0.04);

    const rotor = new THREE.Group();
    rotor.position.set(0, 2.32, 0.24);
    const nose = new THREE.Mesh(hubGeo, mats.brushedGold);
    nose.position.z = 0.04;
    rotor.add(nose);

    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(bladeGeo, mats.matteCeramic);
      blade.rotation.z = (b * Math.PI * 2) / 3;
      rotor.add(blade);
    }

    turb.add(jacket, tower, nacelle, rotor);
    group.add(turb);
    rotors.push(rotor);
    registerExplode(turb, new THREE.Vector3(tx * 0.35, 0.45, tz * 0.35));
  }

  // Part 4: Floating Solar Platform (PLTS Terapung) + Oceanographic Buoy
  const pontoonGeo = new THREE.BoxGeometry(0.95, 0.06, 0.64);
  const pvGeo = new THREE.BoxGeometry(0.86, 0.03, 0.56);
  const buoyHullGeo = new THREE.CylinderGeometry(0.24, 0.16, 0.28, 16);
  const buoyMastGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.34, 8);
  const buoyDomeGeo = new THREE.SphereGeometry(0.16, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
  disposables.push(pontoonGeo, pvGeo, buoyHullGeo, buoyMastGeo, buoyDomeGeo);

  const solarPlatform = new THREE.Group();
  const pontoon = new THREE.Mesh(pontoonGeo, mats.machinedTitanium);
  const pvSheet = new THREE.Mesh(pvGeo, mats.solarPanel);
  pvSheet.position.y = 0.045;
  pvSheet.rotation.x = 0.18;
  solarPlatform.add(pontoon, pvSheet);
  solarPlatform.position.set(-0.78, 0.39, 0.78);
  group.add(solarPlatform);

  const buoyGroup = new THREE.Group();
  const buoyHull = new THREE.Mesh(buoyHullGeo, mats.amberCore);
  const buoyMast = new THREE.Mesh(buoyMastGeo, mats.machinedTitanium);
  buoyMast.position.y = 0.28;
  const buoyDome = new THREE.Mesh(buoyDomeGeo, mats.opticalGlass);
  buoyDome.position.y = 0.14;
  buoyGroup.add(buoyHull, buoyMast, buoyDome);
  group.add(buoyGroup);

  // Part 5: Atmospheric Vapor & Wind Flow Particles (28 instanced)
  const dropCount = 28;
  const dropGeo = new THREE.SphereGeometry(0.038, 10, 10);
  disposables.push(dropGeo);
  const droplets = new THREE.InstancedMesh(dropGeo, mats.emeraldAccent, dropCount);
  droplets.frustumCulled = false;
  group.add(droplets);

  enableShadows(group);

  return {
    group,
    disposables,
    extraMaterials,
    animate: (elapsed, _dt, explode, cue) => {
      applyExplode(group, explode);
      const e = elapsed * (cue?.tempoMultiplier ?? 1);

      rotors[0].rotation.z = -e * (cue?.focus === 'wind' ? 2.8 : 2.1);
      rotors[1].rotation.z = -e * (cue?.focus === 'wind' ? 2.5 : 1.85) + 0.9;

      // Deform ocean surface realistically in real-time
      const waveAmp = cue?.focus === 'ocean' ? 0.11 : 0.07;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const h =
          Math.sin(x * 2.1 + e * 2.4) * waveAmp * 0.65 +
          Math.cos(z * 2.6 - e * 1.9) * waveAmp * 0.45;
        posAttr.setY(i, h);
      }
      posAttr.needsUpdate = true;
      oceanGeo.computeVertexNormals();

      // Floating solar array & sensor buoy pitch with local wave height
      const solWave = Math.sin(-0.78 * 2.1 + e * 2.4) * waveAmp * 0.65;
      solarPlatform.position.set(-0.78, 0.39 + solWave + explode * 0.15, 0.78);
      solarPlatform.rotation.z = Math.cos(-0.78 * 2.1 + e * 2.4) * 0.07;

      const buoyWave = Math.sin(0.25 * 2.1 + e * 2.4) * waveAmp * 0.65;
      buoyGroup.position.set(0.22, 0.44 + buoyWave + explode * 0.2, 0.92);
      buoyGroup.rotation.z = Math.cos(0.25 * 2.1 + e * 2.4) * 0.14;

      // Rising vapor/wind droplets
      for (let i = 0; i < dropCount; i++) {
        const phase = (e * 0.34 + i / dropCount) % 1;
        const a = i * 1.65 + e * 0.35;
        const r = 0.35 + (i % 5) * 0.28;
        _tmpVec.set(Math.cos(a) * r, 0.52 + phase * 2.3, Math.sin(a) * r);
        _tmpQuat.identity();
        _tmpVec2.setScalar(1 - phase * 0.55);
        _tmpMat.compose(_tmpVec, _tmpQuat, _tmpVec2);
        droplets.setMatrixAt(i, _tmpMat);
      }
      droplets.instanceMatrix.needsUpdate = true;
    },
  };
}

// ============================================================================
// 4. EKONOMI: Simulasi Menara Keuangan, Gantry Pelabuhan & Kereta Logistik
// ============================================================================
function buildEkonomiDiorama(mats: StudioMaterialLibrary): DioramaRig {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  // Part 1: Architectural urban/port plinth
  const plinthGeo = new THREE.BoxGeometry(4.4, 0.26, 2.75);
  disposables.push(plinthGeo);
  const plinth = new THREE.Mesh(plinthGeo, mats.darkSlateStone);
  plinth.position.y = 0.13;
  group.add(plinth);
  registerExplode(plinth, new THREE.Vector3(0, -0.15, 0));

  // Part 2: 6 Tapered Glass-and-Gold Financial Skyscraper Pillars
  const towerBaseGeo = new THREE.BoxGeometry(0.36, 1, 0.36);
  towerBaseGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.BoxGeometry(0.26, 0.14, 0.26);
  const antennaGeo = new THREE.CylinderGeometry(0.01, 0.02, 0.28, 8);
  disposables.push(towerBaseGeo, crownGeo, antennaGeo);

  const barHeights = [0.78, 1.12, 0.96, 1.48, 1.92, 2.38];
  const barMaterials = [
    mats.matteCeramic,
    mats.machinedTitanium,
    mats.anodizedBronze,
    mats.copperAccent,
    mats.brushedGold,
    mats.brushedGold,
  ];
  const towers: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const tGrp = new THREE.Group();
    tGrp.position.set(-1.35 + i * 0.54, 0.27, -0.48);

    const body = new THREE.Mesh(towerBaseGeo, barMaterials[i]);
    body.scale.set(1, barHeights[i], 1);
    const crown = new THREE.Mesh(crownGeo, mats.cyanGlow);
    crown.position.y = barHeights[i] + 0.07;
    const spire = new THREE.Mesh(antennaGeo, mats.machinedTitanium);
    spire.position.y = barHeights[i] + 0.24;

    tGrp.add(body, crown, spire);
    tGrp.userData.body = body;
    tGrp.userData.crown = crown;
    tGrp.userData.spire = spire;
    group.add(tGrp);
    towers.push(tGrp);
    registerExplode(tGrp, new THREE.Vector3((i - 2.5) * 0.12, 0.35 + i * 0.05, -0.2));
  }

  // Part 3: Sweeping Market Growth Ribbon & Diamond Value Node
  const trendCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.45, 0.92, 0.02),
    new THREE.Vector3(-0.55, 1.42, 0.02),
    new THREE.Vector3(0.42, 1.85, 0.02),
    new THREE.Vector3(1.42, 2.75, 0.02),
  ]);
  const trendGeo = new THREE.TubeGeometry(trendCurve, 40, 0.048, 12, false);
  const trackerGeo = new THREE.OctahedronGeometry(0.14, 0);
  disposables.push(trendGeo, trackerGeo);
  const trendTube = new THREE.Mesh(trendGeo, mats.amberCore);
  const tracker = new THREE.Mesh(trackerGeo, mats.cyanGlow);
  group.add(trendTube, tracker);
  registerExplode(trendTube, new THREE.Vector3(0, 0.8, 0.25));

  // Part 4: Harbor Logistics Gantry Crane + Multi-Container Cargo Shuttle on Foreground Track
  const trackGeo = new THREE.BoxGeometry(3.8, 0.06, 0.44);
  const gantryLegGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.95, 10);
  const gantryBoomGeo = new THREE.BoxGeometry(1.15, 0.07, 0.18);
  const trolleyGeo = new THREE.BoxGeometry(0.18, 0.08, 0.16);
  const hoistCableGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.32, 6);
  const shuttleChassisGeo = new THREE.BoxGeometry(0.68, 0.08, 0.28);
  const crateGeo = new THREE.BoxGeometry(0.24, 0.18, 0.22);
  disposables.push(
    trackGeo,
    gantryLegGeo,
    gantryBoomGeo,
    trolleyGeo,
    hoistCableGeo,
    shuttleChassisGeo,
    crateGeo
  );

  const track = new THREE.Mesh(trackGeo, mats.machinedTitanium);
  track.position.set(0, 0.29, 0.78);
  group.add(track);

  // Gantry crane astride the logistics corridor
  const craneGrp = new THREE.Group();
  craneGrp.position.set(0.85, 0.27, 0.78);
  for (const lx of [-0.36, 0.36]) {
    for (const lz of [-0.26, 0.26]) {
      const leg = new THREE.Mesh(gantryLegGeo, mats.copperAccent);
      leg.position.set(lx, 0.48, lz);
      craneGrp.add(leg);
    }
  }
  const boom = new THREE.Mesh(gantryBoomGeo, mats.copperAccent);
  boom.position.set(0, 0.96, 0);
  craneGrp.add(boom);

  const hoistTrolley = new THREE.Group();
  hoistTrolley.position.set(0, 0.92, 0);
  const trolleyBox = new THREE.Mesh(trolleyGeo, mats.brushedGold);
  const hoistLine = new THREE.Mesh(hoistCableGeo, mats.machinedTitanium);
  hoistLine.position.y = -0.18;
  const suspendedBox = new THREE.Mesh(crateGeo, mats.amberCore);
  suspendedBox.scale.set(0.8, 0.8, 0.8);
  suspendedBox.position.y = -0.38;
  hoistTrolley.add(trolleyBox, hoistLine, suspendedBox);
  craneGrp.add(hoistTrolley);
  group.add(craneGrp);
  registerExplode(craneGrp, new THREE.Vector3(0.25, 0.35, 0.25));

  const shuttleGroup = new THREE.Group();
  const shuttleBase = new THREE.Mesh(shuttleChassisGeo, mats.anodizedBronze);
  const crateA = new THREE.Mesh(crateGeo, mats.emeraldAccent);
  crateA.position.set(-0.15, 0.13, 0);
  const crateB = new THREE.Mesh(crateGeo, mats.brushedGold);
  crateB.position.set(0.15, 0.13, 0);
  shuttleGroup.add(shuttleBase, crateA, crateB);
  group.add(shuttleGroup);

  enableShadows(group);

  return {
    group,
    disposables,
    extraMaterials,
    animate: (elapsed, _dt, explode, cue) => {
      applyExplode(group, explode);
      const e = elapsed * (cue?.tempoMultiplier ?? 1);

      for (let i = 0; i < towers.length; i++) {
        const tGrp = towers[i];
        const body = tGrp.userData.body as THREE.Mesh;
        const crown = tGrp.userData.crown as THREE.Mesh;
        const spire = tGrp.userData.spire as THREE.Mesh;
        const h = barHeights[i] + Math.sin(e * 2.0 + i * 0.75) * 0.14;
        body.scale.y = h;
        crown.position.y = h + 0.07;
        spire.position.y = h + 0.24;
      }

      const t = (e * 0.44) % 1;
      trendCurve.getPointAt(t, _tmpVec);
      tracker.position.set(_tmpVec.x, _tmpVec.y + explode * 0.8, _tmpVec.z);
      tracker.rotation.y = e * 2.2;

      const shuttleX = Math.sin(e * 1.05) * 1.35;
      shuttleGroup.position.set(shuttleX, 0.36 + explode * 0.1, 0.78);

      // Crane hoist cycles smoothly
      hoistTrolley.position.x = Math.sin(e * 1.4) * 0.26;
      suspendedBox.position.y = -0.36 + Math.cos(e * 2.1) * 0.07;
    },
  };
}

// ============================================================================
// 5. ANTARIKSA: Simulasi Bola Bumi Bertekstur, Menara Peluncuran, Roket & Satelit
// ============================================================================
function buildAntariksaDiorama(mats: StudioMaterialLibrary): DioramaRig {
  const group = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  // Part 1: Realistic Textured Earth Horizon Hemisphere + Blue Atmospheric Rim Halo
  const planetGeo = new THREE.SphereGeometry(1.42, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.38);
  const atmoGeo = new THREE.SphereGeometry(1.48, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.38);
  disposables.push(planetGeo, atmoGeo);

  const planet = new THREE.Mesh(planetGeo, mats.earthGlobe);
  planet.position.y = -0.58;
  planet.rotation.y = -1.8; // Show Nusantara / Asia-Pacific hemisphere prominently

  const atmoMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.16,
    side: THREE.BackSide,
    depthWrite: false,
  });
  extraMaterials.push(atmoMat);
  const atmoShell = new THREE.Mesh(atmoGeo, atmoMat);
  atmoShell.position.y = -0.58;

  group.add(planet, atmoShell);
  registerExplode(planet, new THREE.Vector3(0, -0.25, 0));

  // Part 2: Ground Telemetry Dish & Launch Complex Lattice Tower
  const padGeo = new THREE.CylinderGeometry(0.48, 0.58, 0.14, 16);
  const dishPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const r = (i / 8) * 0.34;
    dishPts.push(new THREE.Vector2(r, r * r * 1.2));
  }
  const groundDishGeo = new THREE.LatheGeometry(dishPts, 24);
  const gantryColumnGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  const launchArmGeo = new THREE.BoxGeometry(0.32, 0.04, 0.06);
  disposables.push(padGeo, groundDishGeo, gantryColumnGeo, launchArmGeo);

  const pad = new THREE.Mesh(padGeo, mats.machinedTitanium);
  pad.position.set(-0.78, 0.64, 0.35);
  const groundDish = new THREE.Mesh(groundDishGeo, mats.matteCeramic);
  groundDish.position.set(-0.78, 0.77, 0.35);
  groundDish.rotation.z = -0.35;

  const launchPadBase = new THREE.Mesh(padGeo, mats.darkSlateStone);
  launchPadBase.scale.set(0.85, 1, 0.85);
  launchPadBase.position.set(0.55, 0.72, 0.15);
  const umbilicalTower = new THREE.Mesh(gantryColumnGeo, mats.copperAccent);
  umbilicalTower.position.set(0.28, 1.22, 0.15);
  const swingArm = new THREE.Mesh(launchArmGeo, mats.brushedGold);
  swingArm.position.set(0.42, 1.54, 0.15);

  group.add(pad, groundDish, launchPadBase, umbilicalTower, swingArm);

  // Part 3: Orbital Path Ring
  const orbitGeo = new THREE.TorusGeometry(2.05, 0.018, 10, 80);
  disposables.push(orbitGeo);
  const orbitRing = new THREE.Mesh(orbitGeo, mats.anodizedBronze);
  orbitRing.position.y = 2.02;
  orbitRing.rotation.x = Math.PI / 2.4;
  orbitRing.rotation.y = 0.25;
  group.add(orbitRing);
  registerExplode(orbitRing, new THREE.Vector3(0, 0.5, 0));

  // Part 4: Detailed Orbiting Satellite (hexagonal foil bus + dish + solar wings + scan cone)
  const satPivot = new THREE.Group();
  satPivot.position.y = 2.02;
  satPivot.rotation.x = Math.PI / 2.4 - Math.PI / 2;
  satPivot.rotation.z = 0.25;

  const satGroup = new THREE.Group();
  satGroup.position.set(2.05, 0, 0);

  const busGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 6);
  const wingGeo = new THREE.BoxGeometry(0.92, 0.025, 0.34);
  const dishMiniGeo = new THREE.ConeGeometry(0.14, 0.08, 16, 1, true);
  const beamGeo = new THREE.ConeGeometry(0.42, 1.45, 24, 1, true);
  disposables.push(busGeo, wingGeo, dishMiniGeo, beamGeo);

  const bus = new THREE.Mesh(busGeo, mats.brushedGold);
  const wingL = new THREE.Mesh(wingGeo, mats.solarPanel);
  wingL.position.x = -0.66;
  const wingR = new THREE.Mesh(wingGeo, mats.solarPanel);
  wingR.position.x = 0.66;
  const satDish = new THREE.Mesh(dishMiniGeo, mats.matteCeramic);
  satDish.position.y = -0.24;

  const beamMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  extraMaterials.push(beamMat);
  const scanBeam = new THREE.Mesh(beamGeo, beamMat);
  scanBeam.rotation.z = -Math.PI / 2;
  scanBeam.position.x = -0.82;

  satGroup.add(bus, wingL, wingR, satDish, scanBeam);
  satPivot.add(satGroup);
  group.add(satPivot);

  // Part 5: Multi-Stage Launch Rocket (booster core + fins + interstage + fairing + flickering exhaust plume)
  const rocketGroup = new THREE.Group();
  const stage1Geo = new THREE.CylinderGeometry(0.12, 0.14, 0.56, 18);
  const stage2Geo = new THREE.CylinderGeometry(0.11, 0.12, 0.28, 18);
  const fairingGeo = new THREE.ConeGeometry(0.115, 0.34, 18);
  const finGeo = new THREE.BoxGeometry(0.14, 0.16, 0.02);
  const plumeGeo = new THREE.ConeGeometry(0.11, 0.48, 14);
  plumeGeo.rotateX(Math.PI);
  disposables.push(stage1Geo, stage2Geo, fairingGeo, finGeo, plumeGeo);

  const stage1 = new THREE.Mesh(stage1Geo, mats.matteCeramic);
  const stage2 = new THREE.Mesh(stage2Geo, mats.darkSlateStone);
  stage2.position.y = 0.42;
  const fairing = new THREE.Mesh(fairingGeo, mats.brushedGold);
  fairing.position.y = 0.72;
  const plume = new THREE.Mesh(plumeGeo, mats.amberCore);
  plume.position.y = -0.52;

  for (let f = 0; f < 4; f++) {
    const fin = new THREE.Mesh(finGeo, mats.copperAccent);
    const fa = (f * Math.PI) / 2;
    fin.position.set(Math.cos(fa) * 0.14, -0.2, Math.sin(fa) * 0.14);
    fin.rotation.y = -fa;
    rocketGroup.add(fin);
  }
  rocketGroup.add(stage1, stage2, fairing, plume);
  group.add(rocketGroup);

  enableShadows(group);

  return {
    group,
    disposables,
    extraMaterials,
    animate: (elapsed, _dt, explode, cue) => {
      applyExplode(group, explode);
      const e = elapsed * (cue?.tempoMultiplier ?? 1);

      // Slow Earth rotation
      planet.rotation.y = -1.8 + e * 0.08;

      // Orbiting satellite sweeping around planet
      satPivot.rotation.y = e * (cue?.focus === 'satellite' ? 0.9 : 0.72);
      satGroup.lookAt(0, 0.2, 0);

      // Multi-stage rocket curved orbital launch trajectory
      const cycle = (e * (cue?.focus === 'rocket' ? 0.34 : 0.26)) % 1;
      const altitude = 0.92 + Math.pow(cycle, 1.55) * 2.35;
      rocketGroup.position.set(0.55 + cycle * 0.42, altitude + explode * 0.6, 0.15);
      rocketGroup.rotation.z = -cycle * 0.44;
      const flicker = 0.85 + Math.sin(e * 26) * 0.22;
      plume.scale.set(1, flicker, 1);

      // Umbilical swing arm retracts as rocket ascends
      swingArm.rotation.y = Math.min(1, cycle * 4.5) * -0.9;

      // Ground dish tracks satellite azimuth
      groundDish.rotation.y = Math.sin(e * 0.72) * 0.85;
    },
  };
}

export function createThemeDiorama(
  theme: SceneTheme,
  mats: StudioMaterialLibrary,
  archipelagoTex: THREE.Texture
): DioramaRig {
  switch (theme) {
    case 'nusantara':
      return buildNusantaraDiorama(mats, archipelagoTex);
    case 'teknologi':
      return buildTeknologiDiorama(mats);
    case 'sains':
      return buildSainsDiorama(mats);
    case 'ekonomi':
      return buildEkonomiDiorama(mats);
    case 'antariksa':
      return buildAntariksaDiorama(mats);
  }
}
