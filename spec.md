# Citizen Waste Map

**Technical Specification — Version 0.1 (MVP)**

**Platform:** Progressive Web App (PWA) + WebAssembly (WASM)  
**Coverage:** Single Tambon, Thailand  
**Architecture:** Offline-First / Community-Driven / Privacy-First  
**License:** Apache-2.0 (เสนอ)  
**Status:** Draft for Implementation

---

## 1. Project Overview

### 1.1 วัตถุประสงค์

พัฒนาระบบให้ประชาชนสามารถรายงานปัญหาขยะในพื้นที่ผ่านรูปถ่ายและพิกัด GPS โดยระบบนำข้อมูลมาแสดงบนแผนที่แบบ Interactive พร้อมจัดกลุ่มจุดรายงาน (Clustering)

เป้าหมายคือสร้างข้อมูลเชิงประจักษ์เกี่ยวกับปัญหาการจัดเก็บขยะในระดับตำบล โดยไม่จำเป็นต้องพึ่งพาฐานข้อมูลหรือความร่วมมือจากหน่วยงานราชการในระยะเริ่มต้น

### 1.2 หลักการออกแบบ

1. **No Account Required** — ประชาชนรายงานได้โดยไม่ต้องสมัครสมาชิก
2. **Location-Based Evidence** — รายงานประกอบด้วยภาพ พิกัด และเวลา
3. **Offline-First** — บันทึกรายงานได้แม้ไม่มีอินเทอร์เน็ต และส่งภายหลัง
4. **Privacy by Design** — ป้องกันการเปิดเผยข้อมูลส่วนบุคคลและตำแหน่งบ้าน
5. **Minimal Interaction** — ขั้นตอนรายงานต้องสั้นและใช้งานง่าย
6. **Open Data Ready** — ส่งออกข้อมูลที่ผ่านการปกป้องความเป็นส่วนตัวเพื่อวิเคราะห์ต่อได้
7. **No Government Dependency** — ไม่ต้องเชื่อมต่อระบบ อบต.

### 1.3 ขอบเขต MVP

**Included**

- ส่งภาพถ่ายพร้อมพิกัด
- อ่าน EXIF Metadata
- ระบุพิกัดด้วย GPS หรือหมุดบนแผนที่
- แสดงจุดรายงานบนแผนที่
- Map Clustering
- กรองข้อมูลตามประเภท สถานะ และเวลา
- บันทึกรายงานออฟไลน์
- ระบบตรวจสอบรายงานขั้นพื้นฐาน
- แสดงสถานะการแก้ไขปัญหา
- สรุปจำนวนรายงานและแนวโน้ม

**Excluded**

- ระบบจัดเก็บค่าขยะ
- ระบบจัดตารางรถเก็บขยะ
- Vehicle Routing Optimization
- ระบบบัญชี อบต.
- การติดตาม GPS รถเก็บขยะ
- AI Image Classification
- การติดตั้งเซนเซอร์ IoT
- การยืนยันตัวตนประชาชนด้วยบัตรประชาชน

---

## 2. User Roles

### 2.1 Citizen — ประชาชนทั่วไป

ไม่ต้องเข้าสู่ระบบ

สามารถ:

- ดูแผนที่สาธารณะ
- ถ่ายภาพหรืออัปโหลดภาพ
- ส่งรายงาน
- ดูรายงานที่ผ่านการเผยแพร่
- ตรวจสถานะรายงานของตนผ่านลิงก์ส่วนตัว
- แจ้งว่าปัญหาได้รับการแก้ไขแล้ว

### 2.2 Moderator — ผู้ดูแลข้อมูล

เป็นผู้ดูแลโครงการจากชุมชน ไม่จำเป็นต้องเป็นเจ้าหน้าที่ อบต.

สามารถ:

- ตรวจสอบและอนุมัติรายงาน
- ปฏิเสธภาพที่ไม่เหมาะสม
- ตรวจสอบรายงานซ้ำ
- ปรับพิกัดที่คลาดเคลื่อน
- เปลี่ยนสถานะโดยมีหลักฐานประกอบ
- ส่งออกข้อมูลสำหรับวิเคราะห์

ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลที่ได้รับอนุญาต

