// app/components/Backdrop.tsx
// ฉากหลังทั้งเว็บ: ก้อนแสงพาสเทลเบลอลอยช้าๆ บนลายจุดจางๆ (สไตล์อยู่ใน globals.css)

export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
    </div>
  );
}
