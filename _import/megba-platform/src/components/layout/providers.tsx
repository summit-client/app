"use client";

import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";

/** Client providers wrapper (toast now; auth/session/theme can join here). */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
