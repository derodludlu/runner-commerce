"use client";

import { useEffect, useMemo, useState } from "react";
import { billingApi } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle,
  CreditCard,
  FileText,
  PauseCircle,
  ReceiptText,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type BillingScope = "RUNNER" | "SHOP_OWNER" | "ADMIN";

interface BillingDashboardProps {
  scope: BillingScope;
}

const methodOptions = [
  { label: "EFT", value: "EFT" },
  { label: "MTN MoMo", value: "MTN_MOMO" },
  { label: "Cash deposit", value: "CASH_DEPOSIT" },
  { label: "Other", value: "OTHER" },
];

const launchDiscountPercent = 15;
const launchDiscountRate = launchDiscountPercent / 100;
const launchPromotionEndsAt = "31 Jul 2026";
const promoTickerText = `Launch offer: save up to ${launchDiscountPercent}% until ${launchPromotionEndsAt}`;
const runnerTrialHeadline = "2-week free Phase 1 trial";
const runnerTrialCopy =
  "Start with onboarding, shop selection, one posting group, and admin verification before paid runner billing begins.";
const runnerSharedBenefits = [
  "15% launch offer valid until 31 Jul 2026",
  "2-week free Phase 1 trial before paid runner billing starts",
  "WhatsApp reposting automation included",
  "Runner code stamping included free",
  "Runner link included free",
];

const regularWeeklyRunnerPrices: Record<string, number> = {
  RUNNER_STARTER_WEEKLY: 112,
  RUNNER_ACTIVE_WEEKLY: 147,
  RUNNER_POWER_WEEKLY: 194,
};

const monthlyRunnerWeeklyEquivalentPrices: Record<string, number> = {
  RUNNER_STARTER: 380,
  RUNNER_ACTIVE: 500,
  RUNNER_POWER: 649,
};

const runnerTierOrder = ["STARTER", "ACTIVE", "POWER"];

const runnerTierNames: Record<string, string> = {
  STARTER: "Starter Runner",
  ACTIVE: "Active Runner",
  POWER: "Power Runner",
};

function billingCycleLabel(planOrSubscription: any) {
  return String(
    planOrSubscription?.billingCycle ||
      planOrSubscription?.plan?.billingCycle ||
      "MONTHLY",
  ).toUpperCase() === "WEEKLY"
    ? "week"
    : "month";
}

function planFeatures(plan: any) {
  return Array.isArray(plan?.features) ? plan.features : [];
}

function regularPriceFromPromo(discountedPrice: number) {
  if (!Number.isFinite(discountedPrice) || discountedPrice <= 0) return 0;
  return Math.round(discountedPrice / (1 - launchDiscountRate));
}

function regularPlanPrice(plan: any) {
  const monthlyWeeklyEquivalent =
    monthlyRunnerWeeklyEquivalentPrices[String(plan?.code || "")];
  if (monthlyWeeklyEquivalent) return monthlyWeeklyEquivalent;
  return (
    regularWeeklyRunnerPrices[String(plan?.code || "")] ||
    regularPriceFromPromo(Number(plan?.monthlyPrice || 0))
  );
}

function planDiscountPercent(plan: any) {
  const regularPrice = regularPlanPrice(plan);
  const offerPrice = Number(plan?.monthlyPrice || 0);
  if (regularPrice <= 0 || offerPrice <= 0) return 0;
  return Math.round((1 - offerPrice / regularPrice) * 100);
}

function planCatchPhrase(plan: any) {
  return plan?.audience === "SHOP_OWNER"
    ? "Keep every shop group moving without reposting all day."
    : "Win back your time while your adverts keep flowing.";
}

function planComparisonLabel(plan: any) {
  const code = String(plan?.code || "");
  const regularPrice = regularPlanPrice(plan);
  if (monthlyRunnerWeeklyEquivalentPrices[code]) {
    return `4 weekly payments ${formatCurrency(regularPrice)}/month`;
  }
  return `Regular ${formatCurrency(regularPrice)}/${billingCycleLabel(plan)}`;
}

function planSavingsLabel(plan: any) {
  const regularPrice = regularPlanPrice(plan);
  const offerPrice = Number(plan?.monthlyPrice || 0);
  const savings = Math.max(0, regularPrice - offerPrice);
  if (monthlyRunnerWeeklyEquivalentPrices[String(plan?.code || "")]) {
    return `Save ${formatCurrency(savings)}/month versus weekly`;
  }
  if (regularWeeklyRunnerPrices[String(plan?.code || "")]) {
    return `Save ${formatCurrency(savings)}/week during launch`;
  }
  return `${planDiscountPercent(plan)}% launch offer valid until ${launchPromotionEndsAt}`;
}

function runnerTierFromPlan(plan: any) {
  const code = String(plan?.code || "");
  const match = code.match(/^RUNNER_(STARTER|ACTIVE|POWER)(?:_WEEKLY)?$/);
  return match?.[1] || "";
}

