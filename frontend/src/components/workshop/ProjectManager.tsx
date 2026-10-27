// ============================================================================
// Sunday 3D Workshop — Project Manager Modal & Persistence
// Handles Save, Open, New, and Cloud Sync via Sunday API
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Folder, Save, Plus, X, Check, AlertCircle } from 'lucide-react';
import { useWorkshop } from './WorkshopContext';
import { serializeProject } from '../../workshop/engine/Serialization';
import {
  buildProjectSaveRequest,
  describeSaveFailure,
  extractProjectScene,
} from '../../workshop/engine/ProjectPersistence';
import { apiFetch } from '../../api';

export interface ProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Workspace activo: todas las operaciones del taller quedan acotadas a él. */
  workspaceId: string | null;
}

interface ServerProject {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

interface SaveFeedback {
  kind: 'success' | 'error';
  text: string;
}

export function ProjectManager({ isOpen, onClose, workspaceId }: ProjectManagerProps) {
  const { scene, projectName, projectId, dispatch } = useWorkshop();

  const [projects, setProjects] = useState<ServerProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProjectName, setNewProjectName] = useState(projectName);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);

  const workspaceQuery = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';

  // Fetch projects list
  const fetchProjects = async () => {
    if (!workspaceId) {
      setProjects([]);
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshop/projects${workspaceQuery}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch {
      // Local storage fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setNewProjectName(projectName);
    }
  }, [isOpen, projectName, workspaceId]);

  if (!isOpen) return null;

  const handleSaveProject = async () => {
    if (!workspaceId) {
      setFeedback({
        kind: 'error',
        text: 'El proyecto no se guardó. Selecciona un espacio de trabajo.',
      });
      return;
    }

    const name = newProjectName.trim();
    if (!name) {
      setFeedback({
        kind: 'error',
        text: 'El proyecto no se guardó. El nombre no puede estar vacío.',
      });
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);

      // `serializeProject` incluye la escena completa (objetos, transformaciones,
      // materiales y parámetros por objeto). No se envían `parameters`,
      // `catalog` ni `quotations` de nivel superior porque este flujo no tiene
      // ese estado compartido: enviarlos vacíos sobrescribiría datos existentes.
      const serialized = serializeProject(scene, name);
      const request = buildProjectSaveRequest({
        projectId,
        workspaceId,
        name,
        sceneData: serialized.data.scene,
      });

      const res = await apiFetch(
        `${request.path}${projectId ? workspaceQuery : ''}`,
        {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.body),
        },
      );

      if (!res.ok) {
        let serverError = '';
        try {
          const data = await res.json();
          serverError = typeof data?.error === 'string' ? data.error : '';
        } catch {
          // Sin cuerpo JSON: se usa el mensaje por estado HTTP.
        }
        setFeedback({
          kind: 'error',
          text: describeSaveFailure(res.status, serverError).message,
        });
        return;
      }

      const saved = await res.json();
      if (!saved || typeof saved.id !== 'string') {
        setFeedback({
          kind: 'error',
          text: 'El proyecto no se guardó: el servidor no confirmó el guardado.',
        });
        return;
      }

      dispatch({
        type: 'SET_PROJECT',
        payload: { id: saved.id, name: saved.name },
      });
      setFeedback({ kind: 'success', text: '¡Proyecto guardado con éxito!' });
      setTimeout(() => setFeedback(null), 3000);
      fetchProjects();
    } catch (e) {
      // Un fallo de red no es un guardado local: no se persiste nada y se
      // informa claramente de que el guardado remoto falló.
      setFeedback({
        kind: 'error',
        text: describeSaveFailure(
          null,
          e instanceof Error ? e.message : ''
        ).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenProject = async (id: string) => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshop/projects/${id}${workspaceQuery}`);
      if (res.ok) {
        const data = await res.json();
        const restoredScene = extractProjectScene(data);
        if (!restoredScene) {
          alert('El proyecto no contiene una escena 3D válida.');
          return;
        }
        scene.fromData(restoredScene);
        dispatch({
          type: 'SET_PROJECT',
          payload: { id: data.id, name: data.name },
        });
        onClose();
      } else {
        let message = 'No se pudo abrir el proyecto.';
        try {
          const data = await res.json();
          if (typeof data?.error === 'string') message = data.error;
        } catch {
          // Sin cuerpo JSON: se usa el mensaje genérico.
        }
        alert(message);
      }
    } catch (e) {
      alert('Error al abrir el proyecto.');
    } finally {
      setLoading(false);
    }
  };

  const handleNewProject = () => {
    if (confirm('¿Deseas iniciar un nuevo proyecto? Los cambios no guardados se perderán.')) {
      scene.clear();
      dispatch({
        type: 'SET_PROJECT',
        payload: { id: null, name: 'Nuevo Proyecto 3D' },
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-monday-surface border border-monday-border rounded-xl shadow-monday-lg w-full max-w-md overflow-hidden flex flex-col text-[13px] text-monday-text">
        {/* Header */}
        <div className="p-3.5 border-b border-monday-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-monday-blue" />
            <span className="font-semibold text-[14px]">Gestión de Proyectos 3D</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-monday-hover text-monday-subtext hover:text-monday-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Current Project Name & Save */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider block">
              Nombre del Proyecto Actual
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-monday border border-monday-border bg-monday-bg text-[13px] outline-none focus:border-monday-blue font-medium"
              />
              <button
                onClick={handleSaveProject}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-monday bg-monday-blue text-white font-medium hover:bg-blue-600 transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <Save size={14} />
                <span>{saving ? 'Guardando...' : 'Guardar'}</span>
              </button>
            </div>
            {feedback && (
              <div
                role={feedback.kind === 'error' ? 'alert' : 'status'}
                className={`text-[11px] font-medium flex items-center gap-1 pt-1 ${
                  feedback.kind === 'error' ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {feedback.kind === 'error' ? <AlertCircle size={13} /> : <Check size={13} />}
                <span>{feedback.text}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-monday-border">
            <span className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider">
              Proyectos Guardados
            </span>
            <button
              onClick={handleNewProject}
              className="text-[12px] text-monday-blue font-medium flex items-center gap-1 hover:underline"
            >
              <Plus size={13} />
              <span>Nuevo Proyecto</span>
            </button>
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto space-y-1 divide-y divide-monday-border/50">
            {loading ? (
              <div className="py-6 text-center text-monday-subtext text-[12px]">
                Cargando proyectos...
              </div>
            ) : projects.length === 0 ? (
              <div className="py-6 text-center text-monday-subtext text-[12px]">
                No hay proyectos guardados aún en este espacio de trabajo.
              </div>
            ) : (
              projects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center justify-between py-2 px-1 hover:bg-monday-hover rounded transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-medium text-[12px] truncate">{proj.name}</div>
                    <div className="text-[10px] text-monday-subtext">
                      {new Date(proj.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenProject(proj.id)}
                    className="px-2.5 py-1 rounded border border-monday-border bg-white text-[11px] font-medium hover:bg-blue-50 hover:text-monday-blue transition-colors shrink-0"
                  >
                    Abrir
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
