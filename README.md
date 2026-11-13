# Botnoi Live Relay

ต้องการสร้าง boradcast service โดย ส่ง link ไปยัง คอมอีก 2 เครื่อง ซึ่งเปิดแล้วจะแชร์จอ กลับมา,
โดยเครื่องแรก จะแชร์ เป็น presentation ใน canvase ซึ่งจะเปิดเต็มจอ มีการปรับ ขยับ, เครื่องที่สองจะเป็น translation จะเป็นจอดำ ๆ แล้วมีข้อความ, โดยแพลตฟอร์มจะต้องสามารถ ครอป ลาก ได้ เพราะต้องการจะพรีเซ็นในรูปแบบ subtitle มา overlay บน ที่เปิด presentaiton

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://subtitle-stage-bridge.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f3b9da4-9ec6-4072-ab75-d609d372567a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## การส่งภาพและควบคุมเวที

- เครื่อง A/B: กดเลือกจอ แล้วลากกรอบบน preview (หรือเลือกแถบคำบรรยาย) ตรวจภาพตัวอย่างก่อนกด **เริ่มส่งภาพเฉพาะส่วนนี้** ระบบส่ง canvas ที่ตัดภาพแล้วเท่านั้น
- ระหว่างส่ง: **ปรับพื้นที่ส่ง** เปิดกรอบฉบับร่าง ภาพเดิมยังส่งต่อจนกด **ใช้พื้นที่นี้**; **ยกเลิก** คงกรอบเดิมไว้
- หน้าควบคุม: เลือก A/B แล้วใช้ **จัดกรอบ Display** ย้าย/ปรับขนาดกรอบบนเวที หรือ **Crop ภาพ** เลือกส่วนของภาพที่ได้รับ พร้อมขยายภาพภายในกรอบ แล้วกด **ใช้ Crop**
- **ซูมพื้นที่ทำงาน** มีผลเฉพาะหน้าแก้ไข: Fit ให้พอดีพื้นที่, 100% แสดงขนาดพิกเซลเวทีจริง; ใช้แถบเลื่อนเพื่อดูส่วนอื่นเมื่อซูม
- ล็อกเลเยอร์เพื่อป้องกันการลาก, ล็อกสัดส่วนเพื่อปรับขนาด, ใช้ Undo/Redo ย้อนการจัดภาพได้โดยไม่ยกเลิกพักจอหรือจอดำ
- ในแท็บ **เทมเพลต** เลือก Layout สำหรับช่องลัดปุ่ม 4–8 ได้ รวมถึงเทมเพลตที่บันทึกเอง ช่องลัดถูกส่งไปยังจอฉายพร้อม layout

ปุ่มลัดใช้ได้ทั้งหน้าควบคุมและหน้าจอฉาย:

| ปุ่ม | คำสั่ง |
| --- | --- |
| 0 | กลับ LIVE และยกเลิกจอดำ |
| 1 / 2 / 3 | พักทั้งเวที: รอสักครู่ / ชื่อเรื่อง / ขัดข้องทางเทคนิค |
| 4–8 | Layout ช่องลัด 1–5 (เปลี่ยนได้ระหว่างพักจอ) |
| H / P | แสดงหรือซ่อน B / A |
| K | สลับจอดำ |
| F / Esc | เปิดหรือปิดเต็มจอ / ออกจากเต็มจอ |
| ? | เปิดหรือปิดแผงปุ่มลัด |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Undo / Redo ในหน้าจัดเวที |

ต้องเปิดหน้าควบคุมไว้เพื่อรับคำสั่งจากจอฉายและกระจายสถานะเดียวกันทุกจอ หากไม่มีการตอบรับ จอฉายจะแจ้งข้อผิดพลาดแทนการเปลี่ยนเฉพาะจอนั้น แถบปุ่มและ cursor ซ่อนเมื่อเต็มจอและไม่มีการขยับเมาส์; เปิดแผงด้วย `?` ได้ตลอด ปุ่มลัดไม่ทำงานขณะพิมพ์หรือปรับ slider

ตรวจการเปลี่ยนแปลงในเครื่องด้วย `npm test`, `npx tsc --noEmit` และ `npm run build` จากนั้นทดสอบ A/B กับจอฉายบนอุปกรณ์จริงก่อนใช้หน้างาน
