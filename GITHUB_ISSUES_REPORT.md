# รายงานการตรวจสอบ GitHub Issues

**วันที่ตรวจสอบ:** 2025-12-21  
**Repository:** PunGrumpy/logixlysia

## สรุปผลการตรวจสอบ

**Total Issues:** 14  
**Closed Issues:** 10  
**Open Issues:** 4

---

## Issues ที่ยังเปิดอยู่ (Open Issues)

### 1. Issue #172: Bug: pino transport not work
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้รายงานว่า pino transport configuration ไม่ทำงาน
- ตั้งค่า transport เพื่อเขียน log ลงไฟล์ แต่ไฟล์ไม่ถูกเขียน

**การตรวจสอบโค้ด:**
- ใน `packages/cli/src/logger/index.ts` มีการสร้าง pino logger และส่ง transport เข้าไป
- แต่ในฟังก์ชัน `log()` ไม่มีการเรียกใช้ pino logger เลย
- มีฟังก์ชัน `logWithPino()` ใน `create-logger.ts` แต่ไม่ได้ถูกเรียกใช้
- ปัจจุบันโค้ดใช้แค่ `console.info/warn/error` เท่านั้น

**สถานะ:** ❌ **ยังไม่ถูกแก้ไข** - pino transport จะไม่ทำงานเพราะ pino logger ไม่ถูกเรียกใช้

---

### 2. Issue #162: Getting two logs by default
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้ได้รับทั้ง JSON log (จาก pino) และ custom format log
- เมื่อตั้งค่า `customLogFormat` แล้วยังเห็น JSON log ออกมาด้วย

**การตรวจสอบโค้ด:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `log()` จะ:
  1. เรียก `logToTransports()` (สำหรับ custom transports)
  2. เรียก `logToFile()` (ถ้ามี file path)
  3. เรียก `formatLine()` และใช้ `console.info/warn/error` (custom format)
- ไม่มีการเรียกใช้ pino logger โดยตรง
- แต่ถ้า pino มี transport (เช่น pino-pretty) อาจจะ log อัตโนมัติผ่าน stdout

**สถานะ:** ❌ **ยังไม่ถูกแก้ไข** - ยังไม่มี option ที่ชัดเจนเพื่อปิด pino JSON logging เมื่อใช้ custom format

**วิธีแก้ไขที่เป็นไปได้:**
- เพิ่ม option `disablePinoLogging` หรือ
- ตรวจสอบว่าถ้ามี `customLogFormat` แล้วให้ปิด pino transport อัตโนมัติ

---

### 3. Issue #149: Feature: Provide an option to pass existing pino instance to logixlysia
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้ต้องการส่ง pino instance ที่มีอยู่แล้วเข้าไปใน logixlysia
- เพื่อใช้ pino logger เดียวกันทั้งแอปพลิเคชัน

**การตรวจสอบโค้ด:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `createLogger()` จะสร้าง pino instance ใหม่เสมอ
- ไม่มี option ให้ส่ง pino instance ที่มีอยู่แล้วเข้าไป

**สถานะ:** ❌ **ยังไม่ถูกแก้ไข** - ยังไม่มี feature นี้

**วิธีแก้ไขที่เป็นไปได้:**
- เพิ่ม option `pinoInstance?: Pino` ใน `Options.config`
- ถ้ามี `pinoInstance` ให้ใช้ instance นั้นแทนการสร้างใหม่

---

### 4. Issue #146: Bug: basically does not work
**สถานะ:** ⚠️ **อาจถูกแก้ไขแล้ว (ต้องตรวจสอบเพิ่มเติม)**

**รายละเอียดปัญหา:**
- ผู้ใช้ไม่สามารถเข้าถึง `pino` จาก `store` ได้
- Code: `const { pino } = store` ไม่ทำงาน

**การตรวจสอบโค้ด:**
- ใน `packages/cli/src/index.ts` บรรทัด 62: `.state('pino', logger.pino)`
- pino ถูกเพิ่มเข้า store แล้ว
- Type definition ใน `interfaces.ts` บรรทัด 14-19: `LogixlysiaStore` มี `pino: Pino`

**สถานะ:** ⚠️ **อาจถูกแก้ไขแล้ว** - โค้ดดูเหมือนจะถูกต้องแล้ว แต่ผู้ใช้อาจใช้เวอร์ชันเก่าหรือมีปัญหาเรื่อง TypeScript types

**หมายเหตุ:** Issue นี้ถูกสร้างเมื่อ 2025-10-19 ซึ่งอาจเป็นก่อนการแก้ไข

---

## Issues ที่ปิดแล้ว (Closed Issues)

### Issue #175: Restructure packages/cli (exports + types + lint) [breaking]
**สถานะ:** ✅ **ปิดแล้ว** (closed_at: 2025-12-21)

### Issue #167: Bug: not extending store type correctly
**สถานะ:** ✅ **ปิดแล้ว** (closed_at: 2025-12-19)

### Issue #138: Bug: Interval property is missing from logInterval object
**สถานะ:** ✅ **ปิดแล้ว**

### Issue #126: Bug: logixlysia breaks type when using Eden Treaty
**สถานะ:** ✅ **ปิดแล้ว**

### Issue #125: Feature: Option to disable internal logger
**สถานะ:** ✅ **ปิดแล้ว** - มี `disableInternalLogger` option แล้ว

### Issue #108: Bug: state overwritten by logixlysia
**สถานะ:** ✅ **ปิดแล้ว**

### Issue #96: Bug: Cannot be used with NodeJS
**สถานะ:** ✅ **ปิดแล้ว**

### Issue #95: Feature Request: Integrate Pino Logger for logixlysia
**สถานะ:** ✅ **ปิดแล้ว** - มี pino integration แล้ว

### Issue #94: Feature: Expose Logger Instance so it can be used in Routes for Direct Usage
**สถานะ:** ✅ **ปิดแล้ว** - มี `store.logger` และ `store.pino` แล้ว

### Issue #93: Bug: logixlysia has no exported member "LogHandler"
**สถานะ:** ✅ **ปิดแล้ว**

---

## สรุปและคำแนะนำ

### Issues ที่ต้องแก้ไขด่วน:
1. **Issue #172** - pino transport ไม่ทำงาน (ต้องเรียกใช้ pino logger ในฟังก์ชัน log)
2. **Issue #162** - ได้รับ log สองแบบ (ต้องมี option ปิด pino logging เมื่อใช้ custom format)
3. **Issue #149** - ไม่สามารถส่ง pino instance ที่มีอยู่แล้วได้ (feature request)

### Issues ที่อาจถูกแก้ไขแล้ว:
4. **Issue #146** - pino ไม่มีใน store (ควรตรวจสอบกับผู้ใช้ว่ายังมีปัญหาหรือไม่)

### ข้อเสนอแนะ:
- เพิ่มการเรียกใช้ `logWithPino()` ในฟังก์ชัน `log()` เพื่อให้ pino transport ทำงาน
- เพิ่ม option `disablePinoLogging` หรือ `usePinoOnly` เพื่อควบคุมการ log
- เพิ่ม option `pinoInstance` เพื่อรองรับการส่ง pino instance ที่มีอยู่แล้ว
