import "./globals.css";
import type { Metadata } from "next";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "AIPrep — SAT Practice",
  description: "Your ultimate AI-powered SAT prep platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-slate-950">
      <body className="flex min-h-screen flex-col bg-slate-950 text-zinc-100 antialiased">
        <NavBar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
