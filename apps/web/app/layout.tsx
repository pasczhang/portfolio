import type { Metadata } from "next";
import { AppFrame } from "@/components/layout/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: "Balance Fixed Income PMS",
  description: "Hong Kong public money market fund portfolio management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK" className="dark" suppressHydrationWarning>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
