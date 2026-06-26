export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4"
      style={{ backgroundColor: "#09090C" }}
    >
      {/* Grain texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          opacity: 0.032,
        }}
      />
      {/* Blue glow top-right */}
      <div
        className="pointer-events-none fixed -right-64 -top-64 h-[700px] w-[700px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,131,255,0.12) 0%, transparent 65%)" }}
      />
      {/* Green glow bottom-left */}
      <div
        className="pointer-events-none fixed -bottom-48 -left-48 h-[500px] w-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,211,147,0.07) 0%, transparent 65%)" }}
      />
      <div className="relative z-10 w-full max-w-[440px]">{children}</div>
    </div>
  );
}
