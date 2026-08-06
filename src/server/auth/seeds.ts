import type { Employee } from "./ports";

// Plain display names with no role embedded: the role lives on the
// assignment, not in the employee name.
export const seededEmployees: readonly Employee[] = [
  { id: "emp-superadmin", email: "superadmin@hive.local", name: "Super Admin" },
  { id: "emp-shameel", email: "muhammadshameelks@hive.local", name: "Muhammad Shameel" },
  { id: "emp-katherine", email: "katherine@hive.local", name: "Katherine Johnson" },
  { id: "emp-ada", email: "ada@hive.local", name: "Ada Lovelace" },
  { id: "emp-sanil", email: "sanil@hive.local", name: "Sanil Davis" },
  { id: "emp-arun", email: "arun@hive.local", name: "Arun Kumar" },
  { id: "emp-dorothy", email: "dorothy@hive.local", name: "Dorothy Vaughan" },
  { id: "emp-abilash", email: "abilash@hive.local", name: "Abilash" },
  { id: "emp-intern", email: "ananya@hive.local", name: "Ananya Iyer" },
  { id: "emp-pramod", email: "pramod@hive.local", name: "Pramod" },
  { id: "emp-finance", email: "finance@hive.local", name: "Rishikesh" },
  { id: "emp-rishikesh", email: "rishikesh@hive.local", name: "Farhan" },
];
