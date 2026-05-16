import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "mrsabpata", template: "%s | mrsabpata" },
  description: "Official website for the mrsabpata YouTube channel.",
  openGraph: { siteName: "mrsabpata", type: "website" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-white tracking-tight">mrsabpata</a>
          <nav className="flex gap-6 text-sm text-gray-400">
            <a href="/videos" className="hover:text-white transition-colors">Videos</a>
            <a href="/dashboard" className="hover:text-white transition-colors">Stats</a>
            <a href="/about" className="hover:text-white transition-colors">About</a>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-800 px-6 py-6 text-center text-sm text-gray-600">
          © {new Date().getFullYear()} mrsabpata. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
