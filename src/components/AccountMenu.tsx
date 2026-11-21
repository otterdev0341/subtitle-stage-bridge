import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

type AccountInfo = { name: string; email: string | null; avatarUrl: string | null };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase() || "?";
}

/** Signed-in user badge (avatar + name) with a dropdown for sign out; sign-in button when signed out. */
export function AccountMenu({ inverse = false }: { inverse?: boolean }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setSignedIn(!!data.user);
      if (!data.user) return setAccount(null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const meta = data.user.user_metadata as { avatar_url?: string; picture?: string } | undefined;
      setAccount({
        name: profile?.display_name || data.user.email || "บัญชีของฉัน",
        email: data.user.email ?? null,
        avatarUrl: meta?.avatar_url ?? meta?.picture ?? null,
      });
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
  const name = account?.name ?? "…";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`relay-account-badge${inverse ? " is-inverse" : ""}`} aria-label="เมนูบัญชี">
          <Avatar className="h-7 w-7">
            {account?.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={name} referrerPolicy="no-referrer" /> : null}
            <AvatarFallback>{initialsOf(name)}</AvatarFallback>
          </Avatar>
          <span className="relay-account-name" title={name}>
            {name}
          </span>
          <ChevronDown size={14} className="relay-account-chevron" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-semibold">{name}</span>
          {account?.email ? <span className="truncate text-xs font-normal text-muted-foreground">{account.email}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void signOut()}>
          <LogOut size={15} /> ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
