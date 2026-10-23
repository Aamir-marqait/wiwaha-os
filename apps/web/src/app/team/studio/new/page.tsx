import { redirect } from "next/navigation";

/** Old link: creating a post is now the Quick create tab. */
export default function NewStudioItem(): never {
  redirect("/team/studio");
}
