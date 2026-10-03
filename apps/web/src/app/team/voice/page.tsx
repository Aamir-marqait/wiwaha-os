import { PageTitle } from "@wiwaha/ui";
import { requireStaff } from "@/lib/auth";
import { Simulator } from "./simulator";

export const metadata = { title: "Phone concierge" };

export default async function VoicePage() {
  await requireStaff(["owner", "sales"]);
  const live = !!(process.env.TELEPHONY_PROVIDER === "plivo" && process.env.PLIVO_AUTH_ID);
  return (
    <>
      <PageTitle title="Phone concierge" subtitle={live ? "Live on the Plivo number. Use this to rehearse calls." : "Sandbox: no phone line is connected yet. Calls here run through the real concierge, as text."} />
      <Simulator />
    </>
  );
}
