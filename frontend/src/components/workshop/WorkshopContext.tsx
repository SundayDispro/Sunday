// ============================================================================
// Sunday 3D Workshop — React Context & State Management
// ============================================================================

import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { SceneManager } from '../../workshop/engine/Scene';
import { UndoManager } from '../../workshop/engine/UndoManager';
import { SceneObject } from '../../workshop/engine/SceneObject';
import { PrimitiveType, ProjectData } from '../../workshop/types';

export type WorkshopActivePanel =
  | 'properties'
  | 'parametric'
  | 'sign'
  | 'enclosure'
  | 'led'
  | 'materials'
  | 'costs';

export interface WorkshopState {
  scene: SceneManager;
  undoManager: UndoManager;
  selectedIds: string[];
  activeObject: SceneObject | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  viewMode: 'perspective' | 'orthographic';
  gridEnabled: boolean;
  snapEnabled: boolean;
  snapSize: number;
  activePanel: WorkshopActivePanel;
  projectId: string | null;
  projectName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

type WorkshopAction =
  | { type: 'SET_SELECTED_IDS'; payload: string[] }
  | { type: 'SET_TRANSFORM_MODE'; payload: 'translate' | 'rotate' | 'scale' }
  | { type: 'SET_VIEW_MODE'; payload: 'perspective' | 'orthographic' }
  | { type: 'TOGGLE_GRID' }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'SET_SNAP_SIZE'; payload: number }
  | { type: 'SET_ACTIVE_PANEL'; payload: WorkshopActivePanel }
  | { type: 'SET_PROJECT'; payload: { id: string | null; name: string } }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'UPDATE_UNDO_REDO' };

function workshopReducer(state: WorkshopState, action: WorkshopAction): WorkshopState {
  switch (action.type) {
    case 'SET_SELECTED_IDS': {
      const activeObj = action.payload.length > 0 ? state.scene.getObject(action.payload[0]) ?? null : null;
      return {
        ...state,
        selectedIds: action.payload,
        activeObject: activeObj,
      };
    }
    case 'SET_TRANSFORM_MODE':
      return { ...state, transformMode: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'TOGGLE_GRID':
      return { ...state, gridEnabled: !state.gridEnabled };
    case 'TOGGLE_SNAP':
      return { ...state, snapEnabled: !state.snapEnabled };
    case 'SET_SNAP_SIZE':
      return { ...state, snapSize: action.payload };
    case 'SET_ACTIVE_PANEL':
      return { ...state, activePanel: action.payload };
    case 'SET_PROJECT':
      return { ...state, projectId: action.payload.id, projectName: action.payload.name, isDirty: false };
    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload };
    case 'UPDATE_UNDO_REDO':
      return {
        ...state,
        canUndo: state.undoManager.canUndo(),
        canRedo: state.undoManager.canRedo(),
      };
    default:
      return state;
  }
}

interface WorkshopContextType extends WorkshopState {
  dispatch: React.Dispatch<WorkshopAction>;
  createPrimitive: (type: PrimitiveType) => SceneObject;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  undo: () => void;
  redo: () => void;
}

const WorkshopContext = createContext<WorkshopContextType | null>(null);

export function WorkshopProvider({ children }: { children: React.ReactNode }) {
  const sceneRef = useRef<SceneManager>(new SceneManager());
  const undoRef = useRef<UndoManager>(new UndoManager());

  const [state, dispatch] = useReducer(workshopReducer, {
    scene: sceneRef.current,
    undoManager: undoRef.current,
    selectedIds: [],
    activeObject: null,
    transformMode: 'translate',
    viewMode: 'perspective',
    gridEnabled: true,
    snapEnabled: true,
    snapSize: 10,
    activePanel: 'properties',
    projectId: null,
    projectName: 'Nuevo Taller 3D',
    isDirty: false,
    canUndo: false,
    canRedo: false,
  });

  // Listen to scene changes
  useEffect(() => {
    const unsubScene = sceneRef.current.subscribe(() => {
      dispatch({ type: 'SET_DIRTY', payload: true });
    });

    const unsubSelection = sceneRef.current.subscribeSelection((ids) => {
      dispatch({ type: 'SET_SELECTED_IDS', payload: ids });
    });

    const unsubUndo = undoRef.current.subscribe(() => {
      dispatch({ type: 'UPDATE_UNDO_REDO' });
    });

    return () => {
      unsubScene();
      unsubSelection();
      unsubUndo();
    };
  }, []);

  const createPrimitive = (type: PrimitiveType): SceneObject => {
    const obj = sceneRef.current.createPrimitive(type);
    dispatch({ type: 'SET_DIRTY', payload: true });
    return obj;
  };

  const deleteSelected = () => {
    state.selectedIds.forEach((id) => {
      sceneRef.current.removeObject(id);
    });
    sceneRef.current.clearSelection();
  };

  const duplicateSelected = () => {
    state.selectedIds.forEach((id) => {
      sceneRef.current.duplicateObject(id);
    });
  };

  const groupSelected = () => {
    sceneRef.current.groupSelected();
  };

  const ungroupSelected = () => {
    sceneRef.current.ungroupSelected();
  };

  const undo = () => {
    undoRef.current.undo();
  };

  const redo = () => {
    undoRef.current.redo();
  };

  return (
    <WorkshopContext.Provider
      value={{
        ...state,
        dispatch,
        createPrimitive,
        deleteSelected,
        duplicateSelected,
        groupSelected,
        ungroupSelected,
        undo,
        redo,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
}

export function useWorkshop() {
  const context = useContext(WorkshopContext);
  if (!context) {
    throw new Error('useWorkshop must be used within a WorkshopProvider');
  }
  return context;
}
