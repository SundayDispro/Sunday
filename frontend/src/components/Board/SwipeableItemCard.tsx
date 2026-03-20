import React, { useState } from 'react';
import { motion, useAnimation, PanInfo, useDragControls } from 'framer-motion';
import { CheckCircle2, Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onDelete?: () => void;
  onComplete?: () => void;
  leftActionText?: string;
  rightActionText?: string;
  leftActionColor?: string;
  rightActionColor?: string;
}

export const SwipeableItemCard: React.FC<Props> = ({
  children,
  onDelete,
  onComplete,
  leftActionText = 'Listo',
  rightActionText = 'Eliminar',
  leftActionColor = 'bg-green-500',
  rightActionColor = 'bg-red-500',
}) => {
  const controls = useAnimation();
  const dragControls = useDragControls();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const swipeThreshold = 80;

  const handlePointerDown = (e: React.PointerEvent) => {
    // Gestión Inteligente de Gestos:
    // Evitar choques con el SO estableciendo un umbral de 20px en los bordes.
    const x = e.clientX;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 500;
    const isNearEdge = x < 20 || windowWidth - x < 20;
    
    if (!isNearEdge) {
      dragControls.start(e);
    }
  };

  const handleDragEnd = async (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset > swipeThreshold || velocity > 500) {
      // Swiped right (Complete action)
      if (onComplete) {
        if (navigator.vibrate) navigator.vibrate(20);
        setIsCompleting(true);
        await controls.start({ x: '100%', transition: { duration: 0.2 } });
        onComplete();
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 480, damping: 36 } });
      }
    } else if (offset < -swipeThreshold || velocity < -500) {
      // Swiped left (Delete action)
      if (onDelete) {
        if (navigator.vibrate) navigator.vibrate(25); // Pulso único dentro del rango nativo
        setIsDeleting(true);
        await controls.start({ x: '-100%', transition: { duration: 0.2 } });
        onDelete();
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 480, damping: 36 } });
      }
    } else {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 480, damping: 36 } });
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Background Actions */}
      <div className="absolute inset-0 flex">
        <div className={`w-1/2 flex items-center justify-start px-4 ${leftActionColor} text-white`}>
          <div className={`flex items-center gap-2 font-medium ${isCompleting ? 'opacity-100' : 'opacity-80'}`}>
            <CheckCircle2 size={20} />
            <span className="text-[13px]">{leftActionText}</span>
          </div>
        </div>
        <div className={`w-1/2 flex items-center justify-end px-4 ${rightActionColor} text-white`}>
          <div className={`flex items-center gap-2 font-medium ${isDeleting ? 'opacity-100' : 'opacity-80'}`}>
            <span className="text-[13px]">{rightActionText}</span>
            <Trash2 size={20} />
          </div>
        </div>
      </div>

      {/* Draggable Card */}
      <motion.div
        drag="x"
        dragControls={dragControls}
        dragListener={false}
        onPointerDown={handlePointerDown}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 bg-[var(--monday-surface)] w-full h-full shadow-monday-sm rounded-lg"
        style={{ touchAction: 'pan-y', willChange: 'transform' }}
      >
        {children}
      </motion.div>
    </div>
  );
};
