// frontend/app/runner/register/page.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runnerApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Truck, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function RunnerRegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    vehicleType: "",
    vehicleNumber: "",
    phone: "",
    serviceArea: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await runnerApi.register(formData);
      toast.success(
        "Runner registration submitted! Waiting for admin approval.",
      );
      router.push("/");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <h1
          className="text-3xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Become a Runner
        </h1>
        <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
          Earn money by delivering orders and promoting products
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Vehicle Type *
            </label>
            <div className="relative">
              <Input
                value={formData.vehicleType}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleType: e.target.value })
                }
                placeholder="e.g., Bicycle, Motorcycle, Car"
                required
                className="pl-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <Truck
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Vehicle Number (Optional)
            </label>
            <div className="relative">
              <Input
                value={formData.vehicleNumber}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleNumber: e.target.value })
                }
                placeholder="e.g., ABC123"
                className="pl-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <Truck
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Contact Phone (Optional)
            </label>
            <div className="relative">
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+26876123456"
                className="pl-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <Phone
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Service Area (Optional)
            </label>
            <div className="relative">
              <Input
                value={formData.serviceArea}
                onChange={(e) =>
                  setFormData({ ...formData, serviceArea: e.target.value })
                }
                placeholder="e.g., Mbabane, Manzini"
                className="pl-12"
                style={{
                  backgroundColor: "var(--input-bg)",
                  color: "var(--text-primary)",
                  borderColor: "var(--input-border)",
                }}
              />
              <MapPin
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: "var(--accent)" }}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full py-4 text-lg"
            isLoading={isLoading}
            themed
          >
            {isLoading ? "Registering..." : "Become a Runner"}
          </Button>
        </form>

        <div
          className="mt-6 p-4 rounded-lg"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            💰 How Runners Earn:
          </h3>
          <ul
            className="space-y-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <li>• Add markup to products (10-50%)</li>
            <li>• Share product links on WhatsApp</li>
            <li>• Earn commission on every sale</li>
            <li>• Get paid directly to your wallet</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
