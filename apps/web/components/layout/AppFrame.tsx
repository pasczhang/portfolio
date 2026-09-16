"use client";

import type { ReactNode } from "react";
import { DeskProvider } from "@/components/layout/DeskProvider";
import { BookProvider } from "@/components/layout/BookProvider";
import { GlobalHeader } from "@/components/layout/GlobalHeader";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <BookProvider>
        <div className="min-h-screen bg-background text-foreground">
          <GlobalHeader />
          {children}
        </div>
      </BookProvider>
    </DeskProvider>
  );
}
