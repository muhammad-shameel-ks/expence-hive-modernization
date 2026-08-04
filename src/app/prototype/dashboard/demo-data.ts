// PROTOTYPE — throwaway demo data for the dashboard prototype.
// This file is not production domain data; wipe the whole
// src/app/prototype directory when the winning variant is folded in.

export type Kind = "permission" | "reimbursement";

export type StatusKey =
  | "needs-my-action"
  | "in-approval"
  | "needs-correction"
  | "taken-over"
  | "overrun"
  | "approved-and-paid";

export type RequestItem = {
  id: string;
  kind: Kind;
  title: string;
  amount: string;
  category: string;
  status: StatusKey;
  stage: string;
  owner: string;
  nextAction: string;
  blockingReason?: string;
  requester: string;
  submittedOn: string;
  due?: string;
  urgent?: boolean;
  isMine: boolean;
  policyNote?: string;
  linkedPermission?: string;
  receiptCount?: number;
};

export type HistoryEvent = {
  when: string;
  actor: string;
  authority: string;
  action: string;
  request: string;
};

export const CURRENT_USER = {
  name: "Ada Lovelace",
  initials: "A",
  role: "Engineer · IT Head approval pool",
};

export const STATUS_META: Record<
  StatusKey,
  { label: string; short: string }
> = {
  "needs-my-action": { label: "Needs my action", short: "Decide" },
  "in-approval": { label: "In approval", short: "Waiting" },
  "needs-correction": { label: "Needs correction", short: "Fix it" },
  "taken-over": { label: "Taken over", short: "Skipped" },
  overrun: { label: "Amount overrun", short: "Overrun" },
  "approved-and-paid": { label: "Approved and paid", short: "Paid" },
};

export const ITEMS: RequestItem[] = [
  {
    id: "PR-1203",
    kind: "permission",
    title: "New laptop – ThinkPad T14s",
    amount: "$1,850.00",
    category: "Hardware",
    status: "in-approval",
    stage: "IT Head approval",
    owner: "Grace Hopper",
    nextAction: "Waiting on IT Head",
    requester: "Ada Lovelace",
    submittedOn: "2 days ago",
    isMine: true,
  },
  {
    id: "EXP-0987",
    kind: "reimbursement",
    title: "Hotel – Lisbon client summit",
    amount: "$1,240.00",
    category: "Travel",
    status: "needs-correction",
    stage: "Finance verification",
    owner: "Katherine Johnson",
    nextAction: "Upload receipt and resubmit",
    blockingReason: "Receipt for night 3 is unreadable",
    requester: "Ada Lovelace",
    submittedOn: "5 days ago",
    urgent: true,
    isMine: true,
    receiptCount: 2,
  },
  {
    id: "EXP-0952",
    kind: "reimbursement",
    title: "Airfare – Munich to Berlin",
    amount: "$318.00",
    category: "Travel",
    status: "taken-over",
    stage: "Finance verification",
    owner: "CEO",
    nextAction: "Waiting on Finance verification",
    requester: "Ada Lovelace",
    submittedOn: "6 days ago",
    isMine: true,
  },
  {
    id: "EXP-0901",
    kind: "reimbursement",
    title: "Team lunch – Q3 offsite",
    amount: "$214.00",
    category: "Meals",
    status: "approved-and-paid",
    stage: "Paid",
    owner: "Katherine Johnson",
    nextAction: "Nothing – settled",
    requester: "Ada Lovelace",
    submittedOn: "Jul 24",
    isMine: true,
  },
  {
    id: "EXP-1033",
    kind: "reimbursement",
    title: "AWS credits overrun",
    amount: "$4,120.00",
    category: "Software",
    status: "overrun",
    stage: "Supplemental approval",
    owner: "Dorothy Vaughan",
    nextAction: "Waiting on overrun approval",
    blockingReason: "Amount is $420 above approved permission PR-1175",
    linkedPermission: "PR-1175",
    requester: "Ada Lovelace",
    submittedOn: "3 days ago",
    isMine: true,
  },
  {
    id: "PR-1211",
    kind: "permission",
    title: "Conference tickets – DevCon 2026",
    amount: "$1,900.00",
    category: "Training",
    status: "in-approval",
    stage: "Reporting Head approval",
    owner: "Dorothy Vaughan",
    nextAction: "Waiting on Reporting Head",
    requester: "Ada Lovelace",
    submittedOn: "1 day ago",
    isMine: true,
  },
  {
    id: "EXP-1041",
    kind: "reimbursement",
    title: "Marketing swag – brand refresh",
    amount: "$2,340.00",
    category: "Marketing",
    status: "needs-my-action",
    stage: "IT Head approval",
    owner: "Ada Lovelace",
    nextAction: "Review and decide",
    requester: "Grace Hopper",
    submittedOn: "2 days ago",
    due: "Due today",
    urgent: true,
    isMine: false,
    policyNote: "Under department budget. Linked permission PR-208 approved.",
    linkedPermission: "PR-208",
    receiptCount: 3,
  },
  {
    id: "PR-1215",
    kind: "permission",
    title: "Second monitor + docking station",
    amount: "$640.00",
    category: "Hardware",
    status: "needs-my-action",
    stage: "IT Head approval",
    owner: "Ada Lovelace",
    nextAction: "Review and decide",
    requester: "Muhammad Shameel",
    submittedOn: "1 day ago",
    isMine: false,
  },
  {
    id: "EXP-1050",
    kind: "reimbursement",
    title: "Conference trip – Barcelona",
    amount: "$3,150.00",
    category: "Training",
    status: "in-approval",
    stage: "CEO approval",
    owner: "CEO",
    nextAction: "Waiting on CEO",
    requester: "Katherine Johnson",
    submittedOn: "Today",
    isMine: false,
  },
  {
    id: "EXP-0871",
    kind: "reimbursement",
    title: "Office supplies – Q2",
    amount: "$182.00",
    category: "Supplies",
    status: "approved-and-paid",
    stage: "Paid",
    owner: "Katherine Johnson",
    nextAction: "Settled",
    requester: "Dorothy Vaughan",
    submittedOn: "Jul 18",
    isMine: false,
  },
];

export const HISTORY: HistoryEvent[] = [
  {
    when: "Today · 09:12",
    actor: "CEO",
    authority: "CEO authority",
    action:
      "Took over EXP-0952; IT Head and Reporting Head stages skipped",
    request: "EXP-0952",
  },
  {
    when: "Today · 08:47",
    actor: "Katherine Johnson",
    authority: "Finance verification",
    action:
      "Returned EXP-0987 as Needs correction: receipt for night 3 is unreadable",
    request: "EXP-0987",
  },
  {
    when: "Yesterday · 16:05",
    actor: "Grace Hopper",
    authority: "IT Head approval",
    action: "Approved PR-1203 at the IT Head stage",
    request: "PR-1203",
  },
  {
    when: "Jul 31 · 11:20",
    actor: "Katherine Johnson",
    authority: "Finance verification",
    action: "Verified and marked EXP-0901 as paid",
    request: "EXP-0901",
  },
  {
    when: "Jul 30 · 14:02",
    actor: "Dorothy Vaughan",
    authority: "Reporting Head approval",
    action: "Approved EXP-0901 at the Reporting Head stage",
    request: "EXP-0901",
  },
];

export const ORG_NOTICE = {
  tag: "HR alert",
  title: "Missing manager assignment",
  detail:
    "Katherine Johnson has no Reporting Head assigned. New requests from her team skip that stage. HR and system administrators were notified.",
};
