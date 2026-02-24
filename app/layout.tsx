import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PES Liga",
  description: "PES Liga app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen text-foreground antialiased"
      >
        {children}
      </body>
    </html>
  );
}
