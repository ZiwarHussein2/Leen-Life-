import type { Metadata } from "next";
import { Inter, Noto_Kufi_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoKufi = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-kufi",
});

export const metadata: Metadata = {
  title: "Leen Life Operations",
  description: "Leen Life Medical Complex operations platform",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale = store.get("locale")?.value ?? "en";
  const dir = locale === "ar" || locale === "ku" ? "rtl" : "ltr";
  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${notoKufi.variable}`}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
