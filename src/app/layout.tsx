import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Newsreader } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], display: "swap", style: ["normal", "italic"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Architect Prep", template: "%s · Architect Prep" },
  description: "Self-paced prep for the Claude Certified Architect exams. Unofficial study aid.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edeee8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1419" },
  ],
};

// Runs before paint so the stored theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem('ccp-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

// Netlify injects an HTML comment (and surrounding whitespace) into <head> on *.netlify.app.
// React hydrates <head> too, so those stray nodes trigger error #418 and a full client re-render.
// Remove them while the head is still parsing, before the async chunks hydrate.
const stripInjectedHeadNodes = `(function(){var h=document.head;if(!h)return;for(var n=h.firstChild;n;){var x=n.nextSibling;if(n.nodeType===8||(n.nodeType===3&&!/\\S/.test(n.nodeValue||'')))h.removeChild(n);n=x}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${newsreader.variable} ${jetbrains.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: stripInjectedHeadNodes }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