---

## 3. User Experience

### 3.1 Screen A — Public Waste Map

หน้าหลักเปิดเป็นแผนที่ของตำบลที่กำหนด

องค์ประกอบ:

- แผนที่เต็มหน้าจอ
- ปุ่ม Report Waste
- ปุ่มค้นหาตำแหน่งปัจจุบัน
- ตัวกรองประเภทปัญหา
- ตัวกรองเวลา 7 / 30 / 90 วัน / ทั้งหมด
- ตัวกรองสถานะ
- Marker และ Cluster
- สรุปจำนวนรายงาน

**Default View:** แสดงรายงานที่เผยแพร่แล้วและยังไม่ยืนยันว่าแก้ไข โดยรวมรายงานเก่าที่ยังเปิดอยู่ด้วย

การกด Cluster จะซูมเข้าจนเห็นรายงานย่อย การกด Marker จะแสดงภาพ ประเภทปัญหา วันที่ และสถานะ

### 3.2 Screen B — Submit Report

ขั้นตอน:

1. ถ่ายภาพหรือเลือกภาพจากเครื่อง
2. ระบบพยายามอ่านพิกัดจาก EXIF
3. หากไม่มี EXIF ให้ขอ GPS จากโทรศัพท์โดยได้รับอนุญาต
4. ผู้ใช้ตรวจสอบและเลื่อนหมุดได้ด้วยตนเอง
5. เลือกประเภทปัญหา
6. กดส่งรายงาน

ประเภทปัญหา:

- `overflow` — ขยะล้นถัง
- `missed_collection` — ไม่มาเก็บตามกำหนด
- `uncollected` — ขยะตกค้างหรือเก็บไม่หมด
- `illegal_dumping` — มีการทิ้งขยะผิดจุด
- `other` — ปัญหาอื่น

ข้อมูลเพิ่มเติมที่ไม่บังคับ:

- คำอธิบาย ไม่เกิน 300 ตัวอักษร
- วันที่คาดว่าควรมาเก็บขยะ

หากไม่สามารถระบุพิกัดที่เชื่อถือได้ ให้ผู้ใช้ปักหมุดเองก่อนส่ง

### 3.3 Screen C — Report Details

แสดง:

- ภาพรายงานที่ผ่านการตรวจสอบ
- ประเภทปัญหา
- ตำแหน่งโดยประมาณ
- วันที่และเวลาที่รายงาน
- สถานะ
- วันที่มีการแก้ไข (ถ้ามี)

สถานะ:

- `pending` — รอตรวจสอบ
- `published` — เผยแพร่แล้ว / ยังไม่ยืนยันการแก้ไข
- `resolved` — ยืนยันว่าแก้ไขแล้ว
- `rejected` — ไม่เผยแพร่

การเปลี่ยนเป็น `resolved` ต้องมีข้อมูลสนับสนุน เช่น ภาพหลังแก้ไข หรือการตรวจสอบโดยผู้ดูแล ไม่ใช้เพียงการไม่มีรายงานใหม่

---

## 4. Map &amp; Geospatial System

### 4.1 Technology


| Component                  | Implementation                    |
| -------------------------- | --------------------------------- |
| Map Renderer               | MapLibre GL JS                    |
| Base Map                   | OpenStreetMap-derived vector data |
| Map Distribution           | PMTiles                           |
| Point Dataset              | GeoJSON                           |
| Map Clustering             | MapLibre Native Clustering        |
| Spatial Database           | SQLite (MVP)                      |
| Optional Advanced Analysis | PostGIS                           |


พื้นที่การใช้งานกำหนดจากแผนที่กลางตำบลและขอบเขตโดยประมาณที่ตั้งค่าไว้

