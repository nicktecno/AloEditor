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
  title: "Alô Editor — Ecossistema Alô Tio",
  description: "Editor de vídeo web 100% no navegador integrado ao Google Drive. Linha do tempo profissional, multitrack e renderização client-side com identidade visual Alô Tio.",
  icons: {
    icon: "/AloEditor.png",
    shortcut: "/AloEditor.png",
    apple: "/AloEditor.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
