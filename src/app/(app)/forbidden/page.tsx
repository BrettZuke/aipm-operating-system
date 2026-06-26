import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-sm font-medium text-[#6B7280]">403</p>
      <h1 className="mt-2 text-2xl font-semibold text-[#F5F5F7]">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-[#9CA3AF]">
        You don&apos;t have permission to access this page. Contact your workspace admin.
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
