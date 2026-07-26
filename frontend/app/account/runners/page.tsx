"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { customersApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const CITIES = ["DURBAN", "JOHANNESBURG", "MAPUTO"] as const;

export default function TrustedRunnersPage() {
  const [preferences, setPreferences] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const response = await customersApi.getRunnerPreferences();
    setPreferences(response.data || []);
    setDrafts(Object.fromEntries((response.data || []).map((item: any) => [item.city, item.runnerPhone])));
  };
  useEffect(() => { load().catch(() => toast.error("Could not load trusted runners")); }, []);

  const save = async (city: string) => {
    const existing = preferences.find((item) => item.city === city && item.status !== "INACTIVE");
    if (existing && existing.runnerPhone !== drafts[city] && !confirm(`Replace your ${city.toLowerCase()} runner? Orders for this city will use the new runner only.`)) return;
    setBusy(city);
    try {
      const response = await customersApi.setRunnerPreference(city, drafts[city] || "");
      toast.success(response.data.status === "MATCHED" ? "Trusted runner matched" : "Runner saved. We will match them when they register.");
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save runner");
    } finally { setBusy(null); }
  };

  const remove = async (city: string) => {
    if (!confirm(`Remove your ${city.toLowerCase()} runner? Checkout for this city will be unavailable.`)) return;
    setBusy(city);
    try { await customersApi.removeRunnerPreference(city); await load(); toast.success("Runner preference removed"); }
    catch (error: any) { toast.error(error.response?.data?.message || "Could not remove runner"); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div><h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>My Trusted Runners</h1><p className="mt-2" style={{ color: "var(--text-secondary)" }}>Choose one runner per shopping city. The same runner may serve more than one city.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        {CITIES.map((city) => {
          const preference = preferences.find((item) => item.city === city && item.status !== "INACTIVE");
          const matched = preference?.status === "MATCHED";
          return <section key={city} className="rounded-lg border p-4" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)" }}>
            <div className="flex items-center justify-between gap-2"><h2 className="font-bold" style={{ color: "var(--text-primary)" }}>{city[0] + city.slice(1).toLowerCase()}</h2>{preference && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${matched ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{matched ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{matched ? "Matched" : "Pending"}</span>}</div>
            {matched && <p className="mt-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{preference.runner?.user?.name || "Registered runner"}</p>}
            <label className="mt-4 block text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Runner WhatsApp</label>
            <div className="relative mt-1"><Phone className="absolute left-3 top-3 h-4 w-4" /><input value={drafts[city] || ""} onChange={(e) => setDrafts((current) => ({ ...current, [city]: e.target.value }))} className="theme-input min-h-11 w-full rounded-md border pl-10 pr-3" placeholder="+268..." /></div>
            <div className="mt-3 flex gap-2"><Button size="sm" themed isLoading={busy === city} onClick={() => save(city)}>Save</Button>{preference && <Button size="sm" variant="outline" themed aria-label={`Remove ${city} runner`} onClick={() => remove(city)}><Trash2 className="h-4 w-4" /></Button>}</div>
          </section>;
        })}
      </div>
    </div>
  );
}
