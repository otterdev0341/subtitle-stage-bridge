import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** Signed-in name + sign out; renders a sign-in button when signed out. */
export function AccountMenu({ inverse = false }: { inverse?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setSignedIn(!!data.user);
      if (!data.user) return setName(null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (alive) setName(profile?.display_name || data.user.email || "บัญชีของฉัน");
    };
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  if (!signedIn)
    return (
      <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/auth" })}>
        เข้าสู่ระบบ
      </Button>
    );
  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };
  return (
    <div className={`relay-account${inverse ? " is-inverse" : ""}`}>
      <span className="relay-account-name" title={name ?? ""}>
        {name}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="ออกจากระบบ">
        <LogOut size={15} /> ออก
      </Button>
    </div>
  );
}
