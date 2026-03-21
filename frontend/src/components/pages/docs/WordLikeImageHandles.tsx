import React from 'react';
import { RotateCw } from 'lucide-react';

export type WordImageHandleKind =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

/**
 * Marcos y controles estilo Word iOS: 8 puntos + tallo de rotación superior.
 */
export function WordLikeImageHandles({
  onHandlePointerDown,
}: {
  onHandlePointerDown: (kind: WordImageHandleKind, e: React.PointerEvent) => void;
}) {
  const corner =
    'absolute z-[35] w-3 h-3 rounded-full bg-white border-2 border-[#2b7fff] shadow-sm touch-none';
  const edge =
    'absolute z-[35] w-2.5 h-2.5 bg-white border border-zinc-500 shadow-sm touch-none';

  return (
    <>
      <button type="button" aria-label="esquina nw" className={`${corner} left-0 top-0 -translate-x-1/2 -translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('nw', e)} />
      <button type="button" aria-label="borde n" className={`${edge} left-1/2 top-0 -translate-x-1/2 -translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('n', e)} />
      <button type="button" aria-label="esquina ne" className={`${corner} right-0 top-0 translate-x-1/2 -translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('ne', e)} />
      <button type="button" aria-label="borde e" className={`${edge} right-0 top-1/2 translate-x-1/2 -translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('e', e)} />
      <button type="button" aria-label="esquina se" className={`${corner} right-0 bottom-0 translate-x-1/2 translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('se', e)} />
      <button type="button" aria-label="borde s" className={`${edge} left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('s', e)} />
      <button type="button" aria-label="esquina sw" className={`${corner} left-0 bottom-0 -translate-x-1/2 translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('sw', e)} />
      <button type="button" aria-label="borde w" className={`${edge} left-0 top-1/2 -translate-x-1/2 -translate-y-1/2`} onPointerDown={(e) => onHandlePointerDown('w', e)} />

      <div className="absolute left-1/2 -translate-x-1/2 bottom-full flex flex-col items-center z-[35] pointer-events-none pb-0.5">
        <div className="w-px h-7 bg-zinc-500 rounded-full pointer-events-none" aria-hidden />
        <button
          type="button"
          aria-label="Rotar"
          className="pointer-events-auto mt-0.5 w-8 h-8 rounded-full bg-white border-2 border-[#2b7fff] flex items-center justify-center shadow-md touch-none"
          onPointerDown={(e) => onHandlePointerDown('rotate', e)}
        >
          <RotateCw size={15} className="text-zinc-800" />
        </button>
      </div>
    </>
  );
}
