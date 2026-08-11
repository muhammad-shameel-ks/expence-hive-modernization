"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  PauseCircle,
  ScrollText,
  Settings,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { AdminDepartment, AdminEmployee, AdminRole, FlowDraft } from "@/server/admin/ports";
import type { HeldClaimRow } from "@/server/expenses/ports";
import { AuditSection } from "./audit-section";
import { FlowSection } from "./flow-section";
import { HeldSection } from "./held-section";
import { OrgSection } from "./org-section";
import { PeopleSection } from "./people-section";
import { SettingsSection } from "./settings-section";

type TabSection = "org" | "people" | "flows" | "audit" | "settings" | "holds";

export function AdminSetup({
  people,
  flows,
  roles: initialRoles,
  departments: initialDepartments,
  currentEmployeeId,
  absenceTimeoutDays,
  heldClaims,
}: {
  people: AdminEmployee[];
  flows: FlowDraft[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  currentEmployeeId: string;
  absenceTimeoutDays: number;
  heldClaims: HeldClaimRow[];
}) {
  const [activeTab, setActiveTab] = useState<TabSection>("org");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rolesState, setRolesState] = useState(initialRoles);
  const [departmentsState, setDepartmentsState] = useState(initialDepartments);
  const [peopleState, setPeopleState] = useState(people);

  return (
    <>
      {/* Section Navigation Tabs */}
      <nav
        className="sticky top-[var(--app-header-height)] z-[5] flex items-center gap-1.5 overflow-x-auto border-b border-[#e1e7ee] bg-white/95 px-[clamp(22px,4vw,56px)] py-2.5 backdrop-blur-md"
        aria-label="Administration sub-navigation"
      >
        <button
          onClick={() => setActiveTab("org")}
          aria-current={activeTab === "org" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "org"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <Building2 className="size-3.5" />
          <span className="sm:hidden">Depts</span>
          <span className="hidden sm:inline">Departments &amp; Roles</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold ${
            activeTab === "org" ? "bg-[#d9e8ef] text-[#175d75]" : "bg-[#e2e8f0] text-[#475569]"
          }`}>
            {departmentsState.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("people")}
          aria-current={activeTab === "people" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "people"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <Users className="size-3.5" />
          <span className="sm:hidden">People</span>
          <span className="hidden sm:inline">People</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold ${
            activeTab === "people" ? "bg-[#d9e8ef] text-[#175d75]" : "bg-[#e2e8f0] text-[#475569]"
          }`}>
            {people.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("flows")}
          aria-current={activeTab === "flows" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "flows"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <Workflow className="size-3.5" />
          <span className="sm:hidden">Flows</span>
          <span className="hidden sm:inline">Approval Flows</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold ${
            activeTab === "flows" ? "bg-[#d9e8ef] text-[#175d75]" : "bg-[#e2e8f0] text-[#475569]"
          }`}>
            {flows.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          aria-current={activeTab === "audit" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "audit"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <ScrollText className="size-3.5" />
          <span className="sm:hidden">Audit</span>
          <span className="hidden sm:inline">Audit Log</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          aria-current={activeTab === "settings" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "settings"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <Settings className="size-3.5" />
          <span className="sm:hidden">Settings</span>
          <span className="hidden sm:inline">Company Settings</span>
        </button>

        <button
          onClick={() => setActiveTab("holds")}
          aria-current={activeTab === "holds" ? "page" : undefined}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "holds"
              ? "bg-[#e8f2f6] text-[#175d75]"
              : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
          }`}
        >
          <PauseCircle className="size-3.5" />
          <span className="sm:hidden">Holds</span>
          <span className="hidden sm:inline">Held Claims</span>
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold ${
            activeTab === "holds" ? "bg-[#d9e8ef] text-[#175d75]" : "bg-[#e2e8f0] text-[#475569]"
          }`}>
            {heldClaims.length}
          </span>
        </button>
      </nav>

      {/* Main Content Area */}
      <div className="mx-auto w-[min(100%_-_44px,1180px)] py-8 pb-28">

        {/* Global Error Banner */}
        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#e8c4cb] bg-[#fdf0f2] px-4 py-3 text-sm font-medium text-[#a8384d]" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Module Header Card */}
        <div className="mb-6 rounded-2xl border border-[#e1e7ee] bg-white p-5 shadow-[0_12px_32px_rgba(31,50,71,0.04)]">
          <h1 className="text-xl font-bold text-[#17273d]">
            {activeTab === "org"
              ? "Departments & Roles Management"
              : activeTab === "people"
                ? "People Management"
                : activeTab === "flows"
                  ? "Approval Flow Pipelines"
                  : activeTab === "audit"
                    ? "Audit Log"
                    : activeTab === "settings"
                      ? "Company Settings"
                      : "Held Claims Oversight"}
          </h1>
          <p className="mt-0.5 text-xs text-[#7d8a9b]">
            {activeTab === "org"
              ? "Create company departments and define department-scoped roles."
              : activeTab === "people"
                ? "Search people, assign roles, departments and managers, and manage active access."
                : activeTab === "flows"
                  ? "Design, build, and publish multi-stage expense approval workflows."
                  : activeTab === "audit"
                    ? "Review the chronological trail of administrative changes."
                    : activeTab === "settings"
                      ? "Configure company-wide approval behavior."
                      : "Review claims paused by their current stage actor."}
          </p>
        </div>

        {/* Tab View Panels */}
        {activeTab === "org" ? (
          <OrgSection
            departments={departmentsState}
            roles={rolesState}
            people={peopleState}
            onMessage={setMessage}
            onError={setError}
            onDepartmentsChange={setDepartmentsState}
            onRolesChange={setRolesState}
          />
        ) : activeTab === "people" ? (
          <PeopleSection
            people={peopleState}
            roles={rolesState}
            departments={departmentsState}
            currentEmployeeId={currentEmployeeId}
            onMessage={setMessage}
            onError={setError}
            onPeopleChange={setPeopleState}
            onDepartmentsChange={setDepartmentsState}
          />
        ) : activeTab === "flows" ? (
          <FlowSection
            flows={flows}
            roles={rolesState}
            departments={departmentsState}
            onMessage={setMessage}
            onError={setError}
          />
        ) : activeTab === "audit" ? (
          <AuditSection people={peopleState} onError={setError} />
        ) : activeTab === "settings" ? (
          <SettingsSection
            absenceTimeoutDays={absenceTimeoutDays}
            onMessage={setMessage}
            onError={setError}
          />
        ) : (
          <HeldSection heldClaims={heldClaims} />
        )}
      </div>

      {/* Floating Status Notification Toast */}
      {message ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#c4e2dc] bg-white px-4 py-3 text-xs font-semibold text-[#23706b] shadow-[0_12px_30px_rgba(31,50,71,0.14)]" role="status">
          <CheckCircle2 className="size-4" />
          {message}
          <button aria-label="Dismiss message" className="text-[#8a96a8] hover:text-[#33445c]" onClick={() => setMessage("")}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </>
  );
}
