import { redirect } from "next/navigation";
import { getViewer, isStaff } from "@/lib/auth";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  redirect(isStaff(viewer.profile.role) ? "/team" : "/portal");
}
