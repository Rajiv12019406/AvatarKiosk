import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// The Face Cap model is a public Three.js example with facial morph targets.
// If it cannot be fetched, a procedural face is shown so the app still runs.
const DEFAULT_MODEL_URL = 'https://threejs.org/examples/models/gltf/facecap.glb';

const normalize = (name) => String(name || '')
  .replace(/^blendShape1\./i, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

const OCULUS_VISEMES = {
  0: 'viseme_sil', 1: 'viseme_aa', 2: 'viseme_aa', 3: 'viseme_O',
  4: 'viseme_E', 5: 'viseme_RR', 6: 'viseme_I', 7: 'viseme_I',
  8: 'viseme_U', 9: 'viseme_U', 10: 'viseme_O', 11: 'viseme_aa',
  12: 'viseme_aa', 13: 'viseme_aa', 14: 'viseme_DD', 15: 'viseme_PP',
  16: 'viseme_FF', 17: 'viseme_TH', 18: 'viseme_kk', 19: 'viseme_SS',
  20: 'viseme_PP', 21: 'viseme_RR',
};

const VISEME_POSES = {
  0: {},
  1: { jawOpen: 0.38, mouthLowerDownLeft: 0.16, mouthLowerDownRight: 0.16 },
  2: { jawOpen: 0.72, mouthFunnel: 0.12 },
  3: { jawOpen: 0.34, mouthFunnel: 0.5, mouthPucker: 0.16 },
  4: { jawOpen: 0.28, mouthStretchLeft: 0.25, mouthStretchRight: 0.25 },
  5: { jawOpen: 0.3, mouthFunnel: 0.16 },
  6: { jawOpen: 0.12, mouthStretchLeft: 0.23, mouthStretchRight: 0.23 },
  7: { jawOpen: 0.08, mouthSmileLeft: 0.18, mouthSmileRight: 0.18, mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
  8: { jawOpen: 0.14, mouthFunnel: 0.3, mouthPucker: 0.3 },
  9: { jawOpen: 0.08, mouthPucker: 0.62 },
  10: { jawOpen: 0.24, mouthFunnel: 0.42 },
  11: { jawOpen: 0.36, mouthStretchLeft: 0.14, mouthStretchRight: 0.14 },
  12: { jawOpen: 0.3, mouthFunnel: 0.3 },
  13: { jawOpen: 0.43, mouthStretchLeft: 0.12, mouthStretchRight: 0.12 },
  14: { jawOpen: 0.2, mouthClose: 0.12 },
  15: { jawOpen: 0.13, mouthPucker: 0.26, mouthPressLeft: 0.16, mouthPressRight: 0.16 },
  16: { jawOpen: 0.1, mouthPucker: 0.42 },
  17: { jawOpen: 0.3, mouthLowerDownLeft: 0.22, mouthLowerDownRight: 0.22 },
  18: { jawOpen: 0.18, mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
  19: { jawOpen: 0.12, mouthPressLeft: 0.3, mouthPressRight: 0.3 },
  20: { jawOpen: 0.05, mouthClose: 0.38, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  21: { jawOpen: 0.18, mouthPucker: 0.26 },
};

function makeMaterial(color, roughness = 0.74) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });
}

function buildProceduralFace(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const skin = makeMaterial('#bc8d77');
  const skinLight = makeMaterial('#c99a83');
  const hair = makeMaterial('#24232a', 0.84);
  const eyeWhite = makeMaterial('#f2eee8', 0.28);
  const iris = makeMaterial('#5f756c', 0.28);
  const pupil = makeMaterial('#111218', 0.18);
  const brow = makeMaterial('#373039');
  const lip = makeMaterial('#8b4e51', 0.48);
  const mouthDark = makeMaterial('#24171b', 0.5);
  const teeth = makeMaterial('#f0e7dd', 0.35);
  const shirt = makeMaterial('#222a3d', 0.9);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.78, 32, 22), shirt);
  torso.scale.set(1.0, 0.5, 0.43);
  torso.position.set(0, -1.0, -0.06);
  root.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.56, 24), skin);
  neck.position.set(0, -0.55, 0.02);
  root.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.14, 0.0);
  root.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.69, 48, 40), skin);
  skull.scale.set(0.86, 1.14, 0.82);
  skull.position.y = 0.06;
  head.add(skull);

  // A subtle hair cap and side hair make the fallback read as a human portrait.
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.67, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.scale.set(0.9, 0.88, 0.85);
  hairCap.position.set(0, 0.25, -0.005);
  head.add(hairCap);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skinLight);
    ear.scale.set(0.55, 1.0, 0.55);
    ear.position.set(side * 0.55, -0.03, 0.0);
    head.add(ear);

    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.235, 0.12, 0.515);
    eyeGroup.rotation.y = side * 0.06;
    head.add(eyeGroup);
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 28, 20), eyeWhite);
    eyeball.scale.set(1.0, 0.64, 0.47);
    eyeGroup.add(eyeball);
    const irisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 18), iris);
    irisMesh.scale.z = 0.45;
    irisMesh.position.set(0, -0.002, 0.047);
    eyeGroup.add(irisMesh);
    const pupilMesh = new THREE.Mesh(new THREE.SphereGeometry(0.027, 20, 16), pupil);
    pupilMesh.scale.z = 0.35;
    pupilMesh.position.set(0, 0, 0.023);
    irisMesh.add(pupilMesh);
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), makeMaterial('#ffffff', 0.12));
    sparkle.position.set(-0.015, 0.02, 0.034);
    irisMesh.add(sparkle);

    const eyebrow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12), brow);
    eyebrow.scale.set(1.12, 0.18, 0.25);
    eyebrow.position.set(side * 0.235, 0.265, 0.49);
    eyebrow.rotation.z = side * -0.05;
    head.add(eyebrow);
  }

  const noseBridge = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 20), skinLight);
  noseBridge.scale.set(0.72, 1.8, 0.9);
  noseBridge.position.set(0, -0.005, 0.54);
  head.add(noseBridge);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18), skinLight);
  noseTip.scale.set(0.95, 0.7, 0.78);
  noseTip.position.set(0, -0.105, 0.585);
  head.add(noseTip);
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 10), makeMaterial('#63423b'));
    nostril.scale.set(1.1, 0.55, 0.25);
    nostril.position.set(side * 0.057, -0.14, 0.62);
    head.add(nostril);
  }

  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.255, 0.55);
  head.add(mouthGroup);
  const mouthMesh = new THREE.Mesh(new THREE.SphereGeometry(0.135, 32, 18), mouthDark);
  mouthMesh.scale.set(1.0, 0.13, 0.26);
  mouthGroup.add(mouthMesh);
  const lipLine = new THREE.Mesh(new THREE.SphereGeometry(0.145, 32, 18), lip);
  lipLine.scale.set(1.07, 0.16, 0.18);
  lipLine.position.z = -0.012;
  mouthGroup.add(lipLine);
  const teethMesh = new THREE.Mesh(new THREE.SphereGeometry(0.092, 24, 12), teeth);
  teethMesh.scale.set(1.0, 0.25, 0.15);
  teethMesh.position.set(0, 0.014, 0.025);
  mouthGroup.add(teethMesh);

  root.userData.fallbackMouth = { mouthMesh, lipLine, teethMesh, head };
  root.userData.fallbackSkin = { skin, skinLight, hair };
  return root;
}