function billingCycleValue(plan: any) {
  return String(plan?.billingCycle || "MONTHLY").toUpperCase();
}

function capacityDeliveryText(plan: any) {
  return billingCycleValue(plan) === "WEEKLY" ? "500" : "2,000";
}

function groupRunnerPlans(plans: any[]) {
  const grouped = new Map<string, { weekly?: any; monthly?: any }>();

  for (const plan of plans) {
    const tier = runnerTierFromPlan(plan);
    if (!tier) continue;
    const current = grouped.get(tier) || {};
    if (billingCycleValue(plan) === "WEEKLY") {
      current.weekly = plan;
    } else {
      current.monthly = plan;
    }
    grouped.set(tier, current);
  }

  return runnerTierOrder
    .map((tier) => ({
      key: tier,
      name: runnerTierNames[tier],
      plans: grouped.get(tier),
    }))
    .filter((group) => group.plans?.weekly || group.plans?.monthly);
}

function subscriptionAddonSummary(subscription: any) {
  const addOns = [];
  if (subscription.automationAddonEnabled) {
    addOns.push(
      `${formatCurrency(subscription.automationAddonPrice)} extra reposting capacity`,
    );
  }
  if (subscription.orderWorkflowAddonEnabled) {
    addOns.push(
      `${formatCurrency(subscription.orderWorkflowAddonPrice)} Phase 2 add-on`,
    );
  }
  if (subscription.priceEditingAddonEnabled) {
    addOns.push(
      `${formatCurrency(subscription.priceEditingAddonPrice)} price editing`,
    );
  }
  if (subscription.shopPriceImageAddonEnabled) {
    addOns.push(
      `${formatCurrency(subscription.shopPriceImageAddonPrice)} shop-price images`,
    );
  }
  return addOns.length > 0 ? ` + ${addOns.join(" + ")}` : "";
}

