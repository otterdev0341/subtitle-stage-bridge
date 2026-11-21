/** Fixed public messages only; never surface provider response bodies or credentials. */
export const GEMINI_TOKEN_ERRORS = {
  missing: "ยังไม่ได้ใส่คีย์ Gemini ของระบบ",
  access: "Gemini ไม่อนุญาตให้เชื่อมต่อ กรุณาตรวจสิทธิ์ของคีย์",
  quota: "Gemini จำกัดการใช้งาน กรุณาตรวจโควตาหรือเครดิตก่อนเริ่มใหม่",
  unavailable: "Gemini ไม่พร้อมให้บริการชั่วคราว",
  invalid: "Gemini ไม่รับคำขอเชื่อมต่อ กรุณาลองใหม่ภายหลัง",
} as const;