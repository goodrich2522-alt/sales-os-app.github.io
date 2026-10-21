import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { AppProvider } from "@/lib/AppContext";
import { UpdateChecker } from "@/components/UpdateChecker";
import { SaveErrorBanner } from "@/components/SaveErrorBanner";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/sales-os-app.github.io";

export const metadata: Metadata = {
  title: "SalesOS - ระบบจัดการขายและสต็อกรถโฟล์คลิฟท์",
  description: "ระบบจัดการการขายและสินค้าคงคลังรถโฟล์คลิฟท์แบบเรียลไทม์",
  manifest: `${basePath}/manifest.json`,
};

export const viewport: Viewport = {
  themeColor: "#1e40af",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-slate-50 font-sans antialiased">
        <AppProvider>{children}<SaveErrorBanner /></AppProvider>
        <UpdateChecker />
      </body>
    </html>
  );
}
