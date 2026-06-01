"use client";

import * as React from "react";
import { Suspense } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { GlobalLoader } from "@/components/ui/global-loader";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      <Suspense fallback={null}>
        <GlobalLoader />
      </Suspense>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "glass-panel border-border",
          },
        }}
      />
    </NextThemesProvider>
  );
}
