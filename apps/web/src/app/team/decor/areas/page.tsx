import { redirect } from "next/navigation";

/** Venue areas and spaces are one list now (D44). */
export default function AreasPage() {
  redirect("/team/spaces");
}