function PromoTicker({ direction }: { direction: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className="promo-ticker overflow-hidden rounded-md border"
      style={{
        backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
        borderColor: "var(--accent)",
      }}
    >
      <div
        className={`promo-ticker-track ${
          direction === "right" ? "promo-ticker-right" : "promo-ticker-left"
        }`}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <span key={index}>
            {promoTickerText}
            <span className="promo-ticker-separator">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BillingDashboard({ scope }: BillingDashboardProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [billing, setBilling] = useState<any>({
    subscriptions: [],
    invoices: [],
    manualPayments: [],
  });
  const [invoices, setInvoices] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [billingEvents, setBillingEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, any>>({});
  const [addonSelections, setAddonSelections] = useState<
    Record<string, boolean>
  >({});
  const [priceEditingSelections, setPriceEditingSelections] = useState<
    Record<string, boolean>
  >({});
  const [shopPriceImageSelections, setShopPriceImageSelections] = useState<
    Record<string, boolean>
  >({});
  const [runnerCycleSelections, setRunnerCycleSelections] = useState<
    Record<string, "WEEKLY" | "MONTHLY">
  >({});
  const isAdmin = scope === "ADMIN";

  useEffect(() => {
    loadBilling();
  }, []);

  const loadBilling = async () => {
    setLoading(true);
    try {
      const [plansRes, mineRes, invoicesRes, eventsRes] = await Promise.all([
        billingApi.getPlans(),
        isAdmin
          ? Promise.resolve({ data: { subscriptions: [], invoices: [] } })
          : billingApi.getMine(),
        billingApi.getInvoices(),
        billingApi.getEvents(),
      ]);
      const subscriptionsRes = isAdmin
        ? await billingApi.getSubscriptions()
        : { data: mineRes.data?.subscriptions || [] };
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      setBilling(mineRes.data || { subscriptions: [], invoices: [] });
      setInvoices(Array.isArray(invoicesRes.data) ? invoicesRes.data : []);
      setBillingEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
      setSubscriptions(
        Array.isArray(subscriptionsRes.data) ? subscriptionsRes.data : [],
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  const visiblePlans = useMemo(() => {
    if (isAdmin) return plans;
    return plans.filter((plan) => plan.audience === scope);
  }, [isAdmin, plans, scope]);

  const pricingCards = useMemo(() => {
    if (scope !== "RUNNER") {
      return visiblePlans.map((plan) => ({
        key: plan.code || plan.id,
        title: plan.name,
        plan,
        cyclePlans: null,
      }));
    }

    return groupRunnerPlans(visiblePlans).map((group) => {
      const selectedCycle =
        runnerCycleSelections[group.key] ||
        (group.plans?.weekly ? "WEEKLY" : "MONTHLY");
      const selectedPlan =
        selectedCycle === "WEEKLY"
          ? group.plans?.weekly || group.plans?.monthly
          : group.plans?.monthly || group.plans?.weekly;

      return {
        key: group.key,
        title: group.name,
        plan: selectedPlan,
        cyclePlans: group.plans,
      };
    });
  }, [runnerCycleSelections, scope, visiblePlans]);

  const visibleSubscriptions = isAdmin
    ? subscriptions
    : billing.subscriptions || [];
  const visibleInvoices = isAdmin ? invoices : billing.invoices || [];
  const showRunnerTrial = scope === "RUNNER";

  const createSubscription = async (planCode: string) => {
    setBusyId(planCode);
    try {
      await billingApi.createSubscription({
        planCode,
        automationAddonEnabled: Boolean(addonSelections[planCode]),
        orderWorkflowAddonEnabled: false,
        priceEditingAddonEnabled: Boolean(priceEditingSelections[planCode]),
        shopPriceImageAddonEnabled: Boolean(shopPriceImageSelections[planCode]),
      });
      toast.success(
        isAdmin
          ? "Subscription created"
          : "Subscription request submitted for approval",
      );
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to subscribe");
    } finally {
      setBusyId(null);
    }
  };

  const generateInvoice = async (subscriptionId: string) => {
    setBusyId(subscriptionId);
    try {
      await billingApi.generateCurrentInvoice(subscriptionId);
      toast.success("Invoice generated");
      await loadBilling();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to generate invoice",
      );
    } finally {
      setBusyId(null);
    }
  };

  const changePlan = async (subscription: any, planCode: string) => {
    if (!planCode || planCode === subscription.plan?.code) return;
    setBusyId(subscription.id);
    try {
      const response = await billingApi.changeSubscriptionPlan(
        subscription.id,
        {
          planCode,
          automationAddonEnabled: subscription.automationAddonEnabled,
          orderWorkflowAddonEnabled: subscription.orderWorkflowAddonEnabled,
          priceEditingAddonEnabled: subscription.priceEditingAddonEnabled,
          shopPriceImageAddonEnabled: subscription.shopPriceImageAddonEnabled,
        },
      );
      toast.success(response.data?.message || "Subscription plan updated");
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to change plan");
    } finally {
      setBusyId(null);
    }
  };

  const updateSubscriptionStatus = async (
    subscription: any,
    status: string,
  ) => {
    const label = status.toLowerCase();
    if (
      ["CANCELLED", "REJECTED"].includes(status) &&
      !confirm(`Mark this subscription as ${label}?`)
    ) {
      return;
    }
    setBusyId(subscription.id);
    try {
      await billingApi.updateSubscriptionStatus(subscription.id, { status });
      toast.success(`Subscription ${label}`);
      await loadBilling();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update subscription",
      );
    } finally {
      setBusyId(null);
    }
  };

  const deleteSubscription = async (subscription: any) => {
    if (!confirm("Permanently delete this billing subscription?")) return;
    setBusyId(subscription.id);
    try {
      await billingApi.deleteSubscription(subscription.id);
      toast.success("Subscription deleted");
      await loadBilling();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to delete subscription",
      );
    } finally {
      setBusyId(null);
    }
  };

  const updateDraft = (invoiceId: string, field: string, value: any) => {
    setPaymentDrafts((current) => ({
      ...current,
      [invoiceId]: { ...(current[invoiceId] || {}), [field]: value },
    }));
  };

  const submitPayment = async (invoice: any) => {
    const draft = paymentDrafts[invoice.id] || {};
    const amount = Number(draft.amount || invoice.total || 0);

    setBusyId(invoice.id);
    try {
      let uploadedProofUrl = "";
      if (draft.proofFile) {
        const upload = await billingApi.uploadInvoicePaymentProof(
          invoice.id,
          draft.proofFile,
        );
        uploadedProofUrl = upload.data?.proofUrl || "";
      }
      await billingApi.submitInvoicePayment(invoice.id, {
        amount,
        method: draft.method || "EFT",
        reference: draft.reference,
        runnerReference: draft.runnerReference,
        proofUrl: draft.proofUrl || uploadedProofUrl,
        proofImageUrls: uploadedProofUrl ? [uploadedProofUrl] : undefined,
        proofText: draft.proofText,
        notes: draft.notes,
      });
      toast.success("Payment proof submitted for verification");
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to submit payment");
    } finally {
      setBusyId(null);
    }
  };

  const verifyPayment = async (
    paymentId: string,
    status: "VERIFIED" | "REJECTED",
  ) => {
    const notes =
      status === "REJECTED"
        ? window.prompt("Reason for rejecting this payment proof?") || undefined
        : undefined;
    setBusyId(paymentId);
    try {
      await billingApi.updateManualPayment(paymentId, { status, notes });
      toast.success(
        status === "VERIFIED" ? "Payment verified" : "Payment rejected",
      );
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update payment");
    } finally {
      setBusyId(null);
    }
  };

  const updateInvoiceStatus = async (invoice: any, status: string) => {
    setBusyId(invoice.id);
    try {
      await billingApi.updateInvoiceStatus(invoice.id, { status });
      toast.success(`Invoice marked ${status.toLowerCase()}`);
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update invoice");
    } finally {
      setBusyId(null);
    }
  };

  const deleteInvoice = async (invoice: any) => {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}?`)) return;
    setBusyId(invoice.id);
    try {
      await billingApi.deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete invoice");
    } finally {
      setBusyId(null);
    }
  };

  const deleteManualPayment = async (payment: any) => {
    if (!confirm("Delete this manual payment request?")) return;
    setBusyId(payment.id);
    try {
      await billingApi.deleteManualPayment(payment.id);
      toast.success("Payment request deleted");
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete payment");
    } finally {
      setBusyId(null);
    }
  };

  const resetBilling = async () => {
    if (
      !confirm(
        "Reset all billing subscriptions, invoices, and manual payment requests?",
      )
    ) {
      return;
    }
    setBusyId("reset-billing");
    try {
      await billingApi.resetBilling();
      toast.success("Billing test data reset");
      await loadBilling();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to reset billing");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p style={{ color: "var(--text-secondary)" }}>Loading billing...</p>;
  }

  return (
    <div className="space-y-6">
      <style>{`
        .promo-ticker {
          min-height: 40px;
          position: relative;
        }

        .promo-ticker::before {
          animation: promoFlash 1.8s ease-in-out infinite;
          content: "";
          inset: 0;
          pointer-events: none;
          position: absolute;
        }

        .promo-ticker-track {
          align-items: center;
          display: flex;
          gap: 2rem;
          min-width: max-content;
          padding: 0.65rem 0;
          white-space: nowrap;
        }

        .promo-ticker-track span {
          color: var(--text-primary);
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .promo-ticker-separator {
          color: var(--accent);
          display: inline-block;
          padding: 0 1rem;
        }

        .promo-ticker-right {
          animation: promoSlideRight 18s linear infinite;
        }

        .promo-ticker-left {
          animation: promoSlideLeft 18s linear infinite;
        }

        @keyframes promoSlideRight {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes promoSlideLeft {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @keyframes promoFlash {
          0%,
          100% {
            background-color: transparent;
          }
          50% {
            background-color: color-mix(in srgb, var(--accent) 18%, transparent);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .promo-ticker::before,
          .promo-ticker-left,
          .promo-ticker-right {
            animation: none;
          }

          .promo-ticker-track {
            transform: none;
          }
        }
      `}</style>
      <div>
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Billing
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Manual ZAR billing for subscriptions, order fees, and proof of
          payment.
        </p>
      </div>

      {isAdmin && (
        <section
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <details>
            <summary
              className="cursor-pointer font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Admin billing controls
            </summary>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p
                className="max-w-2xl text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Development tools for duplicate requests and billing test data.
              </p>
              <Button
                variant="outline"
                themed
                disabled={busyId === "reset-billing"}
                isLoading={busyId === "reset-billing"}
                onClick={resetBilling}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset billing
              </Button>
            </div>
          </details>
        </section>
      )}

      {pricingCards.length > 0 && (
        <section className="space-y-3">
          {showRunnerTrial && (
            <div
              className="rounded-lg border p-4"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--accent) 10%, var(--card-bg))",
                borderColor: "var(--accent)",
              }}
            >
              <p
                className="text-xs font-semibold uppercase"
                style={{ color: "var(--accent)" }}
              >
                Free trial included
              </p>
              <h2
                className="mt-1 text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {runnerTrialHeadline}
              </h2>
              <p
                className="mt-1 max-w-3xl text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {runnerTrialCopy}
              </p>
              <ul
                className="mt-4 grid gap-2 text-sm sm:grid-cols-2"
                style={{ color: "var(--text-secondary)" }}
              >
                {runnerSharedBenefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2">
                    <CheckCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="sr-only">{promoTickerText}</p>
          <PromoTicker direction="right" />
          <div
            className="grid w-full gap-4"
            style={{
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
            }}
          >
            {pricingCards.map(({ key, title, plan, cyclePlans }) => (
              <div
                key={key}
                className="w-full rounded-lg border p-4"
                style={{
                  backgroundColor: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard
                    className="h-5 w-5"
                    style={{ color: "var(--accent)" }}
                  />
                  <h2
                    className="font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title || plan.name}
                  </h2>
                </div>
                {cyclePlans && (
                  <div
                    className="mb-3 grid grid-cols-2 gap-1 rounded-md border p-1"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    {[
                      {
                        label: "Weekly",
                        value: "WEEKLY",
                        plan: cyclePlans.weekly,
                      },
                      {
                        label: "Monthly",
                        value: "MONTHLY",
                        plan: cyclePlans.monthly,
                      },
                    ].map((option) => {
                      const selected = billingCycleValue(plan) === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!option.plan}
                          className="rounded px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                          style={{
                            backgroundColor: selected
                              ? "var(--accent)"
                              : "transparent",
                            color: selected
                              ? "var(--accent-foreground, #ffffff)"
                              : "var(--text-secondary)",
                          }}
                          onClick={() =>
                            setRunnerCycleSelections((current) => ({
                              ...current,
                              [key]: option.value as "WEEKLY" | "MONTHLY",
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p
                  className="mb-3 rounded-md px-3 py-2 text-sm font-medium"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--accent) 10%, transparent)",
                    color: "var(--text-primary)",
                  }}
                >
                  {planCatchPhrase(plan)}
                </p>
                <div className="space-y-1">
                  <p
                    className="text-sm line-through"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {planComparisonLabel(plan)}
                  </p>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: "var(--accent)" }}
                  >
                    {formatCurrency(plan.monthlyPrice)}
                    <span
                      className="text-sm font-normal"
                      style={{ color: "var(--text-muted)" }}
                    >
                      /{billingCycleLabel(plan)}
                    </span>
                  </p>
                  <p
                    className="text-xs font-semibold uppercase"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {planSavingsLabel(plan)}
                  </p>
                </div>
                {plan.description && (
                  <p
                    className="mt-2 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {plan.description}
                  </p>
                )}
                {planFeatures(plan).length > 0 && (
                  <ul
                    className="mt-3 space-y-1 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {planFeatures(plan)
                      .slice(0, 4)
                      .map((feature: string) => (
                        <li key={feature} className="flex gap-2">
                          <CheckCircle
                            className="mt-0.5 h-4 w-4 shrink-0"
                            style={{ color: "var(--accent)" }}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    {planFeatures(plan).length > 4 && (
                      <li key="more-features" className="flex gap-2">
                        <details>
                          <summary
                            className="cursor-pointer text-sm font-medium"
                            style={{ color: "var(--accent)" }}
                          >
                            More features
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {planFeatures(plan)
                              .slice(4)
                              .map((feature: string) => (
                                <li key={feature} className="flex gap-2">
                                  <CheckCircle
                                    className="mt-0.5 h-4 w-4 shrink-0"
                                    style={{ color: "var(--accent)" }}
                                  />
                                  <span>{feature}</span>
                                </li>
                              ))}
                          </ul>
                        </details>
                      </li>
                    )}
                  </ul>
                )}
                {(Number(plan.priceEditingAddonPrice || 0) > 0 ||
                  Number(plan.shopPriceImageAddonPrice || 0) > 0 ||
                  Number(plan.automationAddonPrice || 0) > 0) && (
                  <details className="mt-3" open={isAdmin}>
                    <summary
                      className="cursor-pointer text-sm font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      Extras
                    </summary>
                    <div className="mt-2 space-y-2">
                      {Number(plan.priceEditingAddonPrice || 0) > 0 &&
                        (isAdmin ? (
                          <p
                            className="rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            Add runner price editing/calculation for{" "}
                            {formatCurrency(plan.priceEditingAddonPrice)}/
                            {billingCycleLabel(plan)}
                          </p>
                        ) : (
                          <label
                            className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(
                                priceEditingSelections[plan.code],
                              )}
                              onChange={(event) =>
                                setPriceEditingSelections((current) => ({
                                  ...current,
                                  [plan.code]: event.target.checked,
                                }))
                              }
                            />
                            <span>
                              Add runner price editing/calculation for{" "}
                              {formatCurrency(plan.priceEditingAddonPrice)}/
                              {billingCycleLabel(plan)}
                            </span>
                          </label>
                        ))}
                      {Number(plan.shopPriceImageAddonPrice || 0) > 0 &&
                        (isAdmin ? (
                          <p
                            className="rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            Attach shop price to each image for{" "}
                            {formatCurrency(plan.shopPriceImageAddonPrice)}/
                            {billingCycleLabel(plan)}
                          </p>
                        ) : (
                          <label
                            className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(
                                shopPriceImageSelections[plan.code],
                              )}
                              onChange={(event) =>
                                setShopPriceImageSelections((current) => ({
                                  ...current,
                                  [plan.code]: event.target.checked,
                                }))
                              }
                            />
                            <span>
                              Attach shop price to each image for{" "}
                              {formatCurrency(plan.shopPriceImageAddonPrice)}/
                              {billingCycleLabel(plan)}
                            </span>
                          </label>
                        ))}
                      {Number(plan.automationAddonPrice || 0) > 0 &&
                        (isAdmin ? (
                          <p
                            className="rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            Extra reposting capacity: +10 source groups and{" "}
                            {capacityDeliveryText(plan)} repost deliveries for{" "}
                            {formatCurrency(plan.automationAddonPrice)}/
                            {billingCycleLabel(plan)}
                          </p>
                        ) : (
                          <label
                            className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
                            style={{
                              borderColor: "var(--card-border)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={Boolean(addonSelections[plan.code])}
                              onChange={(event) =>
                                setAddonSelections((current) => ({
                                  ...current,
                                  [plan.code]: event.target.checked,
                                }))
                              }
                            />
                            <span>
                              Extra reposting capacity: +10 source groups and{" "}
                              {capacityDeliveryText(plan)} repost deliveries for{" "}
                              {formatCurrency(plan.automationAddonPrice)}/
                              {billingCycleLabel(plan)}
                            </span>
                          </label>
                        ))}
                    </div>
                  </details>
                )}
                {isAdmin ? (
                  <p
                    className="mt-4 text-xs font-medium uppercase"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Visible to {plan.audience.replace("_", " ").toLowerCase()}s
                  </p>
                ) : (
                  <Button
                    className="mt-4 w-full"
                    themed
                    disabled={busyId === plan.code}
                    isLoading={busyId === plan.code}
                    onClick={() => createSubscription(plan.code)}
                  >
                    {scope === "RUNNER" ? "Choose after trial" : "Subscribe"}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <PromoTicker direction="left" />
        </section>
      )}

      {!isAdmin && (
        <section
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="mb-3 flex items-center gap-2 font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            <CheckCircle
              className="h-5 w-5"
              style={{ color: "var(--accent)" }}
            />
            Subscriptions
          </h2>
          {visibleSubscriptions.length === 0 ? (
            <div className="space-y-1">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No subscription yet.
              </p>
              {showRunnerTrial && (
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Your Phase 1 pilot starts with a free 2-week trial. Pick a
                  plan when you are ready to continue posting to customer groups
                  after the trial.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSubscriptions.map((subscription: any) => (
                <div
                  key={subscription.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {subscription.plan?.name || subscription.audience}
                        </p>
                        <StatusBadge status={subscription.status} />
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatCurrency(subscription.monthlyPrice)}/
                        {billingCycleLabel(subscription)}
                        {subscriptionAddonSummary(subscription)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={subscription.plan?.code || ""}
                        onChange={(event) =>
                          changePlan(subscription, event.target.value)
                        }
                        disabled={busyId === subscription.id}
                        className="rounded border px-3 py-2 text-sm"
                      >
                        {plans
                          .filter(
                            (plan) => plan.audience === subscription.audience,
                          )
                          .map((plan) => (
                            <option key={plan.code} value={plan.code}>
                              {plan.name}
                            </option>
                          ))}
                      </select>
                      {subscription.status === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          isLoading={busyId === subscription.id}
                          onClick={() => generateInvoice(subscription.id)}
                        >
                          Generate invoice
                        </Button>
                      )}
                      {subscription.status === "PENDING" && isAdmin && (
                        <>
                          <Button
                            size="sm"
                            themed
                            disabled={busyId === subscription.id}
                            onClick={() =>
                              updateSubscriptionStatus(subscription, "ACTIVE")
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            themed
                            disabled={busyId === subscription.id}
                            onClick={() =>
                              updateSubscriptionStatus(subscription, "REJECTED")
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {subscription.status === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() =>
                            updateSubscriptionStatus(subscription, "PAUSED")
                          }
                        >
                          <PauseCircle className="mr-1 h-4 w-4" />
                          Pause
                        </Button>
                      )}
                      {subscription.status === "PAUSED" && isAdmin && (
                        <Button
                          size="sm"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() =>
                            updateSubscriptionStatus(subscription, "ACTIVE")
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                      {!["CANCELLED", "REJECTED"].includes(
                        subscription.status,
                      ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() =>
                            updateSubscriptionStatus(subscription, "CANCELLED")
                          }
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Cancel
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() => deleteSubscription(subscription)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--card-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <h2
            className="mb-3 flex items-center gap-2 font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            <CheckCircle
              className="h-5 w-5"
              style={{ color: "var(--accent)" }}
            />
            Subscriptions
          </h2>
          {visibleSubscriptions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No subscriptions yet.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleSubscriptions.map((subscription: any) => (
                <div
                  key={subscription.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {subscription.user?.name ||
                            subscription.user?.phone ||
                            "User"}
                        </p>
                        <StatusBadge status={subscription.status} />
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {subscription.plan?.name || subscription.audience} ·{" "}
                        {formatCurrency(subscription.monthlyPrice)}/
                        {billingCycleLabel(subscription)}
                        {subscriptionAddonSummary(subscription)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={subscription.plan?.code || ""}
                        onChange={(event) =>
                          changePlan(subscription, event.target.value)
                        }
                        disabled={busyId === subscription.id}
                        className="rounded border px-3 py-2 text-sm"
                      >
                        {plans
                          .filter(
                            (plan) => plan.audience === subscription.audience,
                          )
                          .map((plan) => (
                            <option key={plan.code} value={plan.code}>
                              {plan.name}
                            </option>
                          ))}
                      </select>
                      {subscription.status === "PENDING" && (
                        <>
                          <Button
                            size="sm"
                            themed
                            disabled={busyId === subscription.id}
                            onClick={() =>
                              updateSubscriptionStatus(subscription, "ACTIVE")
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            themed
                            disabled={busyId === subscription.id}
                            onClick={() =>
                              updateSubscriptionStatus(subscription, "REJECTED")
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {subscription.status !== "ACTIVE" &&
                        !["CANCELLED", "REJECTED"].includes(
                          subscription.status,
                        ) && (
                          <Button
                            size="sm"
                            themed
                            disabled={busyId === subscription.id}
                            onClick={() =>
                              updateSubscriptionStatus(subscription, "ACTIVE")
                            }
                          >
                            Activate
                          </Button>
                        )}
                      {subscription.status === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() =>
                            updateSubscriptionStatus(subscription, "PAUSED")
                          }
                        >
                          Pause
                        </Button>
                      )}
                      {!["CANCELLED", "REJECTED"].includes(
                        subscription.status,
                      ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          themed
                          disabled={busyId === subscription.id}
                          onClick={() =>
                            updateSubscriptionStatus(subscription, "CANCELLED")
                          }
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        themed
                        disabled={busyId === subscription.id}
                        onClick={() => deleteSubscription(subscription)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="mb-3 flex items-center gap-2 font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <FileText className="h-5 w-5" style={{ color: "var(--accent)" }} />
          Invoices
        </h2>
        {visibleInvoices.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No invoices yet.
          </p>
        ) : (
          <div className="space-y-4">
            {visibleInvoices.map((invoice: any) => {
              const draft = paymentDrafts[invoice.id] || {};
              return (
                <div
                  key={invoice.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {invoice.invoiceNumber} ·{" "}
                        {formatCurrency(invoice.total)}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {invoice.subscription?.plan?.name ||
                          invoice.user?.name ||
                          invoice.status}{" "}
                        · {invoice.status}
                      </p>
                      {invoice.notes && (
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {invoice.notes}
                        </p>
                      )}
                      <div
                        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span>
                          Subscription {formatCurrency(invoice.monthlyFee || 0)}
                        </span>
                        <span>
                          Capacity add-on{" "}
                          {formatCurrency(invoice.automationAddonFee || 0)}
                        </span>
                        <span>
                          Phase 2 add-on{" "}
                          {formatCurrency(invoice.orderWorkflowAddonFee || 0)}
                        </span>
                        <span>
                          Price editing{" "}
                          {formatCurrency(invoice.priceEditingAddonFee || 0)}
                        </span>
                        <span>
                          Shop-price images{" "}
                          {formatCurrency(invoice.shopPriceImageAddonFee || 0)}
                        </span>
                        <span>
                          Verified-order fees{" "}
                          {formatCurrency(invoice.orderFees || 0)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${invoice.status === "PAID" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                    >
                      {invoice.status}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {invoice.status !== "PAID" && (
                        <Button
                          size="sm"
                          themed
                          disabled={busyId === invoice.id}
                          onClick={() => updateInvoiceStatus(invoice, "PAID")}
                        >
                          Mark paid
                        </Button>
                      )}
                      {!["VOID", "CANCELLED", "REJECTED"].includes(
                        invoice.status,
                      ) && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            themed
                            disabled={busyId === invoice.id}
                            onClick={() => updateInvoiceStatus(invoice, "VOID")}
                          >
                            Void
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            themed
                            disabled={busyId === invoice.id}
                            onClick={() =>
                              updateInvoiceStatus(invoice, "REJECTED")
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        themed
                        disabled={busyId === invoice.id}
                        onClick={() => deleteInvoice(invoice)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete invoice
                      </Button>
                    </div>
                  )}

                  {!isAdmin && invoice.status !== "PAID" && (
                    <div className="mt-3 grid gap-2 md:grid-cols-6">
                      <input
                        value={draft.amount ?? invoice.total}
                        onChange={(event) =>
                          updateDraft(invoice.id, "amount", event.target.value)
                        }
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Amount"
                      />
                      <select
                        value={draft.method || "EFT"}
                        onChange={(event) =>
                          updateDraft(invoice.id, "method", event.target.value)
                        }
                        className="rounded border px-3 py-2 text-sm"
                      >
                        {methodOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.reference || ""}
                        onChange={(event) =>
                          updateDraft(
                            invoice.id,
                            "reference",
                            event.target.value,
                          )
                        }
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Reference"
                      />
                      <input
                        value={draft.runnerReference || ""}
                        onChange={(event) =>
                          updateDraft(
                            invoice.id,
                            "runnerReference",
                            event.target.value,
                          )
                        }
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Runner ref"
                      />
                      <input
                        value={draft.proofUrl || ""}
                        onChange={(event) =>
                          updateDraft(
                            invoice.id,
                            "proofUrl",
                            event.target.value,
                          )
                        }
                        className="rounded border px-3 py-2 text-sm"
                        placeholder="Proof URL/path"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          updateDraft(
                            invoice.id,
                            "proofFile",
                            event.target.files?.[0] || null,
                          )
                        }
                        className="rounded border px-3 py-2 text-sm"
                      />
                      <textarea
                        value={draft.proofText || ""}
                        onChange={(event) =>
                          updateDraft(
                            invoice.id,
                            "proofText",
                            event.target.value,
                          )
                        }
                        className="rounded border px-3 py-2 text-sm md:col-span-5"
                        placeholder="Paste SMS/payment notification text"
                        rows={2}
                      />
                      <Button
                        themed
                        disabled={busyId === invoice.id}
                        isLoading={busyId === invoice.id}
                        onClick={() => submitPayment(invoice)}
                      >
                        Submit proof
                      </Button>
                    </div>
                  )}

                  {invoice.manualPayments?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {invoice.manualPayments.map((payment: any) => (
                        <div
                          key={payment.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--card-border)" }}
                        >
                          <div
                            className="max-w-3xl space-y-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <p>
                              {payment.method} ·{" "}
                              {formatCurrency(payment.amount)} ·{" "}
                              {payment.reference || "No ref"} · {payment.status}
                            </p>
                            <p className="text-xs">
                              Source: {payment.source || "WEB"} · Runner ref:{" "}
                              {payment.runnerReference || "Not supplied"}
                            </p>
                            {payment.proofText && (
                              <p className="whitespace-pre-wrap text-xs">
                                {payment.proofText}
                              </p>
                            )}
                            {payment.notes && (
                              <p className="text-xs">Notes: {payment.notes}</p>
                            )}
                            {[
                              ...(Array.isArray(payment.proofImageUrls)
                                ? payment.proofImageUrls
                                : []),
                              payment.proofUrl,
                            ]
                              .filter(Boolean)
                              .map((url: string) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mr-2 inline-block text-xs underline"
                                  style={{ color: "var(--accent)" }}
                                >
                                  View proof
                                </a>
                              ))}
                          </div>
                          {isAdmin && payment.status === "PENDING" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                themed
                                disabled={busyId === payment.id}
                                onClick={() =>
                                  verifyPayment(payment.id, "VERIFIED")
                                }
                              >
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                themed
                                disabled={busyId === payment.id}
                                onClick={() =>
                                  verifyPayment(payment.id, "REJECTED")
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                          {isAdmin && payment.status !== "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              disabled={busyId === payment.id}
                              onClick={() => deleteManualPayment(payment)}
                            >
                              Delete
                            </Button>
                          )}
                          {isAdmin && payment.status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              themed
                              disabled={busyId === payment.id}
                              onClick={() => deleteManualPayment(payment)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="mb-3 flex items-center gap-2 font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <ReceiptText className="h-5 w-5" style={{ color: "var(--accent)" }} />
          Verified-order fee ledger
        </h2>
        <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          One immutable charge per verified paid order. Reversed charges remain
          visible for audit.
        </p>
        {billingEvents.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No verified-order fees yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead style={{ color: "var(--text-secondary)" }}>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--card-border)" }}
                >
                  <th className="px-2 py-2">Order</th>
                  {isAdmin && <th className="px-2 py-2">Runner</th>}
                  <th className="px-2 py-2">Verified</th>
                  <th className="px-2 py-2">Fee</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {billingEvents.map((event: any) => (
                  <tr
                    key={event.id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <td
                      className="px-2 py-2 font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      #{String(event.orderId).slice(-8)}
                    </td>
                    {isAdmin && (
                      <td
                        className="px-2 py-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {event.runner?.user?.name ||
                          event.runner?.user?.phone ||
                          "Runner"}
                      </td>
                    )}
                    <td
                      className="px-2 py-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {new Date(event.effectiveAt).toLocaleString()}
                    </td>
                    <td
                      className="px-2 py-2 font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCurrency(event.amount)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={event.status} />
                    </td>
                    <td
                      className="px-2 py-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {event.invoice?.invoiceNumber || "Not invoiced"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <h2
          className="mb-2 flex items-center gap-2 font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          <ReceiptText className="h-5 w-5" style={{ color: "var(--accent)" }} />
          Manual payment methods
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          EFT, MTN MoMo, cash deposit, and other manual references are
          supported. Platform fees are billed to the runner and are not added to
          the customer product total. Amounts are stored in ZAR and displayed as
          R.
        </p>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "PENDING").toUpperCase();
  const className =
    normalized === "ACTIVE" ||
    normalized === "PAID" ||
    normalized === "VERIFIED"
      ? "bg-green-100 text-green-800"
      : ["PENDING", "ISSUED", "CHARGEABLE", "CREDIT_PENDING"].includes(
            normalized,
          )
        ? "bg-yellow-100 text-yellow-800"
        : normalized === "PAUSED" || normalized === "INVOICED"
          ? "bg-blue-100 text-blue-800"
          : normalized === "REVERSED"
            ? "bg-gray-100 text-gray-700"
            : "bg-red-100 text-red-800";

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}
    >
      {normalized}
    </span>
  );
}
