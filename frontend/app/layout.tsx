import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "KalshiBot Dashboard (Starter)",
  description: "Minimal dashboard for KalshiBot backend APIs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

