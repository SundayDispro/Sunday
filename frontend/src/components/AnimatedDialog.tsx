import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';

const DURATION = 0.2;
const EASE = [0.22, 1, 0.36, 1] as const;

interface AnimatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: [React.ReactElement<typeof Dialog.Overlay>, React.ReactElement<typeof Dialog.Content>];
}

/**
 * Dialog con animación de entrada y salida. Retrasa el cierre hasta que termine la salida.
 * children: [<Dialog.Overlay ... />, <Dialog.Content ... />]
 */
export function AnimatedDialog({ open, onOpenChange, children }: AnimatedDialogProps) {
  const [isClosing, setIsClosing] = useState(false);
  const radixOpen = open || isClosing;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setIsClosing(true);
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  };

  const handleExitComplete = () => {
    setIsClosing(false);
  };

  const [overlay, content] = React.Children.toArray(children) as [React.ReactElement, React.ReactElement];

  return (
    <Dialog.Root open={radixOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {/* Capa inferior: fondo oscuro (por debajo del contenido). */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isClosing ? { opacity: 0 } : { opacity: 1 }}
          transition={{ duration: DURATION, ease: EASE }}
          className="fixed inset-0 z-[300]"
        >
          {overlay}
        </motion.div>
        {/* Capa superior: el panel recibe clics; el resto deja pasar al overlay (Radix cierra al pulsar fuera). */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isClosing ? { opacity: 0 } : { opacity: 1 }}
          transition={{ duration: DURATION, ease: EASE }}
          className="fixed inset-0 z-[301] flex items-center justify-center pointer-events-none"
          onAnimationComplete={() => {
            if (isClosing) handleExitComplete();
          }}
        >
          <div className="pointer-events-auto">{content}</div>
        </motion.div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
