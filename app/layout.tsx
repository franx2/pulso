import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import "./globals.css";

// La letra de biancoynero.com: condensada, entra más cifra por fila.
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pulso Operativo — Bianco & Nero",
  description: "Fichaje, turnos, ventas y reportes de los locales",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${robotoCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
