"use client";

import type { FormEvent } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";

type LoginState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSurface />}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const searchParams = useSearchParams();
  const showInvalidLink = searchParams.get("error") === "invalid-token";
  const [email, setEmail] = useState("");
  const [devEmployee, setDevEmployee] = useState("emp-shameel");
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const sentTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.status === "sent") {
      sentTitleRef.current?.focus();
    }
  }, [state.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "sending" });
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        throw new Error("request failed");
      }
      setState({ status: "sent", email });
    } catch {
      setState({
        status: "error",
        message:
          "We could not send the sign-in link right now. Please try again in a moment.",
      });
    }
  }

  async function handleDevLogin() {
    const response = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId: devEmployee }),
    });
    if (response.ok) window.location.href = "/expenses";
  }

  return (
    <main className={styles.page}>
      <section className={styles.variantSplit}>
        <aside className={styles.splitAside}>
          <div className={styles.splitAsideTop}>
            <BrandLockup inverted />
            <span className={styles.splitPill}>MAGIC LINK ACCESS</span>
          </div>
          <div className={styles.splitAsideCopy}>
            <p className={styles.eyebrow}>EXPENSE OPERATIONS / SIGN-IN</p>
            <h1 className={styles.splitTitle}>
              Sign in without a password.
            </h1>
            <p className={styles.splitCopy}>
              Request a one-time link and get straight to your expense work.
              No passwords to remember, rotate, or reset.
            </p>
            <div className={styles.routeRail} aria-label="How sign-in works">
              <div className={styles.routeItem}>
                <span className={styles.routeDot} />
                <span>Enter your work email</span>
                <small>01</small>
              </div>
              <div className={styles.routeLine} />
              <div className={styles.routeItem}>
                <span className={styles.routeDot} />
                <span>Open the link we email you</span>
                <small>02</small>
              </div>
              <div className={styles.routeLine} />
              <div className={styles.routeItem}>
                <span className={styles.routeDot} />
                <span>You are signed in</span>
                <small>03</small>
              </div>
            </div>
          </div>
          <div className={styles.splitAsideFooter}>
            <span className={styles.statusDot} />
            <span>Links expire in 15 minutes</span>
            <span className={styles.footerYear}>EH / 26</span>
          </div>
        </aside>

        <div className={styles.splitMain}>
          <div className={styles.splitHeader}>
            <span>ExpenseHive access</span>
          </div>
          <div className={styles.splitFormArea}>
            <p className={styles.eyebrow}>YOUR WORKSPACE AWAITS</p>

            {state.status === "sent" ? (
              <section
                aria-live="polite"
                className={styles.successPanel}
                role="status"
              >
                <h2 ref={sentTitleRef} tabIndex={-1} className={styles.successTitle}>
                  Check your inbox
                </h2>
                <div className={styles.successIcon}>
                  <CheckIcon />
                </div>
                <p className={styles.successCopy}>
                  We emailed a one-time sign-in link to{" "}
                  <strong>{state.email}</strong>. The link expires in 15
                  minutes and works once.
                </p>
                {process.env.NODE_ENV === "development" && (
                  <p className={styles.successHint}>
                    Local preview: open the{" "}
                    <a href="http://localhost:8025">Mailpit inbox</a> to find
                    the link.
                  </p>
                )}
                <button
                  className={styles.linkButton}
                  type="button"
                  onClick={() => setState({ status: "idle" })}
                >
                  Use a different email
                </button>
              </section>
            ) : (
              <>
                <h2 className={styles.splitFormTitle}>
                  Request a sign-in link.
                </h2>
                <p className={styles.splitFormCaption}>
                  Enter your work email and we will send you a one-time link.
                </p>

                {showInvalidLink && (
                  <div className={styles.errorBanner} role="alert">
                    This sign-in link is invalid or has expired. Request a new
                    one below.
                  </div>
                )}

                <form className={styles.form} onSubmit={handleSubmit}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="work-email">
                      Work email
                    </label>
                    <div className={styles.inputWrap}>
                      <MailIcon />
                      <input
                        autoComplete="email"
                        className={styles.input}
                        disabled={state.status === "sending"}
                        id="work-email"
                        name="email"
                        placeholder="you@company.com"
                        required
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </div>
                  </div>

                  {state.status === "error" && (
                    <p aria-live="polite" className={styles.formError} role="alert">
                      {state.message}
                    </p>
                  )}

                  <div className={styles.helperRow}>
                    <span className={styles.helperCopy}>
                      No password needed. Magic links expire in 15 minutes.
                    </span>
                  </div>

                  <button
                    className={styles.primaryButton}
                    disabled={state.status === "sending"}
                    type="submit"
                  >
                    {state.status === "sending"
                      ? "Sending your link..."
                      : "Email me a sign-in link"}
                    <ArrowForwardIcon />
                  </button>
                </form>
                <p className={styles.formLegal}>
                  Your access is managed by your organization.
                </p>
                {process.env.NODE_ENV !== "production" ? (
                  <div className={styles.devLogin}>
                    <span className={styles.devLoginLabel}>LOCAL DEVELOPMENT</span>
                    <select value={devEmployee} aria-label="Development identity" onChange={(event) => setDevEmployee(event.target.value)}>
                      <option value="emp-shameel">Muhammad Shameel / Employee</option>
                      <option value="emp-ada">Ada Lovelace / Manager</option>
                      <option value="emp-it">IT Head / IT reviewer</option>
                      <option value="emp-ceo">CEO / CEO</option>
                      <option value="emp-finance">Finance Officer / Finance</option>
                    </select>
                    <button type="button" onClick={handleDevLogin}>Open as this user</button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandLockup({ inverted = false }: { inverted?: boolean }) {
  return (
    <div
      className={`${styles.brandLockup} ${
        inverted ? styles.brandLockupInverted : ""
      }`}
    >
      <span className={styles.brandMark}>
        <HiveMark />
      </span>
      <span>
        <strong className={styles.brandName}>ExpenseHive</strong>
        <span className={styles.brandDescriptor}>expense operations</span>
      </span>
    </div>
  );
}

function LoginSurface() {
  return <main className={styles.page}>Loading sign-in…</main>;
}

function HiveMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="m12 2.75 7.5 4.35v9.8L12 21.25l-7.5-4.35V7.1L12 2.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.65"
      />
      <path
        d="m8.25 9.2 3.75-2.15 3.75 2.15v5.6l-3.75 2.15-3.75-2.15V9.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function ArrowForwardIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="M3.5 10h12m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className={styles.inputIcon} fill="none" viewBox="0 0 20 20">
      <rect height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" width="15" x="2.5" y="4" />
      <path d="m3.5 5.5 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="m4 10.5 3.5 3.5L16 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
