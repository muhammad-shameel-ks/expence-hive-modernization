// Mock data for the expense dashboard.
// Throwaway — replace with real server data when the dashboard ships.

export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "in-approval"
  | "needs-correction"
  | "approved"
  | "in-finance"
  | "paid"
  | "rejected";

export type HistoryKind =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "correction"
  | "skipped"
  | "takeover"
  | "reviewing"
  | "verified"
  | "paid"
  | "note";

export interface HistoryEvent {
  id: string;
  date: string;
  actor: string;
  kind: HistoryKind;
  detail?: string;
}

export interface Expense {
  id: string;
  ref: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  /** Display date, e.g. "Aug 4" or "Draft". */
  date: string;
  /** ISO timestamp of the first submission (drafts keep their creation time). */
  submittedAt: string;
  status: ExpenseStatus;
  nextStage?: string;
  nextActor?: string;
  blockingReason?: string;
  permission?: string;
  attachments: string[];
  history: HistoryEvent[];
  primaryAction?: "approve" | "verify" | "pay";
}

export const ME = "Muhammad Shameel";

export const STATUS_META: Record<
  ExpenseStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  "in-approval": { label: "In approval", tone: "info" },
  "needs-correction": { label: "Needs correction", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  "in-finance": { label: "In finance", tone: "info" },
  paid: { label: "Approved and paid", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const expenses: Expense[] = [
  {
    id: "ex-figma",
    ref: "EXP-2026-0142",
    title: "Figma Professional plan — H2 renewal",
    category: "Software",
    amount: 594,
    currency: "INR",
    date: "Aug 4",
    submittedAt: "2026-08-03T10:42:00Z",
    status: "in-finance",
    nextStage: "Finance verification",
    nextActor: "Finance Officer",
    permission: "PER-2026-0087",
    attachments: ["invoice-figma-2026-08.pdf", "quote-2026.pdf"],
    history: [
      { id: "h1", date: "Aug 3, 10:42", actor: ME, kind: "submitted", detail: "Sent for Team Lead review" },
      { id: "h2", date: "Aug 3, 16:05", actor: "Ada Lovelace", kind: "approved", detail: "Within software budget" },
      { id: "h3", date: "Aug 4, 09:12", actor: ME, kind: "note", detail: "Attached invoice PDF" },
      { id: "h4", date: "Aug 4, 10:30", actor: "Finance Officer", kind: "reviewing", detail: "Verifying receipt and payment details" },
    ],
  },
  {
    id: "ex-dinner",
    ref: "EXP-2026-0138",
    title: "Client dinner — Acme Corp",
    category: "Meals",
    amount: 180,
    currency: "INR",
    date: "Aug 1",
    submittedAt: "2026-07-29T13:20:00Z",
    status: "needs-correction",
    nextStage: "Resubmit claim",
    nextActor: ME,
    blockingReason: "Receipt over ₹150 requires an itemized breakdown.",
    attachments: ["receipt-acme-dinner.jpg"],
    history: [
      { id: "h1", date: "Jul 29, 13:20", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 30, 11:02", actor: "Grace Hopper", kind: "approved" },
      { id: "h3", date: "Aug 1, 15:40", actor: "Finance Officer", kind: "correction", detail: "Itemized breakdown required over ₹150" },
    ],
  },
  {
    id: "ex-flight",
    ref: "EXP-2026-0135",
    title: "Flight — Lahore to Karachi",
    category: "Travel",
    amount: 340,
    currency: "INR",
    date: "Jul 31",
    submittedAt: "2026-07-29T18:04:00Z",
    status: "in-approval",
    nextStage: "Team Lead approval",
    nextActor: "Grace Hopper",
    attachments: ["boarding-pass.pdf"],
    history: [
      { id: "h1", date: "Jul 29, 18:04", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 30, 09:21", actor: "IT Head", kind: "approved", detail: "Travel policy check passed" },
      { id: "h3", date: "Jul 31, 14:47", actor: "System", kind: "note", detail: "Awaiting Grace Hopper" },
    ],
  },
  {
    id: "ex-hotel",
    ref: "EXP-2026-0132",
    title: "Hotel — Karachi office week",
    category: "Lodging",
    amount: 620,
    currency: "INR",
    date: "Jul 30",
    submittedAt: "2026-07-26T08:55:00Z",
    status: "approved",
    nextStage: "Finance verification",
    nextActor: "Finance Officer",
    permission: "PER-2026-0079",
    attachments: ["hotel-invoice.pdf"],
    history: [
      { id: "h1", date: "Jul 26, 08:55", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 28, 13:10", actor: "Ada Lovelace", kind: "approved", detail: "Linked to PER-2026-0079" },
    ],
  },
  {
    id: "ex-aws",
    ref: "EXP-2026-0130",
    title: "AWS credits top-up",
    category: "Software",
    amount: 250,
    currency: "INR",
    date: "Jul 29",
    submittedAt: "2026-07-29T11:38:00Z",
    status: "submitted",
    nextStage: "IT Head review",
    nextActor: "IT Head",
    attachments: [],
    history: [
      { id: "h1", date: "Jul 29, 11:38", actor: ME, kind: "submitted", detail: "Sent for IT Head review" },
    ],
  },
  {
    id: "ex-snacks",
    ref: "EXP-2026-0126",
    title: "Office snacks — pantry restock",
    category: "Supplies",
    amount: 95,
    currency: "INR",
    date: "Jul 28",
    submittedAt: "2026-07-25T16:20:00Z",
    status: "paid",
    attachments: ["pantry-receipt.jpg"],
    history: [
      { id: "h1", date: "Jul 25, 16:20", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 26, 10:02", actor: "Grace Hopper", kind: "approved" },
      { id: "h3", date: "Jul 27, 09:44", actor: "Finance Officer", kind: "verified" },
      { id: "h4", date: "Jul 28, 12:15", actor: "Finance Officer", kind: "paid" },
    ],
  },
  {
    id: "ex-taxi",
    ref: "EXP-2026-0124",
    title: "Taxi — airport pickup",
    category: "Travel",
    amount: 28,
    currency: "INR",
    date: "Jul 27",
    submittedAt: "2026-07-26T19:30:00Z",
    status: "paid",
    attachments: ["taxi-receipt.png"],
    history: [
      { id: "h1", date: "Jul 26, 19:30", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 27, 08:12", actor: "Katherine Johnson", kind: "approved" },
      { id: "h3", date: "Jul 27, 13:05", actor: "Finance Officer", kind: "verified" },
      { id: "h4", date: "Jul 27, 16:40", actor: "Finance Officer", kind: "paid" },
    ],
  },
  {
    id: "ex-hub",
    ref: "EXP-2026-0120",
    title: "USB-C hub + cables",
    category: "Hardware",
    amount: 76,
    currency: "INR",
    date: "Jul 25",
    submittedAt: "2026-07-22T10:14:00Z",
    status: "rejected",
    blockingReason: "Hardware over ₹50 requires IT pre-approval.",
    attachments: ["hub-receipt.jpg"],
    history: [
      { id: "h1", date: "Jul 22, 10:14", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 24, 15:52", actor: "IT Head", kind: "rejected", detail: "IT pre-approval required over ₹50" },
    ],
  },
  {
    id: "ex-team-lunch",
    ref: "EXP-2026-0143",
    title: "Team lunch — onboarding week",
    category: "Meals",
    amount: 210,
    currency: "INR",
    date: "Draft",
    submittedAt: "2026-08-04T11:05:00Z",
    status: "draft",
    nextStage: "Submit for approval",
    nextActor: ME,
    attachments: [],
    history: [{ id: "h1", date: "Aug 4, 11:05", actor: ME, kind: "draft", detail: "Autosaved — 2 of 3 steps complete" }],
  },
  {
    id: "ex-course",
    ref: "EXP-2026-0121",
    title: "CPD course — Laravel Livewire",
    category: "Training",
    amount: 150,
    currency: "INR",
    date: "Jul 26",
    submittedAt: "2026-07-24T09:40:00Z",
    status: "in-approval",
    nextStage: "Training approval",
    nextActor: "Katherine Johnson",
    attachments: ["course-brochure.pdf"],
    history: [
      { id: "h1", date: "Jul 24, 09:40", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 26, 12:30", actor: "System", kind: "note", detail: "Awaiting Katherine Johnson" },
    ],
  },
  {
    id: "ex-karting",
    ref: "EXP-2026-0117",
    title: "Team building — go-karting",
    category: "Meals",
    amount: 320,
    currency: "INR",
    date: "Jul 23",
    submittedAt: "2026-07-18T14:00:00Z",
    status: "paid",
    attachments: ["karting-invoice.pdf"],
    history: [
      { id: "h1", date: "Jul 18, 14:00", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 19, 09:30", actor: "CEO", kind: "approved", detail: "CEO approval — event budget" },
      { id: "h3", date: "Jul 22, 11:10", actor: "Finance Officer", kind: "verified" },
      { id: "h4", date: "Jul 23, 15:25", actor: "Finance Officer", kind: "paid" },
    ],
  },
  {
    id: "ex-domain",
    ref: "EXP-2026-0115",
    title: "Domain renewal — hive.local",
    category: "Software",
    amount: 18,
    currency: "INR",
    date: "Jul 22",
    submittedAt: "2026-07-20T10:10:00Z",
    status: "paid",
    attachments: ["domain-invoice.pdf"],
    history: [
      { id: "h1", date: "Jul 20, 10:10", actor: ME, kind: "submitted" },
      { id: "h2", date: "Jul 21, 09:05", actor: "Ada Lovelace", kind: "approved" },
      { id: "h3", date: "Jul 22, 10:00", actor: "Finance Officer", kind: "verified" },
      { id: "h4", date: "Jul 22, 10:02", actor: "Finance Officer", kind: "paid" },
    ],
  },
];
