# รายงานการตรวจสอบ Open Issues หลัง PR #171

**วันที่ตรวจสอบ:** 2025-12-21  
**Repository:** PunGrumpy/logixlysia  
**หมายเหตุ:** ตรวจสอบเฉพาะ open issues หลังจากการ rewrite project ใน PR #171

---

## สรุปผลการตรวจสอบ

**Total Open Issues:** 4  
**ยังไม่ถูกแก้ไข:** 3  
**อาจถูกแก้ไขแล้ว:** 1

---

## Issues ที่ยังเปิดอยู่

### 1. Issue #172: Bug: pino transport not work
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้รายงานว่า pino transport configuration ไม่ทำงาน
- ตั้งค่า transport เพื่อเขียน log ลงไฟล์ แต่ไฟล์ไม่ถูกเขียน
- Configuration ที่ใช้:
  ```ts
  pino: {
    transport: [
      { target: 'pino-pretty', options: { colorize: true } },
      { target: 'pino/file', options: { destination: './app.log' } }
    ]
  }
  ```

**การตรวจสอบโค้ดปัจจุบัน:**
- ✅ pino logger ถูกสร้างด้วย transport ใน `packages/cli/src/logger/index.ts` บรรทัด 36-42
- ❌ แต่ในฟังก์ชัน `log()` (บรรทัด 44-95) **ไม่มีการเรียกใช้ pino logger เลย**
- ✅ มีฟังก์ชัน `logWithPino()` ใน `create-logger.ts` แต่ไม่ได้ถูกเรียกใช้
- ✅ ผู้ใช้สามารถเรียกใช้ `store.pino.info()` ได้เอง (ตามตัวอย่างใน `apps/elysia/src/routers/pino.ts`)

**สาเหตุ:**
- pino logger ถูกสร้างแต่ไม่ถูกเรียกใช้ในฟังก์ชัน `log()` อัตโนมัติ
- transport จะทำงานก็ต่อเมื่อมีการเรียกใช้ `pinoLogger.info/warn/error()` โดยตรง
- แต่ฟังก์ชัน `log()` ใช้แค่ `console.info/warn/error()` เท่านั้น

**วิธีแก้ไข:**
- ต้องเพิ่มการเรียกใช้ `logWithPino()` ในฟังก์ชัน `log()` เพื่อให้ pino transport ทำงาน
- หรือเพิ่ม option เพื่อให้ผู้ใช้เลือกว่าจะใช้ pino logging หรือไม่

---

### 2. Issue #162: Getting two logs by default
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้ได้รับทั้ง JSON log (จาก pino) และ custom format log
- เมื่อตั้งค่า `customLogFormat` แล้วยังเห็น JSON log ออกมาด้วย
- ตัวอย่าง output:
  ```
  {"level":30,"time":1764152216129,"pid":1214082,"method":"GET",...}
  2025-11-26T10:16:56.129Z INFO 4ms GET / 200
  ```

**การตรวจสอบโค้ดปัจจุบัน:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `log()` จะ:
  1. เรียก `logToTransports()` (custom transports)
  2. เรียก `logToFile()` (file logging)
  3. เรียก `formatLine()` และใช้ `console.info/warn/error()` (custom format)
- ❌ **ไม่มีการเรียกใช้ pino logger ในฟังก์ชัน `log()`** ดังนั้น JSON log น่าจะมาจากที่อื่น
- ⚠️ ถ้า pino มี transport (เช่น pino-pretty) ที่ log ไป stdout/stderr อาจจะทำให้เห็น log สองแบบ

**สาเหตุที่เป็นไปได้:**
- ถ้าผู้ใช้ตั้งค่า `pino.prettyPrint: true` หรือ `pino.transport` ที่ log ไป stdout/stderr
- pino transport อาจจะ log อัตโนมัติผ่าน stream
- แต่โค้ดปัจจุบันไม่เรียกใช้ pino logger ในฟังก์ชัน `log()` ดังนั้นน่าจะไม่ใช่สาเหตุนี้

**หมายเหตุ:** อาจต้องตรวจสอบเพิ่มเติมว่าผู้ใช้ตั้งค่าอะไรบ้าง

**วิธีแก้ไข:**
- เพิ่ม option `disablePinoLogging` หรือ `usePinoOnly` เพื่อควบคุมการ log
- หรือตรวจสอบว่าถ้ามี `customLogFormat` แล้วให้ปิด pino transport อัตโนมัติ

---

### 3. Issue #149: Feature: Provide an option to pass existing pino instance to logixlysia
**สถานะ:** ❌ **ยังไม่ถูกแก้ไข**

**รายละเอียดปัญหา:**
- ผู้ใช้ต้องการส่ง pino instance ที่มีอยู่แล้วเข้าไปใน logixlysia
- เพื่อใช้ pino logger เดียวกันทั้งแอปพลิเคชัน

