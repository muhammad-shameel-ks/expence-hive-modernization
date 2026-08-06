"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Network,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { AdminDepartment, AdminEmployee, AdminRole, FlowDraft } from "@/server/admin/ports";
import { FlowSection } from "./flow-section";
import { OrgSection } from "./org-section";
import { PeopleSection } from "./people-section";

type TabSection = "org" | "people" | "flows";

export function AdminSetup({
  people,
  flows,
  roles: initialRoles,
  departments: initialDepartments,
  operatorName,
}: {
  people: AdminEmployee[];
  flows: FlowDraft[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  operatorName: string;
}) {
  const [activeTab, setActiveTab] = useState<TabSection>("org");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rolesState, setRolesState] = useState(initialRoles);
  const [departmentsState, setDepartmentsState] = useState(initialDepartments);

  return (
    <main
      className="min-h-screen bg-[#f7f9fb] text-[#132035]"
      style={{ fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif" }}
    >
      {/* App Header with Top Navigation Tabs */}
      <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-6 border-b border-[#e1e7ee] bg-white/95 px-[clamp(22px,4vw,56px)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-[10px] border border-[#c8d5e2] bg-[#f2f7fa] text-[#205b91]">
            <Network className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <strong className="block text-[0.85rem] font-extrabold tracking-tight">
                ExpenseHive
              </strong>
              <span className="rounded-md bg-[#eef5f9] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#175d75]">
                Admin
              </span>
            </div>
            <span className="mt-px block text-[0.6rem] font-bold uppercase leading-none tracking-[0.13em] text-[#8a96a8]">
              Administration Portal
            </span>
          </div>
        </div>

        {/* Horizontal Navigation Tabs */}
        <nav className="hidden items-center gap-1.5 sm:flex" aria-label="Administration Sub-navigation">
          <button
            onClick={() => setActiveTab("org")}
            className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === "org"
                ? "bg-[#196d86] text-white shadow-xs"
                : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
            }`}
          >
            <Building2 className="size-3.5" />
            Departments & Roles
            <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[0.62rem] font-bold ${
              activeTab === "org" ? "bg-white/20 text-white" : "bg-[#e2e8f0] text-[#475569]"
            }`}>
              {departmentsState.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("people")}
            className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === "people"
                ? "bg-[#196d86] text-white shadow-xs"
                : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
            }`}
          >
            <Users className="size-3.5" />
            People & Allocations
            <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[0.62rem] font-bold ${
              activeTab === "people" ? "bg-white/20 text-white" : "bg-[#e2e8f0] text-[#475569]"
            }`}>
              {people.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("flows")}
            className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === "flows"
                ? "bg-[#196d86] text-white shadow-xs"
                : "text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]"
            }`}
          >
            <Workflow className="size-3.5" />
            Approval Flows
            <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[0.62rem] font-bold ${
              activeTab === "flows" ? "bg-white/20 text-white" : "bg-[#e2e8f0] text-[#475569]"
            }`}>
              {flows.length}
            </span>
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold text-[#526278] sm:inline">
            {operatorName}
          </span>
          <span className="grid size-[30px] place-items-center rounded-full border border-[#c9d8e4] bg-[#eef5f9] text-[0.8rem] font-extrabold text-[#175d75]">
            {operatorName.charAt(0)}
          </span>
        </div>
      </header>

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
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e1e7ee] bg-white p-5 shadow-[0_12px_32px_rgba(31,50,71,0.04)]">
          <div>
            <h1 className="text-xl font-bold text-[#17273d]">
              {activeTab === "org"
                ? "Departments & Roles Management"
                : activeTab === "people"
                  ? "People, Departments & Role Allocations"
                  : "Approval Flow Pipelines"}
            </h1>
            <p className="mt-0.5 text-xs text-[#7d8a9b]">
              {activeTab === "org"
                ? "Create company departments and define department-scoped roles."
                : activeTab === "people"
                  ? "Allocate team members to departments and assign administrative or approval roles."
                  : "Design, build, and publish multi-stage expense approval workflows."}
            </p>
          </div>

          {/* Mobile Tab Switcher */}
          <div className="flex items-center gap-1 sm:hidden">
            <button
              onClick={() => setActiveTab("org")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                activeTab === "org" ? "bg-[#196d86] text-white" : "bg-[#f1f5f9] text-[#475569]"
              }`}
            >
              Depts
            </button>
            <button
              onClick={() => setActiveTab("people")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                activeTab === "people" ? "bg-[#196d86] text-white" : "bg-[#f1f5f9] text-[#475569]"
              }`}
            >
              People
            </button>
            <button
              onClick={() => setActiveTab("flows")}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                activeTab === "flows" ? "bg-[#196d86] text-white" : "bg-[#f1f5f9] text-[#475569]"
              }`}
            >
              Flows
            </button>
          </div>
        </div>

        {/* Tab View Panels */}
        {activeTab === "org" ? (
          <OrgSection
            departments={departmentsState}
            roles={rolesState}
            onMessage={setMessage}
            onError={setError}
            onDepartmentsChange={setDepartmentsState}
            onRolesChange={setRolesState}
          />
        ) : activeTab === "people" ? (
          <PeopleSection
            people={people}
            roles={rolesState}
            departments={departmentsState}
            onMessage={setMessage}
            onError={setError}
          />
        ) : (
          <FlowSection
            flows={flows}
            roles={rolesState}
            departments={departmentsState}
            onMessage={setMessage}
            onError={setError}
          />
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
    </main>
  );
}
