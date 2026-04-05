import { redirect } from "next/navigation";

export default function WizardEntryPage({
  params,
}: {
  params: { templateId: string };
}) {
  redirect(`/apply/${params.templateId}/details`);
}
