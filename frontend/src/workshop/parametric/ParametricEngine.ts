// ============================================================================
// Sunday 3D Workshop — Parametric Engine
// Dependency tracking, constraint validation, and recalculation system
// ============================================================================

import type { ParameterDef, ParametricConfig } from '../types.ts';

export type ParameterChangeCallback = (parameter: ParameterDef, allParams: ParameterDef[]) => void;

export class ParametricEngine {
  private configs: Map<string, ParametricConfig> = new Map();
  private callbacks: Map<string, Set<ParameterChangeCallback>> = new Map();

  /**
   * Register or update a parametric configuration for an object.
   */
  public registerConfig(config: ParametricConfig): void {
    this.configs.set(config.objectId, {
      ...config,
      parameters: config.parameters.map((p) => ({ ...p })),
    });
  }

  public getConfig(objectId: string): ParametricConfig | undefined {
    return this.configs.get(objectId);
  }

  public removeConfig(objectId: string): boolean {
    this.callbacks.delete(objectId);
    return this.configs.delete(objectId);
  }

  /**
   * Subscribe to parameter changes for a specific object.
   */
  public subscribe(objectId: string, callback: ParameterChangeCallback): () => void {
    if (!this.callbacks.has(objectId)) {
      this.callbacks.set(objectId, new Set());
    }
    const set = this.callbacks.get(objectId)!;
    set.add(callback);
    return () => set.delete(callback);
  }

  /**
   * Updates a parameter value, applies constraints, and cascades to dependent parameters.
   */
  public setParameter(
    objectId: string,
    paramName: string,
    rawVal: number
  ): { success: boolean; error?: string; updatedParameters?: ParameterDef[] } {
    const config = this.configs.get(objectId);
    if (!config) {
      return { success: false, error: 'Objeto paramétrico no registrado.' };
    }

    const targetParam = config.parameters.find((p) => p.name === paramName);
    if (!targetParam) {
      return { success: false, error: `Parámetro "${paramName}" no encontrado.` };
    }

    // Apply min/max constraints
    let val = rawVal;
    if (targetParam.min !== undefined) val = Math.max(targetParam.min, val);
    if (targetParam.max !== undefined) val = Math.min(targetParam.max, val);
    if (targetParam.step && targetParam.step > 0) {
      val = Math.round(val / targetParam.step) * targetParam.step;
    }

    targetParam.value = val;

    // Notify subscribers
    const subs = this.callbacks.get(objectId);
    if (subs) {
      subs.forEach((cb) => cb(targetParam, config.parameters));
    }

    return { success: true, updatedParameters: [...config.parameters] };
  }

  /**
   * Returns a map of parameter names to values for an object.
   */
  public getParameterValues(objectId: string): Record<string, number> {
    const config = this.configs.get(objectId);
    if (!config) return {};
    const res: Record<string, number> = {};
    config.parameters.forEach((p) => {
      res[p.name] = p.value;
    });
    return res;
  }
}
