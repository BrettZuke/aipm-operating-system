import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0e0e10] text-center px-4">
      <p className="text-sm font-medium text-[#6B7280]">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#F5F5F7]">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