ไม่บังคับให้มีข้อมูลขอบเขตทางราชการ หากไม่มีขอบเขตที่เชื่อถือได้ ไม่ให้แสดงว่าเป็นเขตปกครองอย่างเป็นทางการ

### 4.2 Clustering

ใช้ MapLibre GeoJSON clustering

Initial configuration:

```
{
  type: "geojson",
  data: reportGeoJSON,
  cluster: true,
  clusterRadius: 50,
  clusterMaxZoom: 14
}
```

ข้อกำหนด:

- Cluster แสดงจำนวนรายงาน
- ระดับ Zoom มีผลต่อการจัดกลุ่ม
- เมื่อซูมเข้า จุดจะค่อย ๆ แยกออกจากกัน
- เมื่อเปลี่ยนตัวกรอง จะคำนวณ Cluster ใหม่
- แยกสีตามสถานะที่ยังไม่แก้ไข / แก้ไขแล้ว
- ไม่ใช้จำนวนรายงานใน Cluster เป็นคะแนนความรุนแรงโดยตรง

### 4.3 Duplicate Detection

ตรวจหารายงานที่อาจซ้ำกันด้วย:

- ตำแหน่งใกล้กัน เช่น ไม่เกิน 30 เมตร
- ประเภทปัญหาเดียวกัน
- รายงานในช่วงเวลาใกล้เคียงกัน
- Perceptual Image Hash (ถ้ามีภาพที่เหมาะสม)

ผลลัพธ์เป็นเพียง `possible_duplicate` ไม่รวมรายงานอัตโนมัติ

ระยะแรกใช้ผู้ดูแลตรวจสอบ เพื่อไม่ให้รายงานซ้ำทำให้จำนวนเหตุการณ์จริงดูสูงเกินไป

### 4.4 Public Location Privacy

จัดเก็บพิกัดจริงแยกจากพิกัดที่เผยแพร่

- พิกัดจริงใช้ตรวจสอบและประมวลผล
- พิกัดสาธารณะใช้จุดประมาณหรือการรวมกลุ่มระดับพื้นที่ เช่น กริด 50–100 เมตร
- ไม่เปิดเผยตำแหน่งของผู้รายงานเป็นตำแหน่งบ้าน
- ภาพที่มีบุคคล ทะเบียนรถ หรือข้อมูลระบุตัวตน ต้องได้รับการตรวจสอบก่อนเผยแพร่

---

## 5. WASM Processing Module

**Language:** Rust  
**Toolchain:** wasm-pack + wasm-bindgen

### Responsibilities

**EXIF Parser**

- อ่าน Latitude / Longitude
- อ่านวันที่ถ่าย เมื่อมีข้อมูล
- ตรวจสอบ Orientation
- แยกข้อมูล EXIF ออกจากภาพที่จะเผยแพร่

**Image Processor**

- ตรวจสอบชนิดและขนาดไฟล์
- ปรับ Orientation
- ลดขนาดภาพ (ใช้ Browser Image API ได้)
- จำกัดด้านยาวของภาพ เช่น 1600 px
- แปลงภาพเป็น JPEG/WebP ตามความสามารถของเบราว์เซอร์
- คำนวณ Image Hash สำหรับช่วยตรวจภาพซ้ำ

**Validation**

- ตรวจค่าพิกัดผิดรูปแบบ
- แจ้งเตือนเมื่อพิกัด EXIF กับ GPS ปัจจุบันแตกต่างกันมาก
- ไม่ถือว่า EXIF เป็นหลักฐานที่ปลอมแปลงไม่ได้

การบีบอัดภาพให้ใช้ Browser API เมื่อเหมาะสม ไม่บังคับทำทุกขั้นตอนด้วย WASM

---

## 6. Offline-First Architecture

### 6.1 Local Storage

ใช้:

- Service Worker สำหรับ App Shell
- IndexedDB สำหรับ Draft Reports และรูปภาพที่ประมวลผลแล้ว
- Cache Storage สำหรับทรัพยากรที่อนุญาตให้แคช

### 6.2 Offline Reporting

