import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope, Playfair_Display } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Пара для лендинга: контрастная антиква на крупных заголовках и спокойный
 * гротеск в тексте. Кириллица подключена явно — без неё казахские и русские
 * строки поехали бы на запасной шрифт.
 */
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "AI Dos — умная регистратура клиники",
    template: "%s · AI Dos",
  },
  description:
    "AI-регистратура для клиник Казахстана: обращения, расписание и передача сложных случаев сотруднику.",
  applicationName: "AI Dos",
  openGraph: {
    title: "AI Dos — регистратура, которая всегда на связи",
    description:
      "Принимайте обращения 24/7 на русском, казахском и английском.",
    type: "website",
    locale: "ru_KZ",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
