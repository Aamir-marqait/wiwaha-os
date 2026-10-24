import { redirect } from "next/navigation";

/** The Library tab is gone: photos live under Spaces, and the studio uses those. */
export default function LibraryPage() {
  redirect("/team/spaces");
}
