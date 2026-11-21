import { LoaderCircle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CloseRoomDialog({ open, onOpenChange, roomName, pending, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName?: string;
  pending: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const confirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller displays the mutation error; keep the dialog open for retry.
    }
  };
  return <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>ยืนยันการปิดห้อง</AlertDialogTitle>
        <AlertDialogDescription>
          {roomName ? `ต้องการปิดห้อง “${roomName}” ใช่ไหม?` : "ต้องการปิดห้องนี้ใช่ไหม?"}
          {" "}ภาพจากทุกเครื่องและการแปลสดจะหยุด ผู้เข้าร่วมจะส่งภาพไม่ได้จนกว่าคุณจะเปิดห้องอีกครั้ง
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>ยกเลิก</AlertDialogCancel>
        <Button variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <LoaderCircle className="animate-spin" size={16} /> : <Power size={16} />}
          {pending ? "กำลังปิดห้อง…" : "ยืนยันปิดห้อง"}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}