"use client";

import type { ReactNode } from "react";
import { DeskProvider } from "@/components/layout/DeskProvider";
import { GlobalHeader } from "@/components/layout/GlobalHeader";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <div className="min-h-screen bg-background text-foreground">
        <GlobalHeader />
        {children}
      </div>
    </DeskProvider>
  );
}
