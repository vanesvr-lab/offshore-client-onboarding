import { NewClientForm } from "./NewClientForm";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">New Client</h1>
        <p className="text-gray-500 text-sm mt-1">
          Create a client account and optionally pre-fill their KYC profile.
        </p>
      </div>
      <NewClientForm />
    </div>
  );
}
