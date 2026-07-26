"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { systemApi } from "@/lib/api";

type FeatureFlags = {
  phase1Enabled: boolean;
  phase2Enabled: boolean;
  whatsappOrderTrackingEnabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const FeatureFlagsContext = createContext<FeatureFlags | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState({
    phase1Enabled: true,
    phase2Enabled: process.env.NEXT_PUBLIC_ENABLE_PHASE_2 === "true",
    whatsappOrderTrackingEnabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await systemApi.getFeatures();
      setFlags({
        phase1Enabled: response.data.phase1Enabled !== false,
        phase2Enabled: response.data.phase2Enabled === true,
        whatsappOrderTrackingEnabled:
          response.data.whatsappOrderTrackingEnabled === true,
      });
    } catch {
      // Keep the conservative build-time fallback when the API is unavailable.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ ...flags, isLoading, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error("useFeatureFlags must be used within FeatureFlagsProvider");
  }
  return context;
}
