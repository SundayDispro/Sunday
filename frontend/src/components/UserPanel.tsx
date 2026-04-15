import React, { useRef, useState } from 'react';
import { useUser } from '../store/UserContext';
import { UserStatus } from '../types';
import { LogOut, Circle, CircleDot, CircleOff, LayoutGrid, Settings, Camera, Loader2, UserRound, KeyRound } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL ?? '');

const STATUS_OPTIONS: { value: UserStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'available', label: 'Disponible', icon: <Circle size={14} className="text-green-500 fill-green-500" /> },
  { value: 'busy', label: 'Ocupado', icon: <CircleDot size={14} className="text-amber-500 fill-amber-500" /> },
  { value: 'offline', label: 'Offline', icon: <CircleOff size={14} className="text-monday-subtext" /> },
];

interface UserPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  boardsCount?: number;
  workspaceName?: string;
  onOpenAdmin?: () => void;
}

export const UserPanel: React.FC<UserPanelProps> = ({
  open,
  onOpenChange,
  trigger,
  boardsCount = 0,
  workspaceName = 'Workspace',
  onOpenAdmin,
}) => {
  const { currentUser, logout, setUserStatus, updateAvatar, updateOwnCredentials } = useUser();
  const status = (currentUser?.status || 'offline') as UserStatus;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('');
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsMsg, setCredentialsMsg] = useState<string | null>(null);
  const [credentialsErr, setCredentialsErr] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarLoading(true);
    try {
      await updateAvatar(file);
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!currentUser) return null;

  const openCredentialsEditor = () => {
    setCredentialsMsg(null);
    setCredentialsErr(null);
    setUsernameDraft(currentUser.username);
    setCurrentPasswordDraft('');
    setNewPasswordDraft('');
  };

  const submitCredentials = async () => {
    const usernameChanged = usernameDraft.trim() !== '' && usernameDraft.trim() !== currentUser.username;
    const wantsPasswordChange = newPasswordDraft.trim() !== '';
    if (!usernameChanged && !wantsPasswordChange) {
      setCredentialsErr('No hay cambios para guardar.');
      return;
    }
    if (wantsPasswordChange && !currentPasswordDraft) {
      setCredentialsErr('Para cambiar contraseña debes escribir la contraseña actual.');
      return;
    }
    setCredentialsSaving(true);
    setCredentialsErr(null);
    setCredentialsMsg(null);
    try {
      await updateOwnCredentials({
        username: usernameChanged ? usernameDraft.trim() : undefined,
        currentPassword: wantsPasswordChange ? currentPasswordDraft : undefined,
        newPassword: wantsPasswordChange ? newPasswordDraft : undefined,
      });
      setCurrentPasswordDraft('');
      setNewPasswordDraft('');
      setCredentialsMsg('Datos actualizados correctamente.');
    } catch (err) {
      setCredentialsErr(err instanceof Error ? err.message : 'No se pudo actualizar la cuenta.');
    } finally {
      setCredentialsSaving(false);
    }
  };

  const avatarSrc = currentUser.avatarUrl
    ? currentUser.avatarUrl.startsWith('http')
      ? currentUser.avatarUrl
      : `${API_BASE}${currentUser.avatarUrl}`
    : null;

  return (
    <>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger asChild>
          {trigger}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-[60] w-72 bg-white rounded-xl shadow-monday-lg border border-monday-border p-0 overflow-hidden"
            sideOffset={8}
            side="top"
            align="end"
          >
          {/* Header con avatar y nombre */}
          <div className="p-4 border-b border-monday-border bg-monday-bg/30">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={currentUser.name}
                    className="w-11 h-11 rounded-full object-cover shadow-sm border border-monday-border/50"
                  />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: currentUser.color }}
                  >
                    {currentUser.initials}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-monday-text truncate">{currentUser.name}</p>
                <p className="text-[12px] text-monday-subtext truncate">@{currentUser.username}</p>
              </div>
            </div>
          </div>

          {avatarError && (
            <div className="px-4 py-2 text-[12px] text-red-600 bg-red-50 border-b border-red-100">
              {avatarError}
            </div>
          )}

          {/* Estado */}
          <div className="p-3 border-b border-monday-border">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">Estado</p>
            <div className="flex flex-col gap-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setUserStatus(opt.value);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors text-left ${
                    status === opt.value
                      ? 'bg-monday-blue/15 text-monday-blue font-medium'
                      : 'text-monday-text hover:bg-monday-hover'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resumen de proyectos */}
          <div className="p-3 border-b border-monday-border">
            <p className="text-[11px] font-semibold text-monday-subtext uppercase tracking-wider mb-2">Proyectos</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-monday-bg/50">
              <LayoutGrid size={16} className="text-monday-blue shrink-0" />
              <span className="text-[13px] text-monday-text">
                {boardsCount} tablero{boardsCount !== 1 ? 's' : ''} en {workspaceName}
              </span>
            </div>
          </div>

          {/* Admin (solo si es ADMIN) y Cerrar sesión */}
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                openCredentialsEditor();
                setProfileDialogOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-monday-text hover:bg-monday-hover transition-colors"
            >
              <UserRound size={16} className="text-monday-subtext shrink-0" />
              Gestión de perfil
            </button>
            {currentUser.role === 'ADMIN' && onOpenAdmin && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenAdmin();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-monday-text hover:bg-monday-hover transition-colors"
              >
                <Settings size={16} className="text-monday-subtext shrink-0" />
                Gestión de usuarios
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} className="shrink-0" />
              Cerrar sesión
            </button>
          </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Dialog.Root open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[210]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[211] w-[min(100vw-2rem,420px)] bg-monday-surface rounded-xl shadow-xl border border-monday-border p-5 outline-none">
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-3">
              Gestión de perfil
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Cambia tu imagen de perfil, nombre de usuario y contraseña.
            </Dialog.Description>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="relative shrink-0 group/avatar">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={currentUser.name}
                      className="w-14 h-14 rounded-full object-cover shadow-sm border border-monday-border/50"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm"
                      style={{ backgroundColor: currentUser.color }}
                    >
                      {currentUser.initials}
                    </div>
                  )}
                  <button
                    type="button"
                    title="Cambiar foto"
                    disabled={avatarLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer"
                  >
                    {avatarLoading
                      ? <Loader2 size={16} className="text-white animate-spin" />
                      : <Camera size={16} className="text-white" />
                    }
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-monday-text">{currentUser.name}</p>
                  <p className="text-[12px] text-monday-subtext">@{currentUser.username}</p>
                </div>
              </div>

              {avatarError && (
                <p className="text-[11px] text-red-600">{avatarError}</p>
              )}

              <div>
                <label className="text-[11px] text-monday-subtext mb-1 block">Usuario</label>
                <div className="relative">
                  <UserRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-monday-subtext" />
                  <input
                    type="text"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-monday-subtext mb-1 block">Contraseña actual</label>
                <div className="relative">
                  <KeyRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-monday-subtext" />
                  <input
                    type="password"
                    value={currentPasswordDraft}
                    onChange={(e) => setCurrentPasswordDraft(e.target.value)}
                    placeholder="Solo para cambiar contraseña"
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-monday-subtext mb-1 block">Nueva contraseña</label>
                <input
                  type="password"
                  value={newPasswordDraft}
                  onChange={(e) => setNewPasswordDraft(e.target.value)}
                  placeholder="Deja vacío para no cambiar"
                  className="w-full px-2 py-1.5 rounded-lg border border-monday-border text-[13px] text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue/30"
                />
              </div>

              {credentialsErr && (
                <p className="text-[11px] text-red-600">{credentialsErr}</p>
              )}
              {credentialsMsg && (
                <p className="text-[11px] text-green-700">{credentialsMsg}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setProfileDialogOpen(false)}
                  className="px-3 py-2 rounded-lg text-[13px] text-monday-subtext hover:bg-monday-hover"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={credentialsSaving}
                  onClick={submitCredentials}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] bg-monday-blue text-white hover:opacity-90 disabled:opacity-60"
                >
                  {credentialsSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar cambios
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
