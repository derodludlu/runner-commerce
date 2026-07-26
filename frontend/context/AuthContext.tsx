"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, AuthResponse, LoginCredentials } from "@/lib/types";
import { adminApi, authApi } from "@/lib/api";
import { usePathname } from "next/navigation";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  refreshUser: () => Promise<User>;
  startRunnerImpersonation: (runnerId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Cookie helpers — non-httpOnly so Next.js middleware can read user_role ──
function setRoleCookie(role: string) {
  document.cookie = `user_role=${role}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

function clearRoleCookie() {
  document.cookie = "user_role=; path=/; max-age=0";
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from the httpOnly auth cookie.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const currentUser = await authApi.me();
        if (!cancelled) {
          setUser(currentUser);
          setToken("cookie");
          setRoleCookie(currentUser.role);
        }
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("auth_token");
        clearRoleCookie();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      user?.mustChangePassword &&
      !user?.impersonation?.active &&
      pathname !== "/account/security" &&
      pathname !== "/login"
    ) {
      window.location.href = "/account/security?required=1";
    }
  }, [pathname, user?.impersonation?.active, user?.mustChangePassword]);

  const login = async (
    credentials: LoginCredentials,
  ): Promise<AuthResponse> => {
    const response = await authApi.login(credentials);
    setUser(response.user);
    setToken("cookie");
    // Set a readable cookie so Edge middleware can enforce role-based routing
    setRoleCookie(response.user.role);
    return response;
  };

  const refreshUser = async () => {
    const currentUser = await authApi.me();
    setUser(currentUser);
    setToken("cookie");
    setRoleCookie(currentUser.role);
    return currentUser;
  };

  const startRunnerImpersonation = async (runnerId: string) => {
    if (user?.role !== "SUPERUSER") {
      throw new Error("Only SUPERUSER can impersonate runner accounts");
    }

    const impersonationResponse = await adminApi.impersonateRunner(runnerId);
    const { accessToken, user: impersonatedUser } = impersonationResponse.data;
    localStorage.setItem("auth_token", accessToken);
    localStorage.setItem("user", JSON.stringify(impersonatedUser));
    setUser(impersonatedUser);
    setToken(accessToken);
    setRoleCookie(impersonatedUser.role);
  };

  const stopImpersonation = async () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    const currentUser = await authApi.me();
    setUser(currentUser);
    setToken("cookie");
    setRoleCookie(currentUser.role);
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    setToken(null);
    clearRoleCookie();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        refreshUser,
        startRunnerImpersonation,
        stopImpersonation,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
