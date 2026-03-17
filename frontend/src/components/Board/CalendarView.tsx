import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Board, Item, BoardColumn, StatusOption, CalendarEvent } from '../../types';
import { ChevronLeft, ChevronRight, ChevronDown, Share2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { socket } from '../../store/socket';

const CALENDAR_EVENT_TYPES = [
  { id: 'levantamiento' as const, label: 'Levantamiento', color: '#6e3cbb' },
  { id: 'pendiente' as const, label: 'Pendiente', color: '#ec4899' },
  { id: 'colocacion' as const, label: 'Entrega', color: '#0f766e' },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  levantamiento: '#6e3cbb',
  pendiente: '#ec4899',
  colocacion: '#0f766e',
};

/** Altura reducida de barras en el calendario (ajustar si se quiere más compacto). */
const DAY_ROW_H = 28;
const LANE_H = 20;
/** Máximo de barras visibles por celda/día antes de mostrar "+N más". Aumentar para ver más, reducir para celdas más compactas. */
const MAX_BARS_VISIBLE_IN_CELL = 4;
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');
import { apiFetch } from '../../api';

const WEEKDAYS = ['lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.', 'dom.'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Parsea una fecha (YYYY-MM-DD o ISO) y devuelve un Date a medianoche LOCAL
 * para ese día civil, para que las barras no se desplacen un día por la zona horaria.
 */
function parseDateToLocal(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(y, m, day);
}

function getDatesFromColumn(item: Item, col: BoardColumn | undefined): { start: Date; end?: Date } | null {
  if (!col) return null;
  const cv = item.columnValues.find(v => v.columnId === col.id);
  if (!cv?.value) return null;
  if (col.type === 'date') {
    const d = parseDateToLocal(cv.value);
    return d ? { start: d } : null;
  }
  if (col.type === 'timeline') {
    try {
      const parsed = JSON.parse(cv.value);
      const start = parsed.start ? parseDateToLocal(parsed.start) : null;
      const end = parsed.end ? parseDateToLocal(parsed.end) : null;
      if (start && !isNaN(start.getTime())) return { start, end: end && !isNaN(end.getTime()) ? end : undefined };
    } catch {
      const d = parseDateToLocal(cv.value);
      return d ? { start: d } : null;
    }
  }
  return null;
}

/** Devuelve el tipo de evento del calendario si existe (levantamiento | pendiente | colocacion). */
function getTipoEvento(item: Item, tipoEventoColumn: BoardColumn | undefined): string | null {
  if (!tipoEventoColumn) return null;
  const cv = item.columnValues.find(v => v.columnId === tipoEventoColumn.id)?.value?.trim?.();
  if (!cv) return null;
  const v = cv.toLowerCase();
  if (v === 'levantamiento' || v === 'pendiente' || v === 'colocacion') return v;
  return null;
}

/** Devuelve la etiqueta del estado seleccionado (ej. "Hecho", "Trabajando en ello"). */
function getStatusLabel(item: Item, statusColumn: BoardColumn | undefined): string | null {
  if (!statusColumn?.settings) return null;
  let optionId: string | null = null;
  const cv = item.columnValues.find(v => v.columnId === statusColumn.id)?.value;
  if (cv) {
    try {
      const parsed = JSON.parse(cv);
      optionId = parsed.optionId ?? null;
    } catch {
      optionId = cv;
    }
  }
  try {
    const settings = JSON.parse(statusColumn.settings);
    const options: StatusOption[] = settings?.options ?? [];
    const opt = options.find((o: StatusOption) => o.id === optionId);
    return opt?.label ?? null;
  } catch {
    return null;
  }
}

/** Devuelve true si el item está en estado Aprobado.
 *  Se prioriza la columna de título exactamente "Estado"; si no existe,
 *  se usan otras columnas status/priority EXCLUYENDO "Estado Taller".
 */
function isItemAprobado(item: Item, columns: BoardColumn[]): boolean {
  const estadoCols = columns.filter(
    c => (c.type === 'status' || c.type === 'priority') && c.title === 'Estado'
  );
  const otherStatusOrPriority = columns.filter(
    c =>
      (c.type === 'status' || c.type === 'priority') &&
      c.title !== 'Estado' &&
      c.title !== 'Estado Taller'
  );
  const toCheck = estadoCols.length > 0 ? estadoCols : otherStatusOrPriority;

  return toCheck.some(col => {
    const cv = item.columnValues.find(v => v.columnId === col.id)?.value;
    if (!cv) return false;
    try {
      const parsed = JSON.parse(cv);
      return (parsed?.optionId ?? cv) === 'aprobado';
    } catch {
      return cv === 'aprobado';
    }
  });
}

type CalendarViewType = 'month' | 'week' | 'day';

export type CalendarEventDetails = { name: string; time: string };

/** Una barra en el calendario puede ser un item del tablero o un evento solo de calendario. */
export type CalendarBarEntry = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  color: string;
  item?: Item;
  isCalendarOnly?: boolean;
  /** Si es evento solo-calendario, el evento completo para editar/eliminar */
  calendarEvent?: CalendarEvent;
};

export type CalendarEventKind = 'levantamiento' | 'pendiente' | 'colocacion';

interface Props {
  board: Board;
  onRowClick: (item: Item) => void;
  isTallerView?: boolean;
  /** En móvil: controles más grandes (touch), menos padding, misma estructura */
  isMobile?: boolean;
  /** Landscape con poca altura: aún más compacto (menos padding, controles más densos) */
  isLandscapeShort?: boolean;
  /** Si se pasa, se muestra el botón "Crear Tarea" que abre el modal Añadir a proyecto */
  onOpenAddToProject?: () => void;
  /** Registra una función para abrir el modal de evento de calendario con fecha y tipo (desde la barra superior) */
  onRegisterOpenCalendarEvent?: (open: (opts: { date: Date; eventType: CalendarEventKind }) => void) => void;
  /** Vista inicial (p. ej. 'week' para modo horizontal en pestaña exclusiva) */
  defaultViewType?: CalendarViewType;
}

function formatDateForModal(d: Date): string {
  const day = d.getDate();
  const month = MONTHS[d.getMonth()].toLowerCase();
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export const CalendarView: React.FC<Props> = ({ board, onRowClick, isTallerView, isMobile = false, isLandscapeShort = false, onOpenAddToProject, onRegisterOpenCalendarEvent, defaultViewType }) => {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [viewType, setViewType] = useState<CalendarViewType>(defaultViewType ?? 'month');
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | null>(null);
  const [addModalStep, setAddModalStep] = useState<'type' | 'form'>('type');
  const [addModalEventType, setAddModalEventType] = useState<CalendarEventKind | null>(null);
  const [addModalName, setAddModalName] = useState('');
  const [addModalTime, setAddModalTime] = useState('09:00');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  /** Clave del día cuya celda "+N más" tiene el popover abierto (week: cell.key, day: 'day'). */
  const [morePopoverKey, setMorePopoverKey] = useState<string | null>(null);
  /** Evento de calendario sobre el que se abrió el menú Editar/Eliminar. */
  const [eventMenuEvent, setEventMenuEvent] = useState<CalendarEvent | null>(null);
  /** Evento en edición (formulario abierto). */
  const [editFormEvent, setEditFormEvent] = useState<CalendarEvent | null>(null);
  const [editFormName, setEditFormName] = useState('');
  const [editFormTime, setEditFormTime] = useState('09:00');
  const [editSubmitting, setEditSubmitting] = useState(false);
  /** Enviar evento a grupo/tablero */
  const [sendToBoardEvent, setSendToBoardEvent] = useState<CalendarEvent | null>(null);
  const [boardsList, setBoardsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoardForSend, setSelectedBoardForSend] = useState<Board | null>(null);
  const [sendToGroupId, setSendToGroupId] = useState('');
  const [sendToAfterItemId, setSendToAfterItemId] = useState('');
  const [sendToSubmitting, setSendToSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());

  useEffect(() => {
    const boardId = board.id;
    apiFetch(`${API_BASE}/api/boards/${boardId}/calendar-events`)
      .then(res => res.ok ? res.json() : [])
      .then((data: CalendarEvent[]) => {
        const list = Array.isArray(data) ? data : [];
        const byId = new Map(list.map(e => [e.id, e]));
        setCalendarEvents(Array.from(byId.values()));
      })
      .catch(() => setCalendarEvents([]));
  }, [board.id]);

  useEffect(() => {
    const onAdded = (ev: CalendarEvent) => {
      if (ev.boardId !== board.id) return;
      setCalendarEvents(prev => (prev.some(e => e.id === ev.id) ? prev : [...prev, ev]));
    };
    const onDeleted = (payload: { boardId: string; eventId: string }) => {
      if (payload.boardId === board.id) setCalendarEvents(prev => prev.filter(e => e.id !== payload.eventId));
    };
    const onUpdated = (ev: CalendarEvent) => {
      if (ev.boardId !== board.id) return;
      setCalendarEvents(prev => prev.map(e => (e.id === ev.id ? ev : e)));
    };
    socket.on('calendar_event_added', onAdded);
    socket.on('calendar_event_deleted', onDeleted);
    socket.on('calendar_event_updated', onUpdated);
    return () => {
      socket.off('calendar_event_added', onAdded);
      socket.off('calendar_event_deleted', onDeleted);
      socket.off('calendar_event_updated', onUpdated);
    };
  }, [board.id]);

  const openAddModal = (date: Date) => {
    setAddModalDate(date);
    setAddModalStep('type');
    setAddModalEventType(null);
    setAddModalName('');
    setAddModalTime('09:00');
    setAddModalOpen(true);
  };

  const openAddModalWithType = (date: Date, eventType: CalendarEventKind) => {
    setAddModalDate(date);
    setAddModalEventType(eventType);
    setAddModalStep('form');
    setAddModalName('');
    setAddModalTime('09:00');
    setAddModalOpen(true);
  };

  const openAddModalWithTypeRef = useRef(openAddModalWithType);
  openAddModalWithTypeRef.current = openAddModalWithType;
  useEffect(() => {
    onRegisterOpenCalendarEvent?.( (opts) => openAddModalWithTypeRef.current(opts.date, opts.eventType) );
  }, [onRegisterOpenCalendarEvent]);

  const handleChooseEventType = (eventType: CalendarEventKind) => {
    if (!addModalDate) return;
    setAddModalEventType(eventType);
    setAddModalStep('form');
  };

  const handleBackToType = () => {
    setAddModalStep('type');
    setAddModalEventType(null);
  };

  const handleBarClick = (bar: CalendarBarEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (bar.isCalendarOnly && bar.calendarEvent) {
      setEventMenuEvent(bar.calendarEvent);
    } else if (bar.item) {
      onRowClick(bar.item);
    }
  };

  const openEditForm = (ev: CalendarEvent) => {
    const d = ev.eventDate ? new Date(ev.eventDate) : null;
    const timeStr = d && !isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '09:00';
    setEditFormEvent(ev);
    setEditFormName(ev.name);
    setEditFormTime(timeStr);
    setEventMenuEvent(null);
  };

  const handleEditSubmit = async () => {
    if (!editFormEvent) return;
    setEditSubmitting(true);
    try {
      const y = new Date(editFormEvent.eventDate).getFullYear();
      const m = String(new Date(editFormEvent.eventDate).getMonth() + 1).padStart(2, '0');
      const d = String(new Date(editFormEvent.eventDate).getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const res = await apiFetch(`${API_BASE}/api/boards/${board.id}/calendar-events/${editFormEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editFormName.trim() || editFormEvent.name, date: dateStr, time: editFormTime }),
      });
      if (res.ok) {
        const updated: CalendarEvent = await res.json();
        setCalendarEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        setEditFormEvent(null);
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteEvent = async (ev: CalendarEvent) => {
    try {
      await apiFetch(`${API_BASE}/api/boards/${board.id}/calendar-events/${ev.id}`, { method: 'DELETE' });
      setCalendarEvents(prev => prev.filter(e => e.id !== ev.id));
      setEventMenuEvent(null);
    } catch (_) {}
  };

  const openSendToBoard = (ev: CalendarEvent) => {
    setSendToBoardEvent(ev);
    setEventMenuEvent(null);
    setSendToGroupId('');
    setSendToAfterItemId('');
    setSelectedBoardForSend(null);
    apiFetch(`${API_BASE}/api/boards`)
      .then(res => res.ok ? res.json() : [])
      .then((list: { id: string; name: string }[]) => {
        setBoardsList(Array.isArray(list) ? list : []);
        if (list.length === 1) {
          if (list[0].id === board.id) {
            setSelectedBoardForSend(board);
            setSendToGroupId(board.groups[0]?.id ?? '');
          } else {
            apiFetch(`${API_BASE}/api/boards/${list[0].id}`)
              .then(r => r.ok ? r.json() : null)
              .then((b: Board | null) => {
                if (b) {
                  setSelectedBoardForSend(b);
                  setSendToGroupId(b.groups[0]?.id ?? '');
                }
              });
          }
        }
      })
      .catch(() => setBoardsList([]));
  };

  const onSelectBoardForSend = (boardId: string) => {
    if (boardId === board.id) {
      setSelectedBoardForSend(board);
      setSendToGroupId(board.groups[0]?.id ?? '');
      setSendToAfterItemId('');
      return;
    }
    apiFetch(`${API_BASE}/api/boards/${boardId}`)
      .then(res => res.ok ? res.json() : null)
      .then((b: Board | null) => {
        if (b) {
          setSelectedBoardForSend(b);
          setSendToGroupId(b.groups[0]?.id ?? '');
          setSendToAfterItemId('');
        }
      });
  };

  const handleSendToBoardSubmit = () => {
    if (!sendToBoardEvent || !selectedBoardForSend || !sendToGroupId) return;
    const group = selectedBoardForSend.groups.find(g => g.id === sendToGroupId);
    if (!group) return;
    let newPosition: number;
    if (sendToAfterItemId) {
      const afterItem = group.items.find(i => i.id === sendToAfterItemId);
      newPosition = afterItem ? afterItem.position + 512 : (group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024);
    } else {
      newPosition = group.items.length > 0 ? Math.min(...group.items.map(i => i.position)) - 512 : 1024;
      if (newPosition < 0) newPosition = group.items.reduce((max, i) => Math.max(max, i.position), 0) + 1024;
    }
    const firstDateCol = selectedBoardForSend.columns.find(c => c.type === 'date' || c.type === 'timeline');
    const eventDate = sendToBoardEvent.eventDate ? new Date(sendToBoardEvent.eventDate) : null;
    const initialColumnValues: { columnId: string; value: string }[] = [];
    if (firstDateCol && eventDate && !isNaN(eventDate.getTime())) {
      const y = eventDate.getFullYear();
      const m = String(eventDate.getMonth() + 1).padStart(2, '0');
      const d = String(eventDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (firstDateCol.type === 'date') {
        initialColumnValues.push({ columnId: firstDateCol.id, value: dateStr });
      } else {
        initialColumnValues.push({ columnId: firstDateCol.id, value: JSON.stringify({ start: dateStr, end: dateStr }) });
      }
    }
    setSendToSubmitting(true);
    socket.emit('add_item', {
      groupId: sendToGroupId,
      name: sendToBoardEvent.name,
      position: newPosition,
      initialColumnValues: initialColumnValues.length > 0 ? initialColumnValues : undefined,
    });
    setSendToBoardEvent(null);
    setSelectedBoardForSend(null);
    setSendToSubmitting(false);
  };

  const handleSubmitEvent = async () => {
    if (!addModalDate || !addModalEventType) return;
    const name = addModalName.trim() || (addModalEventType === 'pendiente' ? 'Pendiente' : 'Evento');
    setSubmitting(true);
    try {
      // Fecha en hora local del usuario (evitar que toISOString() cambie el día por UTC)
      const y = addModalDate.getFullYear();
      const m = String(addModalDate.getMonth() + 1).padStart(2, '0');
      const d = String(addModalDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const res = await apiFetch(`${API_BASE}/api/boards/${board.id}/calendar-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, eventType: addModalEventType, date: dateStr, time: addModalTime }),
      });
      if (res.ok) {
        const newEvent: CalendarEvent = await res.json();
        setCalendarEvents(prev => (prev.some(e => e.id === newEvent.id) ? prev : [...prev, newEvent]));
        setAddModalOpen(false);
        setAddModalDate(null);
        setAddModalStep('type');
        setAddModalEventType(null);
        setAddModalName('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveMonthDate = useMemo(() => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    return d;
  }, [viewDate]);

  const statusColumn = useMemo(
    () => board.columns.find(c => c.type === 'status'),
    [board.columns]
  );

  const colocacionColumn = useMemo(
    () =>
      board.columns.find(
        c =>
          (c.type === 'date' || c.type === 'timeline') &&
          /colocación|colocacion|fecha de colocación/i.test(c.title)
      ),
    [board.columns]
  );

  const productionColumn = useMemo(
    () =>
      board.columns.find(
        c =>
          (c.type === 'date' || c.type === 'timeline') &&
          /producción|produccion/i.test(c.title)
      ),
    [board.columns]
  );

  const tipoEventoColumn = useMemo(
    () => board.columns.find(c => c.type === 'text' && /tipo de evento|tipo evento/i.test(c.title)),
    [board.columns]
  );

  const firstDateOrTimelineColumn = useMemo(
    () => board.columns.find(c => c.type === 'date' || c.type === 'timeline'),
    [board.columns]
  );

  const itemsWithDates = useMemo(() => {
    const result: { item: Item; start: Date; end: Date; color: string }[] = [];
    const pushed = new Set<string>();
    const pushOnce = (item: Item, start: Date, end: Date, color: string) => {
      const key = `${item.id}-${start.getTime()}`;
      if (pushed.has(key)) return;
      pushed.add(key);
      result.push({ item, start, end, color });
    };
    const isTaller = !!isTallerView;

    board.groups.forEach(group => {
      group.items.forEach(item => {
        const statusLabel = getStatusLabel(item, statusColumn);
        const tipoEvento = getTipoEvento(item, tipoEventoColumn);
        const eventTypeColor = tipoEvento ? EVENT_TYPE_COLORS[tipoEvento] : null;

        const norm = (start: Date, end: Date | undefined) => {
          const e = end ? new Date(end) : new Date(start);
          if (e < start) e.setTime(start.getTime());
          return { start, end: e };
        };

        const pickColor = (defaultColor: string) => eventTypeColor ?? defaultColor;

        // Siempre: fechas de colocación
        const datesColocacion = getDatesFromColumn(item, colocacionColumn);
        if (datesColocacion) {
          const { start, end } = norm(datesColocacion.start, datesColocacion.end);
          pushOnce(item, start, end, pickColor('#00c875'));
        }

        const datesProduccion = getDatesFromColumn(item, productionColumn);
        const isTrabajandoEnEllo = statusLabel?.toLowerCase().trim() === 'trabajando en ello';

        // Vista Taller: mostrar siempre el periodo de producción si existe.
        // La tabla de TALLER ya viene filtrada solo a proyectos Aprobados, así que
        // no necesitamos volver a comprobar el estado aquí.
        if (isTaller) {
          if (datesProduccion) {
            const { start, end } = norm(datesProduccion.start, datesProduccion.end);
            pushOnce(item, start, end, pickColor('#fdab3d'));
          }
          return;
        }

        if (datesProduccion && !isTrabajandoEnEllo) {
          const { start, end } = norm(datesProduccion.start, datesProduccion.end);
          pushOnce(item, start, end, pickColor('#fdab3d'));
        }

        if (isTrabajandoEnEllo) {
          const datesDiseño = datesProduccion ?? datesColocacion;
          if (datesDiseño) {
            const { start, end } = norm(datesDiseño.start, datesDiseño.end);
            pushOnce(item, start, end, pickColor('#0073ea'));
          }
        }

        if (tipoEvento && eventTypeColor) {
          const datesFromAny = getDatesFromColumn(item, firstDateOrTimelineColumn);
          if (datesFromAny) {
            const { start, end } = norm(datesFromAny.start, datesFromAny.end);
            pushOnce(item, start, end, eventTypeColor);
          }
        }
      });
    });
    return result;
  }, [board.groups, board.columns, statusColumn, colocacionColumn, productionColumn, tipoEventoColumn, firstDateOrTimelineColumn, isTallerView]);

  const calendarOnlyBars = useMemo((): CalendarBarEntry[] => {
    const seen = new Set<string>();
    const isTaller = !!isTallerView;
    const bars: CalendarBarEntry[] = [];
    for (const ev of calendarEvents) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      // En vista Taller solo mostramos eventos de tipo "colocacion"
      if (isTaller && ev.eventType !== 'colocacion') continue;
      const d = ev.eventDate ? new Date(ev.eventDate) : null;
      if (!d || isNaN(d.getTime())) continue;
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const color = EVENT_TYPE_COLORS[ev.eventType] ?? '#888';
      bars.push({
        id: ev.id,
        name: ev.name,
        start,
        end: new Date(start),
        color,
        isCalendarOnly: true,
        calendarEvent: ev,
      });
    }
    return bars;
  }, [calendarEvents, isTallerView]);

  const allBars = useMemo((): CalendarBarEntry[] => {
    const fromItems = itemsWithDates.map(({ item, start, end, color }) => ({
      id: item.id,
      name: item.name,
      start,
      end,
      color,
      item,
      isCalendarOnly: false as const,
    }));
    return [...fromItems, ...calendarOnlyBars];
  }, [itemsWithDates, calendarOnlyBars]);

  const calendarLegend = useMemo(
    () => {
      const base = [
        { label: 'Colocación', color: '#00c875' },
        { label: 'Producción', color: '#fdab3d' },
      ];
      if (isTallerView) {
        // Taller: solo periodos de producción y colocaciones
        return base;
      }
      return [
        ...base,
        { label: 'Diseño', color: '#0073ea' },
        ...CALENDAR_EVENT_TYPES.map(t => ({ label: t.label, color: t.color })),
      ];
    },
    [isTallerView]
  );

  const year = effectiveMonthDate.getFullYear();
  const month = effectiveMonthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() - firstDayOfWeek);

  const weeks = useMemo(() => {
    const w: { date: Date; dayOfMonth: number; isCurrentMonth: boolean; key: string }[][] = [];
    for (let week = 0; week < 6; week++) {
      const row: { date: Date; dayOfMonth: number; isCurrentMonth: boolean; key: string }[] = [];
      for (let day = 0; day < 7; day++) {
        const cellDate = new Date(firstMonday);
        cellDate.setDate(firstMonday.getDate() + week * 7 + day);
        const isCurrentMonth = cellDate.getMonth() === month;
        row.push({
          date: cellDate,
          dayOfMonth: cellDate.getDate(),
          isCurrentMonth,
          key: `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`,
        });
      }
      w.push(row);
    }
    return w;
  }, [year, month, firstMonday]);

  const weekStart = useMemo(() => {
    const d = new Date(viewDate);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d;
  }, [viewDate]);

  const weekDays = useMemo(() => {
    const days: { date: Date; dayOfMonth: number; month: number; year: number; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push({
        date: d,
        dayOfMonth: d.getDate(),
        month: d.getMonth(),
        year: d.getFullYear(),
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      });
    }
    return days;
  }, [weekStart]);

  const itemsForDay = useMemo(() => {
    const d = viewDate;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return allBars.filter(({ start, end }) => {
      const startTs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
      const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() + 24 * 60 * 60 * 1000;
      return endTs > dayStart && startTs < dayEnd;
    });
  }, [allBars, viewDate]);

  const segmentsByWeek = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    return weeks.map((weekRows) => {
      const weekStart = weekRows[0].date;
      const weekStartTs = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime();
      const segments: { bar: CalendarBarEntry; startCol: number; endCol: number }[] = [];
      allBars.forEach((bar) => {
        const { start, end, color } = bar;
        const startTs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
        const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
        const weekEndTs = weekStartTs + 6 * dayMs;
        if (endTs < weekStartTs || startTs > weekEndTs) return;
        const startCol = Math.max(0, Math.round((startTs - weekStartTs) / dayMs));
        const endCol = Math.min(6, Math.round((endTs - weekStartTs) / dayMs));
        segments.push({ bar, startCol, endCol });
      });
      segments.sort((a, b) => a.startCol - b.startCol);
      const lanes: { startCol: number; endCol: number; bar: CalendarBarEntry }[][] = [];
      segments.forEach(seg => {
        let placed = false;
        for (let L = 0; L < lanes.length; L++) {
          const overlap = lanes[L].some(
            s => !(seg.endCol < s.startCol || seg.startCol > s.endCol)
          );
          if (!overlap) {
            lanes[L].push({ startCol: seg.startCol, endCol: seg.endCol, bar: seg.bar });
            placed = true;
            break;
          }
        }
        if (!placed) lanes.push([{ startCol: seg.startCol, endCol: seg.endCol, bar: seg.bar }]);
      });
      return lanes;
    });
  }, [weeks, allBars]);

  const goToToday = () => setViewDate(new Date());

  const datePickerDays = useMemo(() => {
    const y = datePickerMonth.getFullYear();
    const m = datePickerMonth.getMonth();
    const first = new Date(y, m, 1);
    const dow = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - dow);
    const days: { date: Date; key: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        isCurrentMonth: d.getMonth() === m,
      });
    }
    return days;
  }, [datePickerMonth]);

  const prev = () => {
    if (viewType === 'month') setViewDate(new Date(year, month - 1, 1));
    else setViewDate(new Date(viewDate.getTime() - (viewType === 'week' ? 7 : 1) * 24 * 60 * 60 * 1000));
  };

  const next = () => {
    if (viewType === 'month') setViewDate(new Date(year, month + 1, 1));
    else setViewDate(new Date(viewDate.getTime() + (viewType === 'week' ? 7 : 1) * 24 * 60 * 60 * 1000));
  };

  const titleText =
    viewType === 'month'
      ? `${MONTHS[month]} ${year}`
      : viewType === 'week'
        ? `${weekDays[0].dayOfMonth}–${weekDays[6].dayOfMonth} ${MONTHS[weekDays[6].month]} ${year}`
        : `${viewDate.getDate()} ${MONTHS[viewDate.getMonth()]} ${year}`;

  const today = new Date();
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Barra de navegación del calendario (estilo Monday); en móvil: áreas táctiles más grandes; landscape corto: más compacto */}
      <div className={`flex items-center justify-between border-b border-monday-border shrink-0 flex-wrap gap-2 ${
        isLandscapeShort ? 'px-2 py-1.5 gap-1' : isMobile ? 'px-3 py-2' : 'px-4 py-3'
      }`}>
        <div className={`flex items-center gap-1 sm:gap-2 ${isMobile ? 'gap-1' : ''}`}>
          <button
            onClick={goToToday}
            className={`rounded-monday border border-monday-border bg-white text-monday-text hover:bg-monday-hover transition-colors ${isMobile ? 'px-3 py-2.5 text-[13px] font-medium min-h-[44px]' : 'px-3 py-1.5 text-[13px] font-medium'}`}
          >
            Hoy
          </button>
          <button
            onClick={prev}
            className={`rounded-monday text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors ${isMobile ? 'p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center' : 'p-1.5'}`}
            aria-label="Anterior"
          >
            <ChevronLeft size={isMobile ? 22 : 20} />
          </button>
          <button
            onClick={next}
            className={`rounded-monday text-monday-subtext hover:bg-monday-hover hover:text-monday-text transition-colors ${isMobile ? 'p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center' : 'p-1.5'}`}
            aria-label="Siguiente"
          >
            <ChevronRight size={isMobile ? 22 : 20} />
          </button>
          <Popover.Root
            open={datePickerOpen}
            onOpenChange={(open) => {
              setDatePickerOpen(open);
              if (open) setDatePickerMonth(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
            }}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                className={`font-semibold text-monday-text text-center rounded-monday hover:bg-monday-hover transition-colors ${isMobile ? 'text-[14px] min-w-[140px] px-2 py-2 min-h-[44px]' : 'text-[15px] min-w-[160px] px-2 py-1'}`}
                title="Clic para elegir día o semana"
              >
                {titleText}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 bg-white rounded-xl shadow-monday-lg border border-monday-border p-4 w-auto"
                sideOffset={8}
                align="center"
              >
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={() => setDatePickerMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded hover:bg-monday-hover text-monday-subtext">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-[13px] font-semibold text-monday-text">
                    {MONTHS[datePickerMonth.getMonth()]} {datePickerMonth.getFullYear()}
                  </span>
                  <button type="button" onClick={() => setDatePickerMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded hover:bg-monday-hover text-monday-subtext">
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-[11px]">
                  {WEEKDAYS.map(w => (
                    <div key={w} className="text-monday-subtext font-semibold py-1 text-center">{w.slice(0, 1)}</div>
                  ))}
                  {datePickerDays.map(({ date, key, isCurrentMonth }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setViewDate(new Date(date));
                        setDatePickerOpen(false);
                      }}
                      className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                        !isCurrentMonth ? 'text-monday-subtext/50 hover:bg-monday-hover/50' :
                        isToday(date) ? 'bg-monday-blue text-white' : 'hover:bg-monday-hover text-monday-text'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <div className="relative">
            <button
              onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
              className={`flex items-center gap-1.5 rounded-monday border border-monday-border bg-white font-medium text-monday-text hover:bg-monday-hover transition-colors ${isMobile ? 'px-3 py-2.5 min-h-[44px] text-[13px]' : 'px-3 py-1.5 text-[13px]'}`}
            >
              {viewType === 'month' ? 'Mes' : viewType === 'week' ? 'Semana' : 'Día'}
              <ChevronDown size={14} className={`transition-transform ${viewDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {viewDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setViewDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-monday border border-monday-border shadow-monday-lg py-1 min-w-[100px]">
                  {(['month', 'week', 'day'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => {
                        setViewType(type);
                        setViewDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[13px] font-medium transition-colors ${
                        viewType === type ? 'bg-monday-blue text-white' : 'text-monday-text hover:bg-monday-hover'
                      }`}
                    >
                      {type === 'month' ? 'Mes' : type === 'week' ? 'Semana' : 'Día'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cuerpo del calendario — vista Mes / Semana / Día (estilo Monday); en móvil menos padding; landscape corto mínimo */}
      <div className={`flex-1 overflow-auto scroll-touch custom-scrollbar min-h-0 flex flex-col bg-monday-bg/30 ${
        isLandscapeShort ? 'p-2' : isMobile ? 'p-3' : 'p-4'
      }`}
           style={isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}>
        {viewType === 'day' && (
          <div className="rounded-xl border border-monday-border shadow-monday-sm bg-white overflow-hidden min-h-[280px]">
            <button
              type="button"
              onClick={() => openAddModal(viewDate)}
              className="w-full px-4 py-2.5 border-b border-monday-border bg-monday-hover/40 text-left hover:bg-monday-hover/60 transition-colors"
            >
              <p className="text-[13px] font-semibold text-monday-text">
                {WEEKDAYS[viewDate.getDay() === 0 ? 6 : viewDate.getDay() - 1]}. {viewDate.getDate()} {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </p>
            </button>
            <div className="p-3 flex flex-col gap-1.5">
              {itemsForDay.length === 0 ? (
                <p className="text-[12px] text-monday-subtext">Sin elementos este día</p>
              ) : (
                <>
                  {itemsForDay.slice(0, MAX_BARS_VISIBLE_IN_CELL).map((bar) => (
                    <button
                      key={bar.id}
                      type="button"
                      onClick={(e) => handleBarClick(bar, e)}
                      className={`text-left px-3 py-2 rounded text-white text-[12px] font-medium w-full transition-opacity hover:opacity-95 ${bar.isCalendarOnly ? 'cursor-pointer' : bar.item ? '' : 'cursor-default'}`}
                      style={{ backgroundColor: bar.color }}
                      title={bar.name}
                    >
                      {bar.name}
                    </button>
                  ))}
                  {itemsForDay.length > MAX_BARS_VISIBLE_IN_CELL && (
                    <Popover.Root open={morePopoverKey === 'day'} onOpenChange={(open) => !open && setMorePopoverKey(null)}>
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMorePopoverKey('day'); }}
                          className="text-[11px] text-monday-blue font-medium pt-0.5 hover:underline"
                        >
                          +{itemsForDay.length - MAX_BARS_VISIBLE_IN_CELL} más
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          className="bg-white rounded-lg border border-monday-border shadow-monday-lg p-3 z-[200] max-h-[280px] overflow-auto"
                          sideOffset={6}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-[12px] font-semibold text-monday-text mb-2">Todos los eventos del día</p>
                          <ul className="flex flex-col gap-1">
                            {itemsForDay.map((bar) => (
                              <li key={bar.id}>
                                <button
                                  type="button"
                                  onClick={(e) => handleBarClick(bar, e)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded text-white text-[12px] font-medium truncate ${bar.isCalendarOnly ? 'cursor-pointer hover:opacity-90' : bar.item ? 'hover:opacity-90' : 'cursor-default'}`}
                                  style={{ backgroundColor: bar.color }}
                                  title={bar.name}
                                >
                                  {bar.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {viewType === 'week' && (
          <div className="rounded-xl overflow-hidden border border-monday-border shadow-monday-sm bg-white flex-1 min-h-0 flex flex-col">
            {/* Vista semanal horizontal: 7 columnas (lun–dom), cabecera fija */}
            <div className="grid grid-cols-7 border-b border-monday-border shrink-0 bg-monday-pill/30">
              {weekDays.map((cell) => (
                <div
                  key={cell.key}
                  className={`px-2 py-3 text-center border-r border-monday-border last:border-r-0 ${
                    cell.month !== viewDate.getMonth() ? 'text-monday-subtext/70' : 'text-monday-text'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-monday-subtext uppercase">
                    {WEEKDAYS[cell.date.getDay() === 0 ? 6 : cell.date.getDay() - 1]}
                  </div>
                  <span
                    className={`inline-flex items-center justify-center mt-0.5 text-[15px] font-semibold w-8 h-8 rounded-full ${
                      isToday(cell.date) ? 'bg-monday-blue text-white' : 'text-monday-text'
                    }`}
                  >
                    {cell.dayOfMonth}
                  </span>
                  <div className="text-[11px] text-monday-subtext mt-0.5">{MONTHS[cell.month]}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 flex-1 min-h-[240px] overflow-auto custom-scrollbar">
              {weekDays.map(cell => {
                const dayStart = new Date(cell.year, cell.month, cell.date.getDate()).getTime();
                const dayEnd = dayStart + 24 * 60 * 60 * 1000;
                const dayItems = allBars.filter(({ start, end }) => {
                  const startTs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
                  const endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() + 24 * 60 * 60 * 1000;
                  return endTs > dayStart && startTs < dayEnd;
                });
                const visible = dayItems.slice(0, MAX_BARS_VISIBLE_IN_CELL);
                const rest = dayItems.length - visible.length;
                return (
                  <div
                    key={cell.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openAddModal(cell.date)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAddModal(cell.date); } }}
                    className={`p-2 flex flex-col gap-1.5 border-r border-monday-border last:border-r-0 cursor-pointer hover:bg-monday-hover/40 transition-colors touch-manipulation ${isMobile ? 'min-h-[200px]' : 'min-h-[160px]'} ${
                      cell.month !== viewDate.getMonth() ? 'bg-monday-bg/50' : 'bg-white'
                    }`}
                  >
                    {visible.map((bar) => (
                      <button
                        key={bar.id}
                        type="button"
                        onClick={(e) => handleBarClick(bar, e)}
                        className={`text-left px-2 rounded-md text-white text-[12px] font-medium truncate w-full transition-opacity hover:opacity-95 shadow-sm touch-manipulation ${isMobile ? 'py-2 min-h-[44px]' : 'py-1.5'} ${bar.isCalendarOnly ? 'cursor-pointer' : bar.item ? '' : 'cursor-default'}`}
                        style={{ backgroundColor: bar.color }}
                        title={bar.name}
                      >
                        {bar.name}
                      </button>
                    ))}
                    {rest > 0 && (
                      <Popover.Root open={morePopoverKey === cell.key} onOpenChange={(open) => !open && setMorePopoverKey(null)}>
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setMorePopoverKey(cell.key); }}
                            className={`text-[11px] text-monday-blue font-medium hover:underline mt-auto touch-manipulation ${isMobile ? 'min-h-[44px] py-2 pt-1' : 'pt-1'}`}
                          >
                            +{rest} más
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="bg-white rounded-lg border border-monday-border shadow-monday-lg p-3 z-[200] max-h-[280px] overflow-auto min-w-[200px] max-w-[min(320px,100vw-24px)]"
                            sideOffset={4}
                            side={isMobile ? 'top' : undefined}
                            align={isMobile ? 'center' : undefined}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-[12px] font-semibold text-monday-text mb-2">
                              {cell.dayOfMonth} {MONTHS[cell.month]} {cell.year}
                            </p>
                            <ul className="flex flex-col gap-1">
                              {dayItems.map((bar) => (
                                <li key={bar.id}>
                                  <button
                                    type="button"
                                    onClick={(e) => handleBarClick(bar, e)}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-white text-[12px] font-medium truncate ${bar.isCalendarOnly ? 'cursor-pointer hover:opacity-90' : bar.item ? 'hover:opacity-90' : 'cursor-default'}`}
                                    style={{ backgroundColor: bar.color }}
                                    title={bar.name}
                                  >
                                    {bar.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewType === 'month' && (
          <div className="rounded-lg overflow-hidden border border-monday-hover bg-white shadow-monday-sm flex flex-col min-h-[400px] flex-1">
            <div className="grid grid-cols-7 border-b border-monday-hover shrink-0">
              {WEEKDAYS.map(day => (
                <div
                  key={day}
                  className="bg-monday-hover/50 px-1.5 py-1.5 text-[10px] font-semibold text-monday-subtext uppercase tracking-wide border-r border-monday-hover last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              {weeks.map((weekRows, weekIndex) => {
                const lanes = segmentsByWeek[weekIndex] ?? [];
                const numLanes = Math.max(1, lanes.length);
                return (
                  <div
                    key={weekIndex}
                    className="grid flex-1 min-h-[80px] border-b border-monday-hover last:border-b-0"
                    style={{
                      gridTemplateColumns: 'repeat(7, 1fr)',
                      gridTemplateRows: `${DAY_ROW_H}px repeat(${numLanes}, ${LANE_H}px)`,
                    }}
                  >
                    {weekRows.map(cell => (
                      <div
                        key={cell.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => openAddModal(cell.date)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAddModal(cell.date); } }}
                        className={`p-1 flex flex-col border-r border-monday-hover last:border-r-0 cursor-pointer hover:bg-monday-hover/50 transition-colors ${
                          cell.isCurrentMonth ? 'bg-white' : 'bg-monday-bg/40'
                        }`}
                        style={{ gridRow: 1 }}
                      >
                        <span
                          className={`text-[12px] font-medium self-end ${
                            !cell.isCurrentMonth
                              ? 'text-monday-subtext/60'
                              : isToday(cell.date)
                                ? 'bg-monday-blue text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px]'
                                : 'text-monday-text'
                          }`}
                        >
                          {cell.dayOfMonth}
                        </span>
                      </div>
                    ))}
                    {lanes.map((lane, laneIdx) =>
                      lane.map(seg => (
                        <button
                          key={`${seg.bar.id}-${laneIdx}-${seg.startCol}`}
                          type="button"
                          onClick={(e) => handleBarClick(seg.bar, e)}
                          className={`text-left px-1.5 rounded text-white text-[10px] font-medium truncate border-0 min-w-0 hover:opacity-92 transition-opacity touch-manipulation ${isMobile ? 'py-1.5 min-h-[32px]' : 'py-0.5'} ${seg.bar.isCalendarOnly ? 'cursor-pointer' : seg.bar.item ? '' : 'cursor-default'}`}
                          style={{
                            backgroundColor: seg.bar.color,
                            gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                            gridRow: laneIdx + 2,
                            minHeight: isMobile ? 32 : LANE_H - 2,
                            boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                          }}
                          title={seg.bar.name}
                        >
                          <span className="block truncate">{seg.bar.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Leyenda inferior: Colocación (verde), Producción (amarillo), Diseño (azul) */}
      <div className="shrink-0 px-4 py-2 border-t border-monday-border flex items-center gap-4 flex-wrap bg-white">
        {calendarLegend.map(opt => (
          <div key={opt.label} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: opt.color }}
            />
            <span className="text-[12px] font-medium text-monday-subtext">{opt.label}</span>
          </div>
        ))}
      </div>

      {/* Modal Agregar evento en fecha */}
      <Dialog.Root open={addModalOpen} onOpenChange={(open) => { setAddModalOpen(open); if (!open) { setAddModalDate(null); setAddModalStep('type'); setAddModalEventType(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[200]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[360px] max-w-[90vw] z-[201]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-1">
              {addModalStep === 'type'
                ? (addModalDate ? `Agregar en ${formatDateForModal(addModalDate)}` : 'Agregar elemento')
                : addModalEventType
                  ? CALENDAR_EVENT_TYPES.find(t => t.id === addModalEventType)?.label
                  : 'Detalles'}
            </Dialog.Title>
            <Dialog.Description className="text-[13px] text-monday-subtext mb-4">
              {addModalStep === 'type'
                ? 'Elige el tipo de evento que se mostrará en el calendario.'
                : addModalEventType === 'pendiente'
                  ? 'Título y hora del evento.'
                  : 'Nombre y hora del evento.'}
            </Dialog.Description>

            {addModalStep === 'type' ? (
              <>
                <div className="flex flex-col gap-2">
                  {CALENDAR_EVENT_TYPES.map(({ id, label, color }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleChooseEventType(id)}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-[14px] font-medium text-white transition-opacity hover:opacity-95"
                      style={{ backgroundColor: color }}
                    >
                      <span className="w-3 h-3 rounded-full bg-white/30 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Dialog.Close asChild>
                    <button type="button" className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:text-monday-text hover:bg-monday-hover rounded-lg transition-colors">
                      Cancelar
                    </button>
                  </Dialog.Close>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <label className="block">
                    <span className="text-[12px] font-medium text-monday-subtext block mb-1">
                      {addModalEventType === 'pendiente' ? 'Título' : 'Nombre'}
                    </span>
                    <input
                      type="text"
                      value={addModalName}
                      onChange={(e) => setAddModalName(e.target.value)}
                      placeholder={addModalEventType === 'pendiente' ? 'Ej. Revisión pendiente' : 'Ej. Levantamiento obra X'}
                      className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-medium text-monday-subtext block mb-1">Hora</span>
                    <div className="flex gap-2">
                      <select
                        value={addModalTime.slice(0, 2)}
                        onChange={(e) => setAddModalTime(`${e.target.value}:${addModalTime.slice(3, 5)}`)}
                        className="flex-1 px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue bg-white text-monday-text"
                        aria-label="Hora"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i).padStart(2, '0')}>
                            {String(i).padStart(2, '0')} h
                          </option>
                        ))}
                      </select>
                      <select
                        value={addModalTime.slice(3, 5)}
                        onChange={(e) => setAddModalTime(`${addModalTime.slice(0, 2)}:${e.target.value}`)}
                        className="flex-1 px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue bg-white text-monday-text"
                        aria-label="Minutos"
                      >
                        {['00', '15', '30', '45'].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>
                <div className="mt-5 flex justify-between">
                  <button
                    type="button"
                    onClick={handleBackToType}
                    className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg transition-colors"
                  >
                    Atrás
                  </button>
                  <div className="flex gap-2">
                    <Dialog.Close asChild>
                      <button type="button" className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg transition-colors">
                        Cancelar
                      </button>
                    </Dialog.Close>
                    <button
                      type="button"
                      onClick={handleSubmitEvent}
                      disabled={submitting}
                      className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {submitting ? 'Creando…' : 'Crear evento'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Menú Editar/Eliminar y formulario de edición para eventos de calendario */}
      <Dialog.Root open={!!eventMenuEvent || !!editFormEvent} onOpenChange={(open) => { if (!open) { setEventMenuEvent(null); setEditFormEvent(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[202]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[320px] max-w-[90vw] z-[203]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {editFormEvent ? (
              <>
                <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-1">Editar evento</Dialog.Title>
                <Dialog.Description className="text-[13px] text-monday-subtext mb-4">
                  {CALENDAR_EVENT_TYPES.find(t => t.id === editFormEvent.eventType)?.label ?? editFormEvent.eventType}
                </Dialog.Description>
                <div className="flex flex-col gap-3">
                  <label className="block">
                    <span className="text-[12px] font-medium text-monday-subtext block mb-1">Nombre</span>
                    <input
                      type="text"
                      value={editFormName}
                      onChange={(e) => setEditFormName(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-medium text-monday-subtext block mb-1">Hora</span>
                    <div className="flex gap-2">
                      <select
                        value={editFormTime.slice(0, 2)}
                        onChange={(e) => setEditFormTime(`${e.target.value}:${editFormTime.slice(3, 5)}`)}
                        className="flex-1 px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue bg-white"
                        aria-label="Hora"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')} h</option>
                        ))}
                      </select>
                      <select
                        value={editFormTime.slice(3, 5)}
                        onChange={(e) => setEditFormTime(`${editFormTime.slice(0, 2)}:${e.target.value}`)}
                        className="flex-1 px-3 py-2 text-[13px] border border-monday-border rounded-lg outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue bg-white"
                        aria-label="Minutos"
                      >
                        {['00', '15', '30', '45'].map((m) => (
                          <option key={m} value={m}>{m} min</option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditFormEvent(null)}
                    className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleEditSubmit}
                    disabled={editSubmitting}
                    className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg disabled:opacity-60"
                  >
                    {editSubmitting ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : eventMenuEvent ? (
              <>
                <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-1">{eventMenuEvent.name}</Dialog.Title>
                <Dialog.Description className="text-[13px] text-monday-subtext mb-4">
                  {CALENDAR_EVENT_TYPES.find(t => t.id === eventMenuEvent.eventType)?.label ?? eventMenuEvent.eventType}
                </Dialog.Description>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(eventMenuEvent)}
                    className="w-full px-4 py-2.5 text-[13px] font-medium text-monday-text bg-monday-hover hover:bg-monday-hover/80 rounded-lg text-left transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => openSendToBoard(eventMenuEvent)}
                    className="w-full px-4 py-2.5 text-[13px] font-medium text-monday-text hover:bg-monday-hover rounded-lg text-left transition-colors flex items-center gap-2"
                  >
                    <Share2 size={14} className="shrink-0" />
                    Enviar a grupo o tablero
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(eventMenuEvent)}
                    className="w-full px-4 py-2.5 text-[13px] font-medium text-white bg-[#e2445c] hover:bg-[#c93a50] rounded-lg text-left transition-colors"
                  >
                    Eliminar
                  </button>
                  <Dialog.Close asChild>
                    <button type="button" className="w-full px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg">
                      Cancelar
                    </button>
                  </Dialog.Close>
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Enviar evento a grupo o tablero */}
      <Dialog.Root
        open={!!sendToBoardEvent}
        onOpenChange={(open) => {
          if (!open) {
            setSendToBoardEvent(null);
            setSelectedBoardForSend(null);
            setSendToGroupId('');
            setSendToAfterItemId('');
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[204]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-monday-xl border border-monday-border p-6 w-[380px] max-w-[90vw] z-[205]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Dialog.Title className="text-[16px] font-semibold text-monday-text mb-1">
              Enviar evento a grupo o tablero
            </Dialog.Title>
            <Dialog.Description className="text-[13px] text-monday-subtext mb-4">
              {sendToBoardEvent?.name} se creará como elemento en el tablero y grupo elegidos (con la fecha del evento).
            </Dialog.Description>

            {boardsList.length > 1 && (
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-monday-subtext mb-1">Tablero</label>
                <select
                  value={selectedBoardForSend?.id ?? ''}
                  onChange={(e) => onSelectBoardForSend(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                >
                  <option value="">Seleccionar tablero</option>
                  {boardsList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedBoardForSend && (
              <>
                <div className="mb-4">
                  <label className="block text-[12px] font-medium text-monday-subtext mb-1 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" style={{ backgroundColor: selectedBoardForSend.groups.find(g => g.id === sendToGroupId)?.color ?? '#c4c4c4' }} />
                    Grupo
                  </label>
                  <select
                    value={sendToGroupId}
                    onChange={(e) => { setSendToGroupId(e.target.value); setSendToAfterItemId(''); }}
                    className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                  >
                    {selectedBoardForSend.groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-[12px] font-medium text-monday-subtext mb-1">Insertar después de</label>
                  <select
                    value={sendToAfterItemId}
                    onChange={(e) => setSendToAfterItemId(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-monday-border rounded-lg bg-white text-monday-text outline-none focus:ring-2 focus:ring-monday-blue/30 focus:border-monday-blue"
                  >
                    <option value="">Al inicio del grupo</option>
                    {selectedBoardForSend.groups.find(g => g.id === sendToGroupId)?.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-monday-border">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2 text-[13px] font-medium text-monday-subtext hover:bg-monday-hover rounded-lg">
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleSendToBoardSubmit}
                disabled={sendToSubmitting || !selectedBoardForSend || !sendToGroupId}
                className="px-4 py-2 text-[13px] font-medium text-white bg-monday-blue hover:bg-monday-blue/90 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendToSubmitting ? 'Creando…' : 'Crear elemento en tablero'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default CalendarView;
