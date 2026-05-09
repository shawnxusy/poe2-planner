import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "PoE2 Planner — Import a build",
  description:
    "Inspect any Path of Exile 2 build from a Path of Building share code.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-page min-h-screen antialiased">{children}</body>
    </html>
  );
}
