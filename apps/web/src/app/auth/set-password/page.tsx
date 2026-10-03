import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { getViewer } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?error=link");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8"><Wordmark subtitle="Welcome to the team" /></div>
        <h1 className="font-serif text-3xl font-semibold">Hello, {viewer.profile.full_name.split(" ")[0]}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-soft">Choose a password for {viewer.email}. You can also always sign in with an email link.</p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
