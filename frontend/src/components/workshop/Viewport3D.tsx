// ============================================================================
// Sunday 3D Workshop — Interactive 3D Viewport
// Three.js renderer, OrbitControls, TransformControls, Raycasting & Grid
// ============================================================================

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useWorkshop } from './WorkshopContext';
import { snapToGrid } from '../../workshop/engine/Units';

export function Viewport3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    scene,
    selectedIds,
    transformMode,
    viewMode,
    gridEnabled,
    snapEnabled,
    snapSize,
    dispatch,
  } = useWorkshop();

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Camera (default: Perspective)
    const aspect = width / height;
    const persCamera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);
    persCamera.position.set(200, 250, 300);
    cameraRef.current = persCamera;

    // 3. OrbitControls
    const controls = new OrbitControls(persCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 20, 0);
    controls.maxDistance = 3000;
    controls.minDistance = 10;
    controlsRef.current = controls;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.threeScene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(250, 400, 250);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 10;
    dirLight1.shadow.camera.far = 1000;
    dirLight1.shadow.camera.left = -300;
    dirLight1.shadow.camera.right = 300;
    dirLight1.shadow.camera.top = 300;
    dirLight1.shadow.camera.bottom = -300;
    scene.threeScene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-200, 150, -200);
    scene.threeScene.add(dirLight2);

    // 5. Grid Helper (mm units: 500x500mm grid, lines every 10mm)
    const grid = new THREE.GridHelper(500, 50, 0x0073ea, 0xd0d4dc);
    grid.position.y = 0;
    scene.threeScene.add(grid);
    gridHelperRef.current = grid;

    // 6. TransformControls
    const transformControls = new TransformControls(persCamera, renderer.domElement);
    transformControls.size = 0.75;
    // three >= r169: TransformControls is a Controls instance, not an Object3D.
    // Its visual gizmo is exposed through getHelper() and must be added to the scene.
    const transformHelper = transformControls.getHelper();
    scene.threeScene.add(transformHelper);
    transformControlsRef.current = transformControls;

    // Disable OrbitControls while dragging gizmo
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });

    // Object change listener (snapping)
    transformControls.addEventListener('change', () => {
      if (snapEnabled && transformControls.object) {
        if (transformMode === 'translate') {
          transformControls.object.position.x = snapToGrid(transformControls.object.position.x, snapSize);
          transformControls.object.position.y = snapToGrid(transformControls.object.position.y, snapSize);
          transformControls.object.position.z = snapToGrid(transformControls.object.position.z, snapSize);
        }
      }
    });

    // 7. Raycasting for selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent) => {
      // Ignore if clicking on TransformControls or right-click
      if (e.button !== 0 || transformControls.dragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);
      const allMeshes = scene.getAllObjects().map((o) => o.mesh);
      const intersects = raycaster.intersectObjects(allMeshes, true);

      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit && !hit.userData?.sceneObjectId && hit.parent) {
          hit = hit.parent as THREE.Object3D;
        }
        const objId = hit?.userData?.sceneObjectId;
        if (objId) {
          scene.select(objId, e.shiftKey);
        }
      } else if (!e.shiftKey) {
        scene.clearSelection();
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // 8. Resize Observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0 && cameraRef.current) {
          renderer.setSize(w, h);
          if (cameraRef.current instanceof THREE.PerspectiveCamera) {
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
          }
        }
      }
    });
    ro.observe(container);

    // 9. Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene.threeScene, cameraRef.current!);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      transformControls.dispose();
      scene.threeScene.remove(transformHelper);
      controls.dispose();
      renderer.dispose();
      scene.threeScene.remove(ambientLight);
      scene.threeScene.remove(dirLight1);
      scene.threeScene.remove(dirLight2);
      scene.threeScene.remove(grid);
    };
  }, []);

  // Update TransformControls attached object and mode
  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;

    if (selectedIds.length === 1) {
      const selectedObj = scene.getObject(selectedIds[0]);
      if (selectedObj && !selectedObj.locked) {
        tc.attach(selectedObj.mesh);
        tc.setMode(transformMode);
      } else {
        tc.detach();
      }
    } else {
      tc.detach();
    }
  }, [selectedIds, transformMode, scene]);

  // Update Grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = gridEnabled;
    }
  }, [gridEnabled]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-gradient-to-b from-[#f8f9fa] to-[#e9ecef] select-none"
    />
  );
}
