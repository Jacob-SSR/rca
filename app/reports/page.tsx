// app/reports/page.tsx — ออกแบบฟอร์ม Form A1 ส่ง สสจ.
//
// หน้านี้ไม่ได้ให้แก้อะไร แค่เลือกช่วงวันแล้วโหลดไฟล์
// ตัวเลขทั้งหมดมาจากผลการตรวจที่มีอยู่แล้ว จึงไม่มีทางที่ฟอร์มกับหน้าจอจะไม่ตรงกัน

import { buildFormA1 } from "@/lib/report/form-a1-query";
import FormA1Download from "@/app/components/FormA1Download";

export const dynamic = "force-dynamic";

/** yyyy-mm-dd ตามเวลาไทย — ใช้เป็นค่าตั้งต้นของช่องเลือกวัน */
function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}

export default async function ReportsPage() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // พรีวิวใช้ทั้งหมดที่มี เพื่อให้เห็นว่ามีของให้ออกฟอร์มหรือยัง
  const all = await buildFormA1({});

  return (
    <div className="space-y-8">
      <section className="card card-pad">
        <h1 className="text-2xl font-semibold">Form A1 — ตารางบันทึกผลการตรวจสอบคุณภาพ</h1>
        <p className="mt-2 text-zinc-600">
          รวมผลการตรวจหลายรายไว้ในตารางเดียวตามแบบฟอร์มของ สนย. (คู่มือ มีนาคม 2558)
          สำหรับส่งสำนักงานสาธารณสุขจังหวัด — ข้อมูลผู้ป่วย 1 ราย อยู่ใน 1 บรรทัด
        </p>

        <FormA1Download defaultFrom={isoDay(firstOfMonth)} defaultTo={isoDay(now)} />
      </section>

      <section className="card overflow-hidden">
        <h2 className="card-title">
          ผลการตรวจที่พร้อมออกฟอร์มทั้งหมด ({all.rows.length} ราย)
        </h2>

        {all.rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-lg text-zinc-500">ยังไม่มีผลการตรวจที่เสร็จแล้ว</p>
            <p className="mt-1 text-zinc-400">
              ฟอร์มจะออกมาเป็นตารางเปล่าให้เขียนมือได้ตามปกติ
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>HN</th>
                  <th>วันที่</th>
                  <th>เวลา</th>
                  <th className="text-center">วัน/เวลา</th>
                  <th className="text-center">CC</th>
                  <th className="text-center">ประวัติ</th>
                  <th className="text-center">ตรวจร่างกาย</th>
                  <th className="text-center">คำวินิจฉัย</th>
                  <th className="text-center">การรักษา</th>
                  <th className="text-center">คะแนนเต็ม</th>
                  <th className="text-center">คะแนนที่ได้</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {all.rows.map((r) => (
                  <tr key={r.reviewId}>
                    <td className="tabular">{r.hn || "—"}</td>
                    <td className="tabular">{r.date || "—"}</td>
                    <td className="tabular">{r.time || "—"}</td>
                    {r.scores.map((s, i) => (
                      <td key={i} className="tabular text-center">
                        {s === null ? "—" : s}
                      </td>
                    ))}
                    <td className="tabular text-center">{r.maxScore ?? "—"}</td>
                    <td className="tabular text-center font-medium">{r.totalScore ?? "—"}</td>
                    <td className="text-sm text-zinc-600">{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-300 font-semibold">
                  <td colSpan={9} className="text-right">
                    สรุปผลการตรวจ
                  </td>
                  <td className="tabular text-center">{all.sumMax}</td>
                  <td className="tabular text-center">{all.sumTotal}</td>
                  <td className="tabular">
                    สัดส่วน {all.percentage === null ? "—" : all.percentage.toFixed(2)} %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
