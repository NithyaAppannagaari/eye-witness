import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Eye:Witness</h1>
        <p className="text-gray-500">
          Verified Photography. Automatic Enforcement. On-Chain Payments.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Register a Photo
          </Link>
          <Link
            href="/dashboard/photographer"
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Photographer Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
