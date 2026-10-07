// lib/departments.ts
// แผนกผู้ป่วยนอก (OPD) ที่ใช้ในระบบนี้ — รหัส depcode จริงของ kskdepartment ใน HOSxP
//
// ที่มา: ppc-hos-10667 lib/rdu.constants.ts (RDU_DEPARTMENTS) ยืนยันกับ kskdepartment จริงแล้ว
// ใช้ชุดเดียวกันเพื่อให้ชื่อแผนกตรงกันทั้งสองระบบ — แก้ที่โน่นแล้วต้องตามมาแก้ที่นี่ด้วย
//
// ใช้กับ
//   - "สร้างในนามแผนก" ตอนสร้างฟอร์ม (เก็บเป็นชื่อแผนกใน Case.department)
//   - ตัวกรองแผนกของตรวจอัตโนมัติ (เทียบกับ ovst.main_dep ด้วยรหัส)
//
// ไฟล์นี้ไม่มี dependency — import ได้ทั้งฝั่ง server และ client

export const OPD_DEPARTMENTS = [
  { code: "002", label: "ห้องตรวจ 1" },
  { code: "003", label: "ห้องตรวจ 2" },
  { code: "004", label: "ห้องตรวจ 3" },
  { code: "009", label: "ห้องฉุกเฉิน (ER)" },
  { code: "010", label: "ห้องคลอด" },
  { code: "015", label: "คลินิกเด็กดี (WBC)" },
  { code: "017", label: "เวชปฏิบัติครอบครัว" },
  { code: "047", label: "คลินิก ARI" },
  { code: "059", label: "ห้องตรวจ" },
] as const;

export type OpdDepartment = (typeof OPD_DEPARTMENTS)[number];

/** รหัส → ชื่อ (ไม่รู้จัก = null) */
export function opdDepartmentLabel(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  return OPD_DEPARTMENTS.find((d) => d.code === c)?.label ?? null;
}