เมื่อไม่มีอินเทอร์เน็ต:

1. ผู้ใช้ยังเปิด PWA ที่เคยโหลดไว้ได้
2. ถ่ายหรือเลือกภาพ
3. ระบุพิกัดจากข้อมูลที่มีหรือ GPS หากใช้งานได้
4. เก็บรายงานใน IndexedDB
5. แสดงสถานะ `waiting_for_sync`

เมื่อออนไลน์:

- เริ่ม Sync เมื่อเปิดแอปอีกครั้งหรือผู้ใช้กดส่ง
- ตรวจสอบว่าส่งสำเร็จจากการตอบรับของเซิร์ฟเวอร์
- ใช้ UUID และ Idempotency Key ป้องกันการส่งซ้ำ
- ลบข้อมูลออกจากคิวหลังได้รับการยืนยันเท่านั้น

ไม่พึ่ง Background Sync เป็นกลไกเดียว เพราะการรองรับแตกต่างกันระหว่างเบราว์เซอร์

### 6.3 Offline Map

**MVP:** เน้นการรายงานออฟไลน์ แผนที่ต้องมีอินเทอร์เน็ตหากยังไม่ได้แคชไว้

**V1.1:** เพิ่ม Local Map Pack เฉพาะตำบล โดยใช้ PMTiles จากแหล่งข้อมูลที่อนุญาตให้แจกจ่ายออฟไลน์ พร้อมกลไกจัดเก็บและเรียกอ่านไฟล์ในอุปกรณ์

ต้องแสดงขนาดไฟล์และแจ้งผู้ใช้ก่อนดาวน์โหลด

ไม่ใช้การดึง Tile จำนวนมากจากเซิร์ฟเวอร์สาธารณะ OpenStreetMap เพื่อทำ Offline Pack

---

## 7. Recommended Technology Stack


| Layer                    | Technology                    |
| ------------------------ | ----------------------------- |
| Frontend                 | SvelteKit + TypeScript        |
| Styling                  | Tailwind CSS                  |
| PWA                      | Service Worker + Web Manifest |
| Map                      | MapLibre GL JS                |
| Map Archive              | PMTiles                       |
| WASM                     | Rust + wasm-bindgen           |
| Local Database           | IndexedDB                     |
| Backend                  | Cloudflare Workers            |
| Database                 | Cloudflare D1 (SQLite)        |
| Image Storage            | Cloudflare R2                 |
| Hosting                  | Cloudflare                    |
| Moderator Authentication | Session-based authentication  |


เลือกสแตกแบบ Managed เพื่อไม่ต้องดูแลเซิร์ฟเวอร์หรือฐานข้อมูลบน VPS ในระยะแรก

---

## 8. Data Model

### 8.1 Report

```
interface WasteReport {
  id: string;                 // UUID
  category: ReportCategory;

  latitude: number;
  longitude: number;
  location_accuracy?: number;
  location_source: "exif" | "gps" | "manual";

  public_latitude: number;
  public_longitude: number;

  image_key: string;
  image_hash?: string;

  description?: string;
  photo_captured_at?: string;
  submitted_at: string;

  status: "pending" | "published" |
          "resolved" | "rejected";

  possible_duplicate_of?: string;
  resolved_at?: string;
}
```

หมายเหตุ: พิกัดจริงและ `image_key` ไม่ส่งกลับจาก Public API โดยตรง

### 8.2 Private Tracking

สำหรับประชาชนที่ไม่เข้าสู่ระบบ:

- สร้าง Tracking Token แบบสุ่มที่คาดเดายาก
- ส่งลิงก์ติดตามให้ผู้รายงาน
- เก็บเฉพาะ Hash ของ Token บนเซิร์ฟเวอร์
- ห้ามใช้เพียง Report ID เป็นสิทธิ์แก้ไขข้อมูล

### 8.3 Timestamps

- `photo_captured_at` — เวลาตามข้อมูลภาพ (อาจถูกแก้ไข)
- `submitted_at` — เวลาที่เซิร์ฟเวอร์รับรายงาน
- `resolved_at` — เวลาที่มีการยืนยันปิดปัญหา

