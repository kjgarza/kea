"use client";

import { motion } from "framer-motion";

interface Props {
  children: React.ReactNode;
}

/** Centred 3:4 slot the current card is rendered into. */
export function CardStage({ children }: Props) {
  return (
    <div className="flex items-center justify-center p-4 min-h-0 overflow-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg aspect-[3/4] max-h-[calc(100vh-200px)]"
      >
        {children}
      </motion.div>
    </div>
  );
}