function mapPoseToMorphs(meshes, pose) {
  const result = new Map();
  for (const [shapeName, weight] of Object.entries(pose || {})) {
    const key = normalize(shapeName);
    result.set(key, Math.max(result.get(key) || 0, weight));
  }
  return result;
}

export default function AvatarStage({ modelUrl, playbackRef, onStatus }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let disposed = false;
    let loadedRoot = null;
    let fallbackRoot = null;
    let rafId = 0;
    let morphMeshes = [];
    let lastBlinkAt = performance.now() + 1800;
    let blinkValue = 0;
    let blinkClosing = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171722');
    scene.fog = new THREE.Fog('#171722', 5.0, 12.0);

    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(0, 0.08, 4.0);
    camera.lookAt(0, 0.03, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 600, host.clientHeight || 700);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#f5e7dc', '#242436', 2.0));
    const keyLight = new THREE.DirectionalLight('#fff1e8', 2.8);
    keyLight.position.set(-2.8, 3.3, 4.2);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight('#8ba7e9', 1.5);
    fillLight.position.set(3.4, 1.0, 2.0);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight('#bb8ce8', 2.0);
    rimLight.position.set(0.4, 1.6, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 64),
      new THREE.MeshBasicMaterial({ color: '#171722', transparent: true, opacity: 0.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    scene.add(floor);

    function configureMorphMeshes(root) {
      const found = [];
      root.traverse((node) => {
        if (!node.isMesh) return;
        if (node.morphTargetInfluences && node.morphTargetDictionary) {
          const indexes = new Map();
          for (const [originalName, index] of Object.entries(node.morphTargetDictionary)) {
            indexes.set(normalize(originalName), index);
          }
          found.push({ node, indexes });
        }
      });
      return found;
    }

    function styleSampleMaterials(root) {
      root.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const name = normalize(node.name);
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const updated = mats.map((oldMat) => {
          const material = oldMat.clone();
          if (name.includes('mesh2') || name.includes('head')) {
            if (material.color) material.color.set('#d7b19c');
            if ('roughness' in material) material.roughness = 0.7;
            if ('metalness' in material) material.metalness = 0;
          } else if (name.includes('mesh3') || name.includes('teeth')) {
            if (material.color) material.color.set('#f3e7da');
          } else if (name.includes('eye')) {
            if (material.color) material.color.set('#f4eee7');
            if ('roughness' in material) material.roughness = 0.28;
          }
          return material;
        });
        node.material = Array.isArray(node.material) ? updated : updated[0];
      });
    }

    function frameModel(root) {
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetHeight = 2.15;
      const scale = size.y > 0.001 ? targetHeight / size.y : 1;
      root.scale.setScalar(scale);
      root.position.set(-center.x * scale, -center.y * scale - 0.02, -center.z * scale);
      // Slightly zoom out for broad or bust-style user models.
      camera.position.set(0, 0.03, 3.75);
      camera.lookAt(0, -0.02, 0);
    }

    function removeCurrentModel() {
      if (loadedRoot) {
        scene.remove(loadedRoot);
        loadedRoot.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((mat) => mat.dispose());
          }
        });
        loadedRoot = null;
      }
      if (fallbackRoot) {
        scene.remove(fallbackRoot);
        fallbackRoot.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((mat) => mat.dispose());
          }
        });
        fallbackRoot = null;
      }
      morphMeshes = [];
    }

    function loadFallback(statusMessage) {
      if (disposed) return;
      removeCurrentModel();
      fallbackRoot = buildProceduralFace(scene);
      fallbackRoot.position.y = -0.14;
      fallbackRoot.scale.setScalar(1.0);
      morphMeshes = [];
      onStatus?.(statusMessage || 'Using built-in avatar');
    }

    const loader = new GLTFLoader();
    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath(`https://cdn.jsdelivr.net/npm/three@${THREE.REVISION}/examples/jsm/libs/basis/`)
      .detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    onStatus?.('Loading 3D avatar…');

    loader.load(
      modelUrl || DEFAULT_MODEL_URL,
      (gltf) => {
        if (disposed) return;
        removeCurrentModel();
        loadedRoot = gltf.scene;
        // The built-in Face Cap sample is a neutral clay scan. Tint its face for a warmer appearance.
        if (!modelUrl || modelUrl === DEFAULT_MODEL_URL) styleSampleMaterials(loadedRoot);
        frameModel(loadedRoot);
        scene.add(loadedRoot);
        morphMeshes = configureMorphMeshes(loadedRoot);
        const morphCount = morphMeshes.reduce((sum, item) => sum + item.indexes.size, 0);
        if (morphCount === 0) {
          onStatus?.('Avatar loaded · this model has no facial blendshapes');
        } else {
          onStatus?.(`3D avatar ready · ${morphCount} facial controls`);
        }
      },
      undefined,
      (error) => {
        console.warn('Avatar model could not be loaded; using the built-in face.', error);
        loadFallback(modelUrl ? 'Could not load that GLB · using built-in avatar' : 'Sample unavailable · using built-in avatar');
      },
    );

    function blendShapeKeyExists(key) {
      const wanted = normalize(key);
      return morphMeshes.some(({ indexes }) => indexes.has(wanted));
    }

    function applyMorphPose(pose, strength = 1) {
      if (!morphMeshes.length) return;
      const allPose = mapPoseToMorphs(morphMeshes, pose);
      for (const { node, indexes } of morphMeshes) {
        const influences = node.morphTargetInfluences;
        for (const [name, index] of indexes) {
          const target = (allPose.get(name) || 0) * strength;
          influences[index] += (target - influences[index]) * 0.22;
        }
      }
    }

    function animate() {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const drive = playbackRef?.current;
      let speaking = false;
      let visemeId = 0;
      let pulse = 0;

      if (drive?.mode === 'audio' && drive.audio && !drive.audio.paused && !drive.audio.ended) {
        speaking = true;
        const currentTime = drive.audio.currentTime;
        const cues = drive.cues || [];
        let cue = null;
        for (let i = 0; i < cues.length; i += 1) {
          if (cues[i].t <= currentTime) cue = cues[i];
          else break;
        }
        visemeId = cue ? Number(cue.id) : 0;
        // The audio level fills the transition between provider timing cues.
        pulse = 0.04 + Math.abs(Math.sin(currentTime * 15.5)) * 0.12;
      } else if (drive?.mode === 'browser' && drive.speaking) {
        speaking = true;
        visemeId = Number(drive.visemeId || 0);
        const elapsed = (now - (drive.wordStartedAt || drive.startedAt || now)) / 1000;
        pulse = 0.05 + Math.abs(Math.sin(elapsed * 16.5)) * 0.14;
      }

      const pose = { ...(VISEME_POSES[visemeId] || {}) };
      const oculusViseme = OCULUS_VISEMES[visemeId];
      if (oculusViseme && morphMeshes.some(({ indexes }) => indexes.has(normalize(oculusViseme)))) {
        pose[oculusViseme] = visemeId === 0 ? 0 : 0.9;
      }
      if (speaking) {
        pose.jawOpen = Math.max(pose.jawOpen || 0, pulse);
      }

      if (loadedRoot && morphMeshes.length) {
        applyMorphPose(pose, 1);
        // Soft idle blink if the loaded rig exposes ARKit eye-blink shapes.
        if (now > lastBlinkAt && now < lastBlinkAt + 170) {
          const phase = (now - lastBlinkAt) / 170;
          blinkValue = Math.sin(phase * Math.PI);
          blinkClosing = phase < 0.5;
        } else if (now >= lastBlinkAt + 170) {
          blinkValue = 0;
          lastBlinkAt = now + 2200 + Math.random() * 2600;
          blinkClosing = true;
        }
        const blinkPose = {
          eyeBlinkLeft: blinkValue * 0.85,
          eyeBlinkRight: blinkValue * 0.85,
        };
        if (blendShapeKeyExists('eyeBlinkLeft') || blendShapeKeyExists('eyeBlinkRight')) {
          // Merge expression and blink weights, then apply once more to keep both active.
          const merged = { ...pose, ...blinkPose };
          applyMorphPose(merged, 1);
        }
        loadedRoot.rotation.y = Math.sin(now * 0.00028) * 0.035;
        loadedRoot.rotation.x = Math.sin(now * 0.00045) * 0.008;
      } else if (fallbackRoot?.userData.fallbackMouth) {
        const { mouthMesh, lipLine, teethMesh, head } = fallbackRoot.userData.fallbackMouth;
        const open = speaking ? Math.min(1, Math.max(0.07, pose.jawOpen || pulse)) : 0.015;
        const pucker = (pose.mouthPucker || pose.mouthFunnel || 0) * 0.45;
        mouthMesh.scale.set(1 + pucker * 0.24, 0.13 + open * 1.5, 0.26);
        lipLine.scale.set(1.07 - pucker * 0.18, 0.16 + open * 0.18, 0.18);
        teethMesh.scale.y = speaking ? 0.25 + open * 0.25 : 0.0;
        teethMesh.visible = speaking && open > 0.12;
        head.rotation.y = Math.sin(now * 0.00035) * 0.028;
        head.rotation.x = Math.sin(now * 0.0005) * 0.008;
      }

      renderer.render(scene, camera);
    }

    function resize() {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      removeCurrentModel();
      ktx2Loader.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [modelUrl, playbackRef, onStatus]);

  return <div ref={hostRef} className="avatar-stage" aria-label="Animated 3D avatar" />;
}

export { DEFAULT_MODEL_URL };
