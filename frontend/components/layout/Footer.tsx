// frontend/components/layout/Footer.tsx

import Link from "next/link";
import { CircleHelp, Mail, ShieldCheck, ShoppingBag } from "lucide-react";

export default function Footer() {
  return (
    <footer
      className="theme-bg-secondary border-t"
      style={{ borderColor: "var(--card-border)" }}
    >
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <h3 className="text-xl font-bold mb-4 theme-accent flex items-center gap-2 text-2xl">
              <ShoppingBag className="w-7 h-7" />
              Runner Commerce
            </h3>
            <p className="theme-text-secondary text-sm leading-relaxed">
              WhatsApp product reposting and organised order management for
              runners, shops, and customers.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4 theme-text-primary uppercase tracking-wide text-sm">
              Quick Links
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/products"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Products
                </Link>
              </li>
              <li>
                <Link
                  href="/shops"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Shops
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4 theme-text-primary uppercase tracking-wide text-sm">
              Support
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/help"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Help Center
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Contact Us
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="theme-text-secondary hover:theme-accent transition-colors"
                >
                  → Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="font-semibold mb-4 theme-text-primary uppercase tracking-wide text-sm">
              Connect
            </h4>
            <div className="flex gap-4">
              <Link
                href="/contact"
                className="theme-text-secondary hover:theme-accent transition-all hover:scale-110"
                aria-label="Contact"
              >
                <Mail className="w-6 h-6" />
              </Link>
              <Link
                href="/help"
                className="theme-text-secondary hover:theme-accent transition-all hover:scale-110"
                aria-label="Help"
              >
                <CircleHelp className="w-6 h-6" />
              </Link>
              <Link
                href="/privacy"
                className="theme-text-secondary hover:theme-accent transition-all hover:scale-110"
                aria-label="Privacy"
              >
                <ShieldCheck className="w-6 h-6" />
              </Link>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div
          className="border-t theme-border mt-12 pt-8 text-center text-sm theme-text-secondary"
          style={{ borderColor: "var(--card-border)" }}
        >
          <p>
            © {new Date().getFullYear()} Runner Commerce. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