จัดเก็บเป็น UTC และแสดงเวลาไทย (Asia/Bangkok)

---

## 9. API Specification


| Method | Endpoint                      | Description                         |
| ------ | ----------------------------- | ----------------------------------- |
| GET    | `/api/reports`                | GeoJSON สำหรับแผนที่ตาม bbox/filter |
| GET    | `/api/reports/:id`            | รายละเอียดสาธารณะ                   |
| POST   | `/api/reports`                | ส่งรายงานพร้อมภาพ                   |
| GET    | `/api/my-reports/:id`         | ติดตามรายงานด้วย Token              |
| POST   | `/api/reports/:id/feedback`   | แจ้งข้อมูลเพิ่มเติม/การแก้ไข        |
| GET    | `/api/stats`                  | สถิติรวม                            |
| GET    | `/api/moderation/queue`       | รายงานรอตรวจสอบ                     |
| PATCH  | `/api/moderation/reports/:id` | ตรวจสอบและเปลี่ยนสถานะ              |


ข้อกำหนด:

- Public API ไม่คืนพิกัดจริงหรือ Tracking Token
- POST ต้องตรวจสอบข้อมูลทั้งฝั่ง Client และ Server
- จำกัดขนาดและชนิดไฟล์
- จำกัดความถี่ในการส่งเพื่อป้องกัน Spam
- แยกสิทธิ์ Moderator ออกจาก Public API
- รองรับ Idempotent Submission

---

## 10. Analytics

MVP แสดงข้อมูลพื้นฐาน:

- จำนวนรายงานทั้งหมด
- จำนวนรายงานที่ยังไม่ยืนยันการแก้ไข
- จำนวนรายงานที่แก้ไขแล้ว
- รายงานแยกตามประเภท
- แนวโน้มจำนวนรายงานรายสัปดาห์
- พื้นที่ที่มีรายงานเกิดซ้ำ
- ระยะเวลาระหว่างการรายงานกับการยืนยันแก้ไข

ต้องแสดงความแตกต่างระหว่าง **จำนวนรายงาน** กับ **จำนวนเหตุการณ์ที่ยืนยันว่าไม่ซ้ำกัน**

ข้อจำกัดทางวิทยาศาสตร์:

- จำนวนรายงานขึ้นอยู่กับการมีส่วนร่วมของประชาชน
- จุดที่ไม่มีรายงานไม่ได้แปลว่าไม่มีปัญหา
- ข้อมูลประชาชนอย่างเดียวไม่สามารถพิสูจน์ว่ารถเก็บขยะวิ่งเสียเที่ยวหรือคำนวณเส้นทางที่เหมาะสมที่สุดได้
- ระบบนี้เป็นเครื่องมือระบุรูปแบบปัญหา ไม่ใช่เครื่องมือวัดปริมาณขยะทั้งหมด

---

## 11. Security &amp; Privacy

Requirements:

- HTTPS เท่านั้น
- ขออนุญาตเข้าถึง GPS อย่างชัดเจน
- ไม่บังคับชื่อ เบอร์โทร หรืออีเมล
- ลบ EXIF จากภาพสาธารณะ
- ตรวจสอบภาพก่อนเผยแพร่
- ป้องกัน SQL Injection / XSS
- ใช้ Rate Limiting
- ไม่เปิดเผย IP Address ของผู้รายงาน
- มีช่องทางร้องขอลบภาพหรือรายงาน
- กำหนดระยะเวลาจัดเก็บข้อมูลและนโยบายความเป็นส่วนตัวก่อนเปิดใช้งานจริง
- ระบุผู้รับผิดชอบข้อมูลของโครงการ

---

## 12. Non-Functional Requirements

**Platform**

- Android Chrome
- iOS Safari
- iOS / Android PWA
- Desktop Browser

**Performance Targets**

