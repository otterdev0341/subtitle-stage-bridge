import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RadioTower } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/GoogleButton";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { takeNextPath } from "@/lib/auth-redirect";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "เข้าสู่ระบบ — Live Relay" },
      { name: "description", content: "เข้าสู่ระบบเพื่อจัดการห้องถ่ายทอดสด ลิงก์แชร์จอ และการแปลสด" },
      { property: "og:title", content: "เข้าสู่ระบบ — Live Relay" },
      { property: "og:description", content: "เข้าสู่ระบบเพื่อใช้ห้องถ่ายทอดสดของคุณ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");

  useEffect(() => {
    const go = () => void navigate({ to: takeNextPath() as "/rooms", replace: true });
    void supabase.auth.getUser().then(({ data }) => data.user && go());
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { display_name: name.trim() } },
        });
        if (error) throw error;
        setSent("ส่งอีเมลยืนยันแล้ว กรุณากดลิงก์ในอีเมลเพื่อเริ่มใช้งาน");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) {
      toast.error("เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
      setBusy(false);
    }
  };

  const title = mode === "signin" ? "เข้าสู่ระบบ" : mode === "signup" ? "สร้างบัญชี" : "ลืมรหัสผ่าน";
  return (
    <main className="relay-auth">
      <div className="relay-auth-card">
        <Link to="/" className="relay-brand">
          <span className="relay-brand-mark">
            <RadioTower size={18} />
          </span>
          <span>
            live<span className="relay-brand-light"> relay</span>
          </span>
        </Link>
        <h1>{title}</h1>
        {sent ? (
          <p className="relay-auth-note">{sent}</p>
        ) : (
          <>
            {mode !== "forgot" && (
              <>
                <GoogleButton onClick={() => void google()} disabled={busy} />
                <div className="relay-auth-or">หรือใช้อีเมล</div>
              </>
            )}
            <form onSubmit={(e) => void submit(e)} className="relay-auth-form">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name">ชื่อที่แสดง</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
                </div>
              )}
              <div>
                <Label htmlFor="email">อีเมล</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {mode !== "forgot" && (
                <div>
                  <Label htmlFor="password">รหัสผ่าน</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}
              <Button type="submit" disabled={busy} className="w-full">
                {mode === "signin" ? "เข้าสู่ระบบ" : mode === "signup" ? "สร้างบัญชี" : "ส่งลิงก์ตั้งรหัสใหม่"}
              </Button>
            </form>
          </>
        )}
        <div className="relay-auth-links">
          {mode !== "signin" && <button type="button" onClick={() => { setMode("signin"); setSent(""); }}>มีบัญชีแล้ว? เข้าสู่ระบบ</button>}
          {mode !== "signup" && <button type="button" onClick={() => { setMode("signup"); setSent(""); }}>ยังไม่มีบัญชี? สร้างบัญชี</button>}
          {mode === "signin" && <button type="button" onClick={() => setMode("forgot")}>ลืมรหัสผ่าน</button>}
        </div>
      </div>
    </main>
  );
}
