import type { Employee } from "./ports";

export const seededEmployees: readonly Employee[] = [
  { id: "emp-ada", email: "ada@hive.local", name: "Ada Lovelace / Manager (Engineering)" },
  { id: "emp-grace", email: "grace@hive.local", name: "Grace Hopper / HR Admin" },
  { id: "emp-katherine", email: "katherine@hive.local", name: "Katherine Johnson / Employee (Engineering)" },
  { id: "emp-dorothy", email: "dorothy@hive.local", name: "Dorothy Vaughan / Finance" },
  { id: "emp-superadmin", email: "superadmin@hive.local", name: "Super Admin / Superadmin" },
  { id: "emp-finance", email: "finance@hive.local", name: "Finance Officer / Finance" },
  { id: "emp-it", email: "it@hive.local", name: "IT Head / IT Reviewer" },
  { id: "emp-shameel", email: "muhammadshameelks@hive.local", name: "Muhammad Shameel / Employee (Engineering)" },
  { id: "emp-abilash", email: "abilash@hive.local", name: "Abilash / Team Lead (IT)" },
  { id: "emp-sanil", email: "sanil@hive.local", name: "Sanil Davis / Manager (IT)" },
  { id: "emp-arun", email: "arun@hive.local", name: "Arun Kumar / Manager (IT)" },
  { id: "emp-pramod", email: "pramod@hive.local", name: "Pramod / Finance Head (IT)" },
  { id: "emp-rishikesh", email: "rishikesh@hive.local", name: "Rishikesh / Finance Reviewer (IT)" },
];