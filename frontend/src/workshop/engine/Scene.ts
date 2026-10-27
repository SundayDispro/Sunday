// ============================================================================
// Sunday 3D Workshop — SceneManager
// High-level scene graph manager coordinating Three.js Scene & SceneObjects
// ============================================================================

import * as THREE from 'three';
import type { SceneData, SceneSettings, PrimitiveType } from '../types.ts';
import { SceneObject } from './SceneObject.ts';

export type SceneChangeListener = (scene: SceneManager) => void;
export type SelectionChangeListener = (selectedIds: string[]) => void;

export class SceneManager {
  public readonly threeScene: THREE.Scene;
  private objects: Map<string, SceneObject> = new Map();
  private selectedIds: Set<string> = new Set();
  private settings: SceneSettings;
  private sceneChangeListeners: Set<SceneChangeListener> = new Set();
  private selectionChangeListeners: Set<SelectionChangeListener> = new Set();

  constructor(settings?: Partial<SceneSettings>) {
    this.threeScene = new THREE.Scene();
    this.settings = {
      backgroundColor: '#f5f6f8',
      gridVisible: true,
      gridSize: 10,
      snapEnabled: true,
      ...settings,
    };
  }

  // ---------------------------------------------------------------------------
  // Listener events
  // ---------------------------------------------------------------------------

  public subscribe(listener: SceneChangeListener): () => void {
    this.sceneChangeListeners.add(listener);
    return () => this.sceneChangeListeners.delete(listener);
  }

  public subscribeSelection(listener: SelectionChangeListener): () => void {
    this.selectionChangeListeners.add(listener);
    return () => this.selectionChangeListeners.delete(listener);
  }

  private notifySceneChanged(): void {
    this.sceneChangeListeners.forEach((fn) => fn(this));
  }

  private notifySelectionChanged(): void {
    const list = Array.from(this.selectedIds);
    this.selectionChangeListeners.forEach((fn) => fn(list));
  }

  // ---------------------------------------------------------------------------
  // Object CRUD
  // ---------------------------------------------------------------------------

  public addObject(obj: SceneObject): SceneObject {
    this.objects.set(obj.id, obj);
    this.threeScene.add(obj.mesh);
    this.notifySceneChanged();
    return obj;
  }

  public createPrimitive(
    type: PrimitiveType,
    name?: string,
    parameters?: Record<string, number | string | boolean>
  ): SceneObject {
    const defaultNames: Record<PrimitiveType, string> = {
      box: 'Cubo',
      sphere: 'Esfera',
      cylinder: 'Cilindro',
      cone: 'Cono',
      wedge: 'Cuña',
      torus: 'Toroide',
      text: 'Texto 3D',
      svgExtrusion: 'Extrusión SVG',
      boolean: 'Resultado Booleano',
      group: 'Grupo',
      imported: 'Objeto Importado',
    };

    const count = Array.from(this.objects.values()).filter((o) => o.type === type).length + 1;
    const objName = name ?? `${defaultNames[type]} ${count}`;

    const obj = new SceneObject({
      name: objName,
      type,
      parameters,
    });

    this.addObject(obj);
    this.select(obj.id, false);
    return obj;
  }

  public removeObject(id: string): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;

