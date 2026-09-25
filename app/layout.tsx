import type { Metadata } from "next";
import {
  EB_Garamond,
  IM_Fell_English,
  IM_Fell_English_SC,
  Instrument_Sans,
} from "next/font/google";
import { LanguageProvider } from "@/lib/i18n";
import { cssVars } from "@/lib/theme";
import "./globals.css";

// The atlas's three hands: Fell for what is engraved, Garamond for what is
// read, and a plain sans kept only for the controls.
const fell = IM_Fell_English({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});

const fellCaps = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-caps",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Atlas — learn anything, deeply",
  description:
    "A living knowledge map that moves you through plan → consume → question → teach back → connect → apply → retain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" style={cssVars}>
      <body
        className={`${fell.variable} ${fellCaps.variable} ${garamond.variable} ${instrumentSans.variable}`}
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
