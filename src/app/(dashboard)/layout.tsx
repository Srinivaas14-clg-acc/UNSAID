"use client";

import { useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { CreateSessionWizard } from "@/components/wizard/CreateSessionWizard";

/**
 * Dashboard shell — applies the organiser Sidebar to every route under the
 * (dashboard) route group. Deliberately scoped to this group via Next.js App
 * Router route groups, not a client-side conditional in the root layout, so
 * the participant flow (/s/[code]/*) is structurally outside this tree and
 * can never render organiser-shell chrome (frontend-lead brief constraint).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden md:flex-row">
      <Sidebar onNewSession={() => setWizardOpen(true)} />
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      {wizardOpen && (
        <CreateSessionWizard onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
