// frontend/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { FeatureFlagsProvider } from "@/context/FeatureFlagsContext";
import { Toaster } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Runner Commerce",
  description:
    "WhatsApp reposting support for runners and shop owners, with bridge monitoring and marketplace controls.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Runner Commerce",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

// Inline script to set theme before page loads (prevents flash of unstyled content)
const ThemeInitializer = () => (
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function() {
          var theme = localStorage.getItem('theme') || 'elite-dark';
          document.documentElement.setAttribute('data-theme', theme);
        })();
      `,
    }}
  />
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeInitializer />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <FeatureFlagsProvider>
              <CartProvider>
                <div className="min-h-screen flex flex-col">
                  <Header />
                  <main className="flex-1 container mx-auto px-4 py-8">
                    {children}
                  </main>
                  <Footer />
                </div>
                <Toaster position="top-right" richColors />
              </CartProvider>
            </FeatureFlagsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
