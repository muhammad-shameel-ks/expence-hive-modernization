import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { AppHeader } from "@/components/layout/app-header";
import styles from "../../expenses/expenses.module.css";

export default async function FinancePaymentsPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");

  let claims;
  try {
    claims = await expenseCommands().listFinancePaymentQueue(employee.id);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      return (
        <main className={styles.page}>
          <AppHeader employeeName={employee.name} />
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Payment queue</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Only Finance and HR can view this page.
            </p>
          </div>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className={styles.page}>
      <AppHeader employeeName={employee.name} canViewPaymentQueue />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / payment queue
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Payment queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Claims at or past Finance verification, with the payout details needed to pay them.
        </p>

        <div className="mt-8 overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr className="bg-black/[0.03] text-left">
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Account number</th>
                <th className="px-4 py-3 font-medium">IFSC code</th>
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                    No claims are waiting on Finance right now.
                  </td>
                </tr>
              ) : (
                claims.map((claim) => (
                  <tr key={claim.id} className="border-t border-black/10 odd:bg-muted/60">
                    <td className="px-4 py-3">{claim.ref}</td>
                    <td className="px-4 py-3">{claim.title}</td>
                    <td className="px-4 py-3">₹{(claim.amountMinor / 100).toFixed(2)}</td>
                    <td className="px-4 py-3">{claim.status}</td>
                    <td className="px-4 py-3">{claim.payoutDetails?.accountNumber ?? "-"}</td>
                    <td className="px-4 py-3">{claim.payoutDetails?.ifscCode ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
