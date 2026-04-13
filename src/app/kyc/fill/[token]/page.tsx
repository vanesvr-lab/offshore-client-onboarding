import { KycFillClient } from "./KycFillClient";

export default async function KycFillPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <KycFillClient token={token} />;
}
