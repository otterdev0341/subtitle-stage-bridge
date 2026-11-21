import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "ตั้งรหัสผ่านใหม่ — Live Relay" },
      { name: "description", content: "ตั้งรหัสผ่านใหม่สำหรับบัญชี Live Relay" },
      { property: "og:title", content: "ตั้งรหัสผ่านใหม่ — Live Relay" },
      { property: "og:description", content: "ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("ตั้งรหัสผ่านใหม่แล้ว");
    void navigate({ to: "/rooms" });
  };
  return (
    <main className="relay-auth">
      <div className="relay-auth-card">
        <h1>ตั้งรหัสผ่านใหม่</h1>
        <form onSubmit={(e) => void save(e)} className="relay-auth-form">
          <div>
            <Label htmlFor="pw">รหัสผ่านใหม่</Label>
            <Input id="pw" type="password" minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full">บันทึกรหัสผ่าน</Button>
        </form>
      </div>
    </main>
  );
}