    // Deselect if selected
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      this.notifySelectionChanged();
    }

    // Remove from parent if part of a group
    if (obj.parentId) {
      const parent = this.objects.get(obj.parentId);
      if (parent) {
        parent.childrenIds = parent.childrenIds.filter((cid) => cid !== id);
      }
    }

    // Remove children if this is a group
    if (obj.childrenIds.length > 0) {
      for (const childId of [...obj.childrenIds]) {
        this.removeObject(childId);
      }
    }

    this.threeScene.remove(obj.mesh);
    obj.dispose();
    this.objects.delete(id);

    this.notifySceneChanged();
    return true;
  }

  public getObject(id: string): SceneObject | undefined {
    return this.objects.get(id);
  }

  public getAllObjects(): SceneObject[] {
    return Array.from(this.objects.values());
  }

  public getRootObjects(): SceneObject[] {
    return Array.from(this.objects.values()).filter((obj) => obj.parentId === null);
  }

  public duplicateObject(id: string): SceneObject | null {
    const obj = this.objects.get(id);
    if (!obj) return null;

    const clone = obj.clone();
    this.addObject(clone);
    this.select(clone.id, false);
    return clone;
  }

  public renameObject(id: string, newName: string): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;
    obj.name = newName.trim() || obj.name;
    obj.mesh.name = obj.name;
    this.notifySceneChanged();
    return true;
  }

  public setVisibility(id: string, visible: boolean): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;
    obj.setVisible(visible);
    this.notifySceneChanged();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  public select(id: string, multiSelect = false): void {
    if (!this.objects.has(id)) return;

    if (!multiSelect) {
      this.clearSelection(false);
    }

    this.selectedIds.add(id);
    const obj = this.objects.get(id);
    if (obj) obj.selected = true;

    this.notifySelectionChanged();
  }

  public deselect(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      const obj = this.objects.get(id);
      if (obj) obj.selected = false;
      this.notifySelectionChanged();
    }
  }

  public toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.deselect(id);
    } else {
      this.select(id, true);
    }
  }

  public clearSelection(notify = true): void {
    this.selectedIds.forEach((id) => {
      const obj = this.objects.get(id);
      if (obj) obj.selected = false;
    });
    this.selectedIds.clear();
    if (notify) this.notifySelectionChanged();
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public getSelectedObjects(): SceneObject[] {
    return Array.from(this.selectedIds)
      .map((id) => this.objects.get(id))
      .filter((obj): obj is SceneObject => obj !== undefined);
  }

  public selectAll(): void {
    this.objects.forEach((obj) => {
      obj.selected = true;
      this.selectedIds.add(obj.id);
    });
    this.notifySelectionChanged();
  }

  // ---------------------------------------------------------------------------
  // Grouping
  // ---------------------------------------------------------------------------

  public groupSelected(): SceneObject | null {
    const selected = this.getSelectedObjects();
    if (selected.length < 2) return null;

    const groupObj = this.createPrimitive('group', `Grupo (${selected.length} objetos)`);

    selected.forEach((child) => {
      child.parentId = groupObj.id;
      groupObj.childrenIds.push(child.id);
    });

    this.clearSelection(false);
    this.select(groupObj.id, false);
    this.notifySceneChanged();
    return groupObj;
  }

  public ungroupSelected(): boolean {
    const selected = this.getSelectedObjects().filter((obj) => obj.type === 'group');
    if (selected.length === 0) return false;

    selected.forEach((group) => {
      group.childrenIds.forEach((childId) => {
        const child = this.objects.get(childId);
        if (child) child.parentId = null;
      });
      this.removeObject(group.id);
    });

    this.notifySceneChanged();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Settings & Clear
  // ---------------------------------------------------------------------------

  public getSettings(): SceneSettings {
    return { ...this.settings };
  }

  public updateSettings(settings: Partial<SceneSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.notifySceneChanged();
  }

  public clear(): void {
    this.clearSelection(false);
    this.objects.forEach((obj) => {
      this.threeScene.remove(obj.mesh);
      obj.dispose();
    });
    this.objects.clear();
    this.notifySceneChanged();
    this.notifySelectionChanged();
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  public toData(): SceneData {
    return {
      objects: Array.from(this.objects.values()).map((o) => o.toData()),
      selectedIds: Array.from(this.selectedIds),
      settings: { ...this.settings },
    };
  }

  public fromData(data: SceneData): void {
    this.clear();
    if (data.settings) {
      this.settings = { ...this.settings, ...data.settings };
    }

    const objectDataList = data.objects || [];
    objectDataList.forEach((objData) => {
      const obj = new SceneObject(objData);
      this.objects.set(obj.id, obj);
      this.threeScene.add(obj.mesh);
    });

    if (Array.isArray(data.selectedIds)) {
      data.selectedIds.forEach((id) => {
        if (this.objects.has(id)) {
          this.selectedIds.add(id);
          const obj = this.objects.get(id);
          if (obj) obj.selected = true;
        }
      });
    }

    this.notifySceneChanged();
    this.notifySelectionChanged();
  }
}
