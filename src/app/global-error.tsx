"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] text-center px-4">
        <h1 className="text-xl font-semibold text-[#F5F5F7]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-sm font-medium text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.08)]"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Refresh Page
          </button>
        </div>
      </body>
    </html>
  );
}
