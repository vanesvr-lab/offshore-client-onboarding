"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-brand-navy mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <Button
          onClick={reset}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
