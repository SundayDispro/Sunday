// ============================================================================
// Sunday 3D Workshop — SceneObject Class
// Represents an editable 3D node with mesh, metadata, and transform properties
// ============================================================================

import * as THREE from 'three';
import type { MaterialData, PrimitiveType, SceneObjectData, Vec3, EulerAngles, BoundingBox } from '../types.ts';
import { generatePrimitiveGeometry } from './Primitives.ts';

export class SceneObject {
  public readonly id: string;
  public name: string;
  public type: PrimitiveType;
  public materialData: MaterialData;
  public visible: boolean = true;
  public locked: boolean = false;
  public selected: boolean = false;
  public parentId: string | null = null;
  public childrenIds: string[] = [];
  public parameters: Record<string, number | string | boolean>;
  public metadata: Record<string, unknown>;

  /** The Three.js mesh representing this object. */
  public mesh: THREE.Mesh;

  constructor(data?: Partial<SceneObjectData>, customGeometry?: THREE.BufferGeometry) {
    this.id = data?.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'obj_' + Math.random().toString(36).slice(2, 11));
    this.name = data?.name ?? 'Objeto';
    this.type = data?.type ?? 'box';
    this.materialData = data?.material ?? {
      color: '#0073ea',
      opacity: 1.0,
      wireframe: false,
    };
    this.parameters = data?.parameters ?? { width: 50, height: 50, depth: 50 };
    this.metadata = data?.metadata ?? {};
    this.visible = data?.visible ?? true;
    this.locked = data?.locked ?? false;
    this.selected = data?.selected ?? false;
    this.parentId = data?.parentId ?? null;
    this.childrenIds = data?.childrenIds ? [...data.childrenIds] : [];

    // Create Three.js Material
    const material = this.createMaterial(this.materialData);

    // Create or use Geometry
    const geometry = customGeometry ?? generatePrimitiveGeometry(this.type, this.parameters);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = this.name;
    this.mesh.userData = { sceneObjectId: this.id };
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Apply transforms
    if (data?.position) {
      this.mesh.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data?.rotation) {
      this.mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    }
    if (data?.scale) {
      this.mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
    }
  }

  private createMaterial(data: MaterialData): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.color),
      transparent: data.opacity < 1.0,
      opacity: data.opacity,
      wireframe: data.wireframe,
      roughness: 0.4,
      metalness: 0.1,
    });
  }

  public updateMaterial(data: Partial<MaterialData>): void {
    this.materialData = { ...this.materialData, ...data };
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    if (data.color !== undefined) {
      mat.color.set(data.color);
    }
    if (data.opacity !== undefined) {
      mat.opacity = data.opacity;
      mat.transparent = data.opacity < 1.0;
    }
    if (data.wireframe !== undefined) {
      mat.wireframe = data.wireframe;
    }
    mat.needsUpdate = true;
  }

  public updateParameters(params: Record<string, number | string | boolean>): void {
    this.parameters = { ...this.parameters, ...params };
    const newGeometry = generatePrimitiveGeometry(this.type, this.parameters);
    this.setGeometry(newGeometry);
  }

  public setGeometry(geometry: THREE.BufferGeometry): void {
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    this.mesh.geometry = geometry;
  }

  public getPosition(): Vec3 {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
    };
  }

  public setPosition(pos: Partial<Vec3>): void {
    if (pos.x !== undefined) this.mesh.position.x = pos.x;
    if (pos.y !== undefined) this.mesh.position.y = pos.y;
    if (pos.z !== undefined) this.mesh.position.z = pos.z;
    this.mesh.updateMatrixWorld();
  }

  public getRotation(): EulerAngles {
    return {
      x: this.mesh.rotation.x,
      y: this.mesh.rotation.y,
      z: this.mesh.rotation.z,
    };
  }

  public setRotation(rot: Partial<EulerAngles>): void {
    if (rot.x !== undefined) this.mesh.rotation.x = rot.x;
    if (rot.y !== undefined) this.mesh.rotation.y = rot.y;
    if (rot.z !== undefined) this.mesh.rotation.z = rot.z;
    this.mesh.updateMatrixWorld();
  }

  public getScale(): Vec3 {
    return {
      x: this.mesh.scale.x,
      y: this.mesh.scale.y,
      z: this.mesh.scale.z,
    };
  }

  public setScale(scale: Partial<Vec3>): void {
    if (scale.x !== undefined) this.mesh.scale.x = scale.x;
    if (scale.y !== undefined) this.mesh.scale.y = scale.y;
    if (scale.z !== undefined) this.mesh.scale.z = scale.z;
    this.mesh.updateMatrixWorld();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.mesh.visible = visible;
  }

  public getBoundingBox(): BoundingBox {
    this.mesh.geometry.computeBoundingBox();
    const box = this.mesh.geometry.boundingBox?.clone() ?? new THREE.Box3();
    box.applyMatrix4(this.mesh.matrixWorld);
    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  }

  public getDimensions(): { width: number; height: number; depth: number } {
    this.mesh.geometry.computeBoundingBox();
    const box = this.mesh.geometry.boundingBox ?? new THREE.Box3();
    const size = new THREE.Vector3();
    box.getSize(size);
    return {
      width: Math.abs(size.x * this.mesh.scale.x),
      height: Math.abs(size.y * this.mesh.scale.y),
      depth: Math.abs(size.z * this.mesh.scale.z),
    };
  }

  public toData(): SceneObjectData {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      position: this.getPosition(),
      rotation: this.getRotation(),
      scale: this.getScale(),
      material: { ...this.materialData },
      visible: this.visible,
      locked: this.locked,
      selected: this.selected,
      parentId: this.parentId,
      childrenIds: [...this.childrenIds],
      parameters: { ...this.parameters },
      metadata: { ...this.metadata },
    };
  }

  public dispose(): void {
    if (this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    } else if (this.mesh.material) {
      this.mesh.material.dispose();
    }
  }

  public clone(): SceneObject {
    const data = this.toData();
    data.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'obj_' + Math.random().toString(36).slice(2, 11);
    data.name = `${this.name} (copia)`;
    data.position.x += 10;
    data.position.z += 10;
    const clonedGeom = this.mesh.geometry.clone();
    return new SceneObject(data, clonedGeom);
  }
}
