# รายงานการตรวจสอบ Open Issues เทียบกับ v6.0.0

**วันที่ตรวจสอบ:** 2025-12-21  
**Repository:** PunGrumpy/logixlysia  
**Version:** logixlysia@6.0.0  
**หมายเหตุ:** ตรวจสอบว่า open issues ทั้ง 4 เรื่องถูกแก้ไขใน v6.0.0 หรือไม่

---

## สรุปผลการตรวจสอบ

**Total Open Issues:** 4  
**ถูกแก้ไขใน v6.0.0:** 1  
**ยังไม่ถูกแก้ไขใน v6.0.0:** 3

---

## ผลการตรวจสอบแต่ละ Issue

### ✅ Issue #146: Bug: basically does not work
**สถานะ:** ✅ **ถูกแก้ไขใน v6.0.0**

**รายละเอียดปัญหา:**
- ผู้ใช้ไม่สามารถเข้าถึง `pino` จาก `store` ได้
- Code: `const { pino } = store` ไม่ทำงาน

**การตรวจสอบใน v6.0.0:**
- ✅ ใน `packages/cli/src/index.ts` บรรทัด 62: `.state('pino', logger.pino)`
- ✅ Type definition ใน `interfaces.ts` บรรทัด 14-19: `LogixlysiaStore` มี `pino: Pino`
- ✅ pino ถูกเพิ่มเข้า store แล้ว

**สรุป:** ✅ **Issue นี้ถูกแก้ไขใน v6.0.0 แล้ว**

---

### ❌ Issue #172: Bug: pino transport not work
**สถานะ:** ❌ **ยังไม่ถูกแก้ไขใน v6.0.0**

**รายละเอียดปัญหา:**
- ผู้ใช้รายงานว่า pino transport configuration ไม่ทำงาน
- ตั้งค่า transport เพื่อเขียน log ลงไฟล์ แต่ไฟล์ไม่ถูกเขียน

**การตรวจสอบใน v6.0.0:**
- ✅ pino logger ถูกสร้างด้วย transport ใน `packages/cli/src/logger/index.ts` บรรทัด 36-42
- ❌ **ในฟังก์ชัน `log()` (บรรทัด 44-95) ไม่มีการเรียกใช้ pino logger เลย**
- ✅ มีฟังก์ชัน `logWithPino()` ใน `create-logger.ts` แต่ไม่ได้ถูกเรียกใช้
- ❌ ฟังก์ชัน `log()` ใช้แค่ `console.info/warn/error()` เท่านั้น

**โค้ดใน v6.0.0:**
```ts
const log = (
  level: LogLevel,
  request: RequestInfo,
  data: Record<string, unknown>,
  store: StoreData
): void => {
  logToTransports({ level, request, data, store, options })
  // ... file logging ...
  // ... custom format logging via console ...
  // ❌ ไม่มีการเรียกใช้ pinoLogger.info/warn/error()
}
```

**สรุป:** ❌ **Issue นี้ยังไม่ถูกแก้ไขใน v6.0.0** - pino transport จะไม่ทำงานเพราะ pino logger ไม่ถูกเรียกใช้

---

### ❌ Issue #162: Getting two logs by default
**สถานะ:** ❌ **ยังไม่ถูกแก้ไขใน v6.0.0**

**รายละเอียดปัญหา:**
- ผู้ใช้ได้รับทั้ง JSON log (จาก pino) และ custom format log
- เมื่อตั้งค่า `customLogFormat` แล้วยังเห็น JSON log ออกมาด้วย

**การตรวจสอบใน v6.0.0:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `log()` จะ:
  1. เรียก `logToTransports()` (custom transports)
  2. เรียก `logToFile()` (file logging)
  3. เรียก `formatLine()` และใช้ `console.info/warn/error()` (custom format)
- ❌ **ไม่มีการเรียกใช้ pino logger ในฟังก์ชัน `log()`**
- ❌ ไม่มี option `disablePinoLogging` หรือ `usePinoOnly` ใน `Options`

**โค้ดใน v6.0.0:**
```ts
export type Options = {
  config?: {
    // ...
    customLogFormat?: string
    disableInternalLogger?: boolean
    useTransportsOnly?: boolean
    // ❌ ไม่มี disablePinoLogging หรือ usePinoOnly
  }
}
```

**หมายเหตุ:** 
- ถ้า pino มี transport (เช่น pino-pretty) ที่ log ไป stdout/stderr อาจจะทำให้เห็น log สองแบบ
- แต่เนื่องจากไม่มีการเรียกใช้ pino logger ในฟังก์ชัน `log()` ปัญหานี้อาจมาจากที่อื่น

