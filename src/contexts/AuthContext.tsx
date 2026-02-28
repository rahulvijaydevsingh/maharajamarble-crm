import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "super_admin" | "admin" | "manager" | "sales_user" | "sales_viewer" | "field_agent";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile - using type assertion since types may not be regenerated yet
      const { data: profileData } = await (supabase
        .from("profiles" as any)
        .select("*")
        .eq("id", userId)
        .single() as any);

      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch role - try RPC first, fallback to direct query
      const { data: roleData } = await (supabase.rpc as any)("get_user_role", { _user_id: userId });

      if (roleData) {
        setRole(roleData as AppRole);
      } else {
        // Fallback: direct query to user_roles table
        const { data: roleRow } = await (supabase
          .from("user_roles" as any)
          .select("role")
          .eq("user_id", userId)
          .single() as any);
        if (roleRow?.role) {
          setRole(roleRow.role as AppRole);
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  // Daily login logging helper
  const logDailyLogin = async (sess: Session) => {
    const todayKey = `login_logged_${sess.user.id}_${new Date().toISOString().split("T")[0]}`;
    if (sessionStorage.getItem(todayKey)) return;
    sessionStorage.setItem(todayKey, "1");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("log-login", {
        body: {
          user_id: sess.user.id,
          user_email: sess.user.email || "",
          user_agent: navigator.userAgent,
        },
      });

      if (fnError) {
        console.error("Daily login log failed:", fnError);
        return;
      }

      // Set clock-in prompt flag if applicable
      if (data?.first_login_today && data?.should_prompt_clock_in) {
        sessionStorage.setItem("should_prompt_clock_in", "true");
      }
    } catch (e) {
      console.error("Daily login logging error:", e);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer Supabase calls with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
          // Log daily login for session restores too
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
            setTimeout(() => logDailyLogin(session), 100);
          }
        } else {
          setProfile(null);
          setRole(null);
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
        // Also trigger daily login for persisted sessions
        setTimeout(() => logDailyLogin(session), 100);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Daily login will be handled by onAuthStateChange SIGNED_IN event
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName || email,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (checkRole: AppRole): boolean => {
    if (!role) return false;
    
    const roleHierarchy: AppRole[] = [
      "super_admin",
      "admin",
      "manager",
      "sales_user",
      "field_agent",
      "sales_viewer",
    ];
    
    const userRoleIndex = roleHierarchy.indexOf(role);
    const checkRoleIndex = roleHierarchy.indexOf(checkRole);
    
    return userRoleIndex <= checkRoleIndex;
  };

  const isAdmin = (): boolean => {
    return role === "super_admin" || role === "admin";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
