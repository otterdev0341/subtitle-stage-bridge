import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Pencil, Plus, RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountMenu } from "@/components/AccountMenu";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({
    meta: [
      { title: "ห้องของฉัน — Live Relay" },
      { name: "description", content: "รายการห้องถ่ายทอดสดของคุณ สร้าง เปลี่ยนชื่อ และกลับเข้าห้องเดิมได้ทุกเครื่อง" },
      { property: "og:title", content: "ห้องของฉัน — Live Relay" },
      { property: "og:description", content: "จัดการห้องถ่ายทอดสดของคุณ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyRooms,
});

function MyRooms() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const rooms = useQuery({
    queryKey: ["rooms", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .insert({ owner_id: user.id, name: name.trim() || "ห้องใหม่" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) =>
      void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } }),
    onError: () => toast.error("สร้างห้องไม่สำเร็จ"),
  });
  const rename = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("rooms").update({ name: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: () => toast.error("เปลี่ยนชื่อไม่สำเร็จ"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rooms"] }),
    onError: () => toast.error("ลบห้องไม่สำเร็จ"),
  });

  return (
    <main className="relay-home min-h-screen px-5 py-6 sm:px-10 sm:py-9">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="relay-brand">
            <span className="relay-brand-mark">
              <RadioTower size={18} />
            </span>
            <span>
              live<span className="relay-brand-light">{" relay"}</span>
            </span>
          </Link>
          <AccountMenu />
        </header>
        <section className="relay-rooms">
          <h1>ห้องของฉัน</h1>
          <form
            className="relay-rooms-create"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่องาน เช่น สัมมนาประจำปี" maxLength={80} />
            <Button type="submit" disabled={create.isPending}>
              <Plus size={16} /> สร้างห้อง
            </Button>
          </form>
          {rooms.isLoading ? (
            <p className="relay-rooms-empty">กำลังโหลด…</p>
          ) : rooms.data?.length ? (
            <ul className="relay-rooms-list">
              {rooms.data.map((room) => (
                <li key={room.id}>
                  {editing === room.id ? (
                    <form
                      className="relay-rooms-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editName.trim()) rename.mutate({ id: room.id, value: editName.trim() });
                      }}
                    >
                      <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} />
                      <Button type="submit" size="sm">บันทึก</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </form>
                  ) : (
                    <>
                      <Link to="/room/$roomId" params={{ roomId: room.id }} search={{ view: "director" }} className="relay-rooms-link">
                        <strong>{room.name}</strong>
                        <span>แก้ไขล่าสุด {new Date(room.updated_at).toLocaleString("th-TH")}</span>
                      </Link>
                      <Button size="icon" variant="ghost" aria-label="เปลี่ยนชื่อ" onClick={() => { setEditing(room.id); setEditName(room.name); }}>
                        <Pencil size={15} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="ลบห้อง" onClick={() => window.confirm(`ลบห้อง "${room.name}"?`) && remove.mutate(room.id)}>
                        <Trash2 size={15} />
                      </Button>
                      <Button asChild size="icon" variant="outline" aria-label="เข้าห้อง">
                        <Link to="/room/$roomId" params={{ roomId: room.id }} search={{ view: "director" }}>
                          <ArrowUpRight size={15} />
                        </Link>
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="relay-rooms-empty">ยังไม่มีห้อง ตั้งชื่องานแล้วกด "สร้างห้อง" เพื่อเริ่ม</p>
          )}
        </section>
      </div>
    </main>
  );
}
