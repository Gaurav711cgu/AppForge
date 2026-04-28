import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AppForge — AI Application Compiler",
  description: "Natural language → validated, executable app config. Multi-stage LLM pipeline with schema enforcement and auto-repair.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
