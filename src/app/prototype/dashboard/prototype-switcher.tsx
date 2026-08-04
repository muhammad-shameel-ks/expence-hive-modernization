"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./prototype-switcher.module.css";

export const VARIANT_KEYS = ["A", "B", "C"] as const;

export const VARIANT_NAMES: Record<string, string> = {
  A: "Action spine",
  B: "Split desk",
  C: "Status board",
};

export function PrototypeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(delta: number) {
    const index = VARIANT_KEYS.indexOf(current as (typeof VARIANT_KEYS)[number]);
    const next = VARIANT_KEYS[(index + delta + VARIANT_KEYS.length) % VARIANT_KEYS.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        go(-1);
      } else if (event.key === "ArrowRight") {
        go(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <div className={styles.bar} role="group" aria-label="Prototype variants">
      <button
        aria-label="Previous variant"
        className={styles.arrow}
        onClick={() => go(-1)}
        type="button"
      >
        ←
      </button>
      <span className={styles.label}>
        {current} — {VARIANT_NAMES[current]}
      </span>
      <button
        aria-label="Next variant"
        className={styles.arrow}
        onClick={() => go(1)}
        type="button"
      >
        →
      </button>
    </div>
  );
}
