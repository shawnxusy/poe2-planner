import type { ReactNode } from "react";

export const metadata = {
  title: "PoE2 Planner",
  description: "Build navigator for Path of Exile 2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