**การตรวจสอบโค้ดปัจจุบัน:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `createLogger()` จะสร้าง pino instance ใหม่เสมอ (บรรทัด 36-42)
- ใน `packages/cli/src/interfaces.ts` type `Options` ไม่มี option สำหรับส่ง pino instance
- ❌ **ยังไม่มี feature นี้**

**วิธีแก้ไข:**
- เพิ่ม option `pinoInstance?: Pino` ใน `Options.config`
- ถ้ามี `pinoInstance` ให้ใช้ instance นั้นแทนการสร้างใหม่
- ตัวอย่าง:
  ```ts
  export type Options = {
    config?: {
      // ...
      pino?: (PinoLoggerOptions & { prettyPrint?: boolean }) | undefined
      pinoInstance?: Pino  // เพิ่ม option นี้
    }
  }
  ```

---

### 4. Issue #146: Bug: basically does not work
**สถานะ:** ✅ **น่าจะถูกแก้ไขแล้ว**

**รายละเอียดปัญหา:**
- ผู้ใช้ไม่สามารถเข้าถึง `pino` จาก `store` ได้
- Code: `const { pino } = store` ไม่ทำงาน
- Error: `pino does not exist`

**การตรวจสอบโค้ดปัจจุบัน:**
- ✅ ใน `packages/cli/src/index.ts` บรรทัด 62: `.state('pino', logger.pino)`
- ✅ Type definition ใน `interfaces.ts` บรรทัด 14-19: `LogixlysiaStore` มี `pino: Pino`
- ✅ ตัวอย่างการใช้งานใน `apps/elysia/src/routers/pino.ts` แสดงว่า `store.pino` ใช้งานได้

**สถานะ:** ✅ **น่าจะถูกแก้ไขแล้ว** - โค้ดปัจจุบันมี pino ใน store แล้ว

**หมายเหตุ:** 
- Issue นี้ถูกสร้างเมื่อ 2025-10-19 ซึ่งอาจเป็นก่อนการแก้ไข
- ควรตรวจสอบกับผู้ใช้ว่ายังมีปัญหาหรือไม่ หรืออาจเป็นปัญหาเรื่อง TypeScript types

---

## สรุปและคำแนะนำ

### Issues ที่ต้องแก้ไขด่วน:

1. **Issue #172** - pino transport ไม่ทำงาน
   - **สาเหตุ:** ไม่มีการเรียกใช้ pino logger ในฟังก์ชัน `log()`
   - **วิธีแก้:** เพิ่มการเรียกใช้ `logWithPino()` ในฟังก์ชัน `log()`

2. **Issue #162** - ได้รับ log สองแบบ
   - **สาเหตุ:** อาจมาจาก pino transport ที่ log ไป stdout/stderr
   - **วิธีแก้:** เพิ่ม option `disablePinoLogging` หรือตรวจสอบการตั้งค่า pino transport

3. **Issue #149** - ไม่สามารถส่ง pino instance ที่มีอยู่แล้วได้
   - **สาเหตุ:** ไม่มี option สำหรับส่ง pino instance
   - **วิธีแก้:** เพิ่ม option `pinoInstance?: Pino` ใน `Options.config`

### Issues ที่น่าจะถูกแก้ไขแล้ว:

4. **Issue #146** - pino ไม่มีใน store
   - **สถานะ:** ✅ โค้ดปัจจุบันมี `.state('pino', logger.pino)` แล้ว
   - **คำแนะนำ:** ควรตรวจสอบกับผู้ใช้ว่ายังมีปัญหาหรือไม่

---

## ข้อเสนอแนะเพิ่มเติม

1. **เพิ่มการเรียกใช้ pino logger ในฟังก์ชัน `log()`:**
   ```ts
   // ใน packages/cli/src/logger/index.ts
   const log = (...) => {
     // ... existing code ...
     
     // เพิ่มการเรียกใช้ pino logger
     if (!useTransportsOnly && !disableInternalLogger) {
       logWithPino(pinoLogger, level, {
         method: request.method,
         url: request.url,
         status: data.status,
         ...data
       })
     }
     
     // ... rest of code ...
   }
   ```

2. **เพิ่ม option สำหรับควบคุม pino logging:**
   ```ts
   // ใน packages/cli/src/interfaces.ts
   export type Options = {
     config?: {
       // ...
       disablePinoLogging?: boolean  // เพิ่ม option นี้
       pinoInstance?: Pino  // เพิ่ม option นี้
     }
   }
   ```

3. **ตรวจสอบ Issue #146 กับผู้ใช้:**
   - ถ้ายังมีปัญหา อาจเป็นเรื่อง TypeScript types หรือ version mismatch
   - ถ้าไม่มีปัญหาแล้ว ควรปิด issue
