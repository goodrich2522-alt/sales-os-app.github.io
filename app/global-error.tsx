"use client";
// จอสุดท้าย — พังตั้งแต่ layout/provider (error.tsx ของแต่ละหน้าไม่ทำงานแล้ว)
import { ErrorReport } from "@/components/ErrorReport";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body>
        <ErrorReport error={error} reset={reset} where="ทั้งแอป (layout)" />
      </body>
    </html>
  );
}
