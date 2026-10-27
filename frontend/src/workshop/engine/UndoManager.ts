// ============================================================================
// Sunday 3D Workshop — Undo/Redo Manager
// Command Pattern implementation for scene operations
// ============================================================================

import { SceneManager } from './Scene.ts';
import { SceneObject } from './SceneObject.ts';
import type { Vec3, EulerAngles, MaterialData } from '../types.ts';

export interface Command {
  name: string;
  execute(): void;
  undo(): void;
}

export class UndoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxDepth: number;
  private changeListeners: Set<() => void> = new Set();

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  public subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notify(): void {
    this.changeListeners.forEach((fn) => fn());
  }

  public execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
    this.notify();
  }

  public undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);
    this.notify();
    return true;
  }

  public redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    command.execute();
    this.undoStack.push(command);
    this.notify();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoName(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].name : null;
  }

  public getRedoName(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].name : null;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

// ---------------------------------------------------------------------------
// Standard Concrete Commands
// ---------------------------------------------------------------------------

export class AddObjectCommand implements Command {
  public readonly name: string;
  constructor(private scene: SceneManager, private object: SceneObject) {
    this.name = `Añadir ${object.name}`;
  }

  public execute(): void {
    this.scene.addObject(this.object);
    this.scene.select(this.object.id, false);
  }

  public undo(): void {
    this.scene.removeObject(this.object.id);
  }
}

export class RemoveObjectCommand implements Command {
  public readonly name: string;
  private objectBackup: SceneObject;

  constructor(private scene: SceneManager, object: SceneObject) {
    this.name = `Eliminar ${object.name}`;
    this.objectBackup = object;
  }

  public execute(): void {
    this.scene.removeObject(this.objectBackup.id);
  }

  public undo(): void {
    this.scene.addObject(this.objectBackup);
    this.scene.select(this.objectBackup.id, false);
  }
}

export class TransformCommand implements Command {
  public readonly name = 'Transformar objeto';

  constructor(
    private object: SceneObject,
    private prevPos: Vec3,
    private nextPos: Vec3,
    private prevRot: EulerAngles,
    private nextRot: EulerAngles,
    private prevScale: Vec3,
    private nextScale: Vec3
  ) {}

  public execute(): void {
    this.object.setPosition(this.nextPos);
    this.object.setRotation(this.nextRot);
    this.object.setScale(this.nextScale);
  }

  public undo(): void {
    this.object.setPosition(this.prevPos);
    this.object.setRotation(this.prevRot);
    this.object.setScale(this.prevScale);
  }
}

export class MaterialChangeCommand implements Command {
  public readonly name = 'Cambiar material';

  constructor(
    private object: SceneObject,
    private prevMaterial: MaterialData,
    private nextMaterial: MaterialData
  ) {}

  public execute(): void {
    this.object.updateMaterial(this.nextMaterial);
  }

  public undo(): void {
    this.object.updateMaterial(this.prevMaterial);
  }
}
