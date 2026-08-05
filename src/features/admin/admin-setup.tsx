"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Network, Users, Workflow, X } from "lucide-react";
import type { AdminDepartment, AdminEmployee, AdminRole, FlowDraft } from "@/server/admin/ports";
import { FlowSection } from "./flow-section";
import { OrgSection } from "./org-section";
import { PeopleSection } from "./people-section";

export function AdminSetup({
  people,
  flows,
  roles,
  departments,
  operatorName,
}: {
  people: AdminEmployee[];
  flows: FlowDraft[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  operatorName: string;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rolesState, setRolesState] = useState(roles);
  const [departmentsState, setDepartmentsState] = useState(departments);

  return (
    <main
      className="min-h-screen bg-[#f7f9fb] text-[#132035]"
      style={{ fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif" }}
    >
      <header className="sticky top-0 z-10 flex min-h-[72px] items-center justify-between gap-6 border-b border-[#e1e7ee] bg-white/95 px-[clamp(22px,4vw,56px)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[10px] border border-[#c8d5e2] bg-[#f2f7fa] text-[#205b91]">
            <Network className="size-5" />
          </span>
          <span>
            <strong className="block text-[0.85rem] font-extrabold tracking-tight">
              ExpenseHive
            </strong>
            <span className="mt-px block text-[0.56rem] font-bold uppercase leading-none tracking-[0.13em] text-[#8a96a8]">
              administration
            </span>
          </span>
        </div>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Administration">
          <a className="rounded-[9px] bg-[#e8f2f6] px-[13px] py-2 text-[0.76rem] font-semibold text-[#175d75]" href="#people">
            <Users className="mr-1.5 inline size-3.5" />
            People
          </a>
          <a className="rounded-[9px] px-[13px] py-2 text-[0.76rem] font-semibold text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]" href="#flow">
            <Workflow className="mr-1.5 inline size-3.5" />
            Flows
          </a>
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

      <div className="mx-auto w-[min(100%_-_44px,960px)] py-[clamp(48px,8vh,84px)] pb-28 max-[600px]:w-[min(100%_-_40px,520px)] max-[600px]:py-12">
        <div>
          <p className="m-0 text-[0.63rem] font-extrabold uppercase leading-[1.4] tracking-[0.18em] text-[#2e7fa4]">
            Admin setup
          </p>
          <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.4rem)] font-bold leading-none tracking-[-0.045em] text-[#17273d]">
            People and flows
          </h1>
          <p className="mt-3.5 max-w-2xl text-[0.95rem] text-[#7d8a9b]">
            Assign the right administration role to each person, then use those roles to build an approval flow.
          </p>
        </div>

        {error ? (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-[#e8c4cb] bg-[#fdf0f2] px-4 py-3 text-sm font-medium text-[#a8384d]" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <OrgSection
          departments={departmentsState}
          roles={rolesState}
          onMessage={setMessage}
          onError={setError}
          onDepartmentsChange={setDepartmentsState}
          onRolesChange={setRolesState}
        />
        <PeopleSection people={people} roles={rolesState} onMessage={setMessage} onError={setError} />
        <FlowSection flows={flows} roles={rolesState} onMessage={setMessage} onError={setError} />
      </div>

      {message ? (
        <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#c4e2dc] bg-white px-4 py-3 text-xs font-semibold text-[#23706b] shadow-[0_12px_30px_rgba(31,50,71,0.14)]" role="status">
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