**สรุป:** ❌ **Issue นี้ยังไม่ถูกแก้ไขใน v6.0.0** - ยังไม่มี option ปิด pino logging เมื่อใช้ custom format

---

### ❌ Issue #149: Feature: Provide an option to pass existing pino instance to logixlysia
**สถานะ:** ❌ **ยังไม่ถูกแก้ไขใน v6.0.0**

**รายละเอียดปัญหา:**
- ผู้ใช้ต้องการส่ง pino instance ที่มีอยู่แล้วเข้าไปใน logixlysia
- เพื่อใช้ pino logger เดียวกันทั้งแอปพลิเคชัน

**การตรวจสอบใน v6.0.0:**
- ใน `packages/cli/src/logger/index.ts` ฟังก์ชัน `createLogger()` จะสร้าง pino instance ใหม่เสมอ (บรรทัด 36-42)
- ❌ ใน `packages/cli/src/interfaces.ts` type `Options` ไม่มี option สำหรับส่ง pino instance

**โค้ดใน v6.0.0:**
```ts
export type Options = {
  config?: {
    // ...
    pino?: (PinoLoggerOptions & { prettyPrint?: boolean }) | undefined
    // ❌ ไม่มี pinoInstance?: Pino
  }
}
```

**โค้ดสร้าง pino:**
```ts
const pinoLogger: Pino = pino({
  ...pinoOptions,
  level: pinoOptions.level ?? 'info',
  messageKey: pinoOptions.messageKey,
  errorKey: pinoOptions.errorKey,
  transport
})
// ❌ ไม่มีการตรวจสอบว่ามี pinoInstance หรือไม่
```

**สรุป:** ❌ **Issue นี้ยังไม่ถูกแก้ไขใน v6.0.0** - ยังไม่มี feature นี้

---

## สรุปผลการตรวจสอบ

### Issues ที่ถูกแก้ไขใน v6.0.0:
1. ✅ **Issue #146** - pino ไม่มีใน store (มี `.state('pino', logger.pino)` แล้ว)

### Issues ที่ยังไม่ถูกแก้ไขใน v6.0.0:
1. ❌ **Issue #172** - pino transport ไม่ทำงาน (ไม่มีการเรียกใช้ pino logger ในฟังก์ชัน `log()`)
2. ❌ **Issue #162** - ได้รับ log สองแบบ (ไม่มี option ปิด pino logging)
3. ❌ **Issue #149** - ไม่สามารถส่ง pino instance ที่มีอยู่แล้วได้ (ไม่มี option `pinoInstance`)

---

## ข้อเสนอแนะ

### สำหรับ Issue #172 (pino transport not work):
**วิธีแก้ไข:** เพิ่มการเรียกใช้ pino logger ในฟังก์ชัน `log()`

```ts
// ใน packages/cli/src/logger/index.ts
const log = (...) => {
  logToTransports({ level, request, data, store, options })
  
  // ... existing code ...
  
  // เพิ่มการเรียกใช้ pino logger
  const usePino = config?.usePinoLogging !== false // default: true
  if (usePino && !useTransportsOnly && !disableInternalLogger) {
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

### สำหรับ Issue #162 (getting two logs):
**วิธีแก้ไข:** เพิ่ม option `disablePinoLogging` หรือ `usePinoOnly`

```ts
// ใน packages/cli/src/interfaces.ts
export type Options = {
  config?: {
    // ...
    disablePinoLogging?: boolean  // เพิ่ม option นี้
    usePinoOnly?: boolean  // หรือ option นี้
  }
}
```

### สำหรับ Issue #149 (pass existing pino instance):
**วิธีแก้ไข:** เพิ่ม option `pinoInstance`

```ts
// ใน packages/cli/src/interfaces.ts
export type Options = {
  config?: {
    // ...
    pino?: (PinoLoggerOptions & { prettyPrint?: boolean }) | undefined
    pinoInstance?: Pino  // เพิ่ม option นี้
  }
}

// ใน packages/cli/src/logger/index.ts
export const createLogger = (options: Options = {}): Logger => {
  const config = options.config
  const pinoConfig = config?.pino
  
  // ใช้ pino instance ที่มีอยู่แล้วถ้ามี
  const pinoLogger: Pino = config?.pinoInstance ?? pino({
    // ... existing pino creation code ...
  })
  
  // ... rest of code ...
}
```

---

## สรุป

**v6.0.0 แก้ไขได้ 1 issue จาก 4 issues:**
- ✅ Issue #146: pino ใน store
- ❌ Issue #172: pino transport
- ❌ Issue #162: double logging
- ❌ Issue #149: pass pino instance

**ยังมี 3 issues ที่ต้องแก้ไขในเวอร์ชันถัดไป**
