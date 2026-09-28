"use client";
import { ErrorReport } from "@/components/ErrorReport";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorReport error={error} reset={reset} where="หน้าฝ่ายขาย" />;
}
