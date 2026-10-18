import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCParrot — Workspace",
  description: "Turn websites you use into ChatGPT tools through a private MCP connection.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ClerkProvider signInUrl="/sign-in">{children}</ClerkProvider></body>
    </html>
  );
}