- รองรับรายงานเริ่มต้นอย่างน้อย 5,000 รายการ
- รองรับการจัดกลุ่มจุดบนแผนที่โดยไม่ค้างบนโทรศัพท์ระดับกลาง
- ภาพหลังประมวลผลตั้งเป้าขนาดไม่เกิน 1.5 MB ต่อภาพ โดยไม่ลดคุณภาพจนตรวจสอบปัญหาไม่ได้
- หน้า Map Interactive ภายในประมาณ 4 วินาทีบนเครือข่าย 4G ที่เสถียร (เป็นเป้าหมายทดสอบ ไม่ใช่การรับประกัน)

**Reliability**

- การส่งล้มเหลวไม่ทำให้รายงานในเครื่องหาย
- การกดส่งซ้ำต้องไม่สร้างรายการซ้ำ
- เมื่อพื้นที่จัดเก็บอุปกรณ์เต็ม ต้องแจ้งเตือนผู้ใช้
- ต้องระบุว่า Draft ที่ยังไม่ Sync อาจสูญหายได้หากข้อมูลเว็บไซต์ถูกลบหรือระบบจัดเก็บถูกเคลียร์

---

## 13. Acceptance Criteria

MVP ถือว่าพร้อมทดลองภาคสนามเมื่อ:

- ประชาชนเปิดแผนที่บน Android และ iPhone ได้
- ถ่ายภาพและส่งรายงานได้โดยไม่สมัครสมาชิก
- อ่าน EXIF GPS ได้เมื่อมีข้อมูล
- ขอ GPS จากอุปกรณ์ได้เมื่อได้รับอนุญาต
- ปักหมุดด้วยตัวเองได้เมื่อไม่มี GPS
- แผนที่แสดง Marker และ Cluster ได้
- ซูมเข้าแล้ว Cluster แตกเป็นจุดย่อยได้
- กรองรายงานตามเวลา ประเภท และสถานะได้
- บันทึก Draft ขณะออฟไลน์ได้
- Sync หลังกลับมาออนไลน์ได้โดยไม่สร้างรายการซ้ำ
- Moderator ตรวจสอบก่อนเผยแพร่ได้
- ข้อมูลสาธารณะไม่เปิดเผย GPS ส่วนตัวหรือ EXIF ดิบ
- สามารถติดตามและปิดรายงานโดยมีหลักฐานได้
- Export สถิติและข้อมูลเชิงพื้นที่แบบไม่ระบุตัวบุคคลได้

---

## 14. Implementation Phases

### Phase 1 — Core MVP

- PWA Shell
- MapLibre Map
- Photo + GPS Reporting
- Report API / Database
- Map Clustering
- Moderation
- Basic Offline Drafts

### Phase 2 — Evidence &amp; Data Quality

- Duplicate Detection
- Improved WASM Image Processing
- Report Resolution Verification
- Time-based Analytics
- GeoJSON/CSV Export

### Phase 3 — Optional Enhancements

- Downloadable Offline PMTiles
- Spatial Hotspot Analysis
- Community Verification
- Public Monthly Reports
- Open Data API

**หลักการสำคัญ:** ไม่พัฒนา Phase 3 จนกว่าจะทดสอบว่าประชาชนสามารถใช้ระบบ Phase 1 ได้สะดวกจริง

---

## 15. Definition of Success

ระบบไม่ได้วัดความสำเร็จจากจำนวนผู้ใช้เพียงอย่างเดียว แต่วัดจากความสามารถในการสร้างหลักฐานที่ตรวจสอบได้

1. ประชาชนรายงานปัญหาได้สะดวก
2. จุดที่เกิดปัญหาซ้ำสามารถมองเห็นได้
3. ข้อมูลยังคงมีความน่าเชื่อถือเมื่อมีรายงานซ้ำ
4. มีการติดตามสถานะการแก้ไขอย่างโปร่งใส
5. สามารถนำข้อมูลเชิงพื้นที่ไปประกอบการหารือกับหน่วยงานที่เกี่ยวข้องได้

**End of Specification — v0.1**