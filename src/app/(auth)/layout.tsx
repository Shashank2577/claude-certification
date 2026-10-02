import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCerts } from "@/lib/content";
import { CommitDialArt } from "@/components/commit-dial-art";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getCurrentUser()) redirect("/today");
  const certs = getCerts();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-bg lg:flex lg:flex-col">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          Architect Prep
        </Link>
        <div className="my-auto max-w-md">
          <CommitDialArt />
          <h2 className="mt-10 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em]">Five minutes is all you have to promise.</h2>
          <p className="mt-4 text-lg text-bg/70">
            Short, scheduled sessions for {certs.length > 1 ? "the Foundations and Professional" : "the Claude Certified Architect"} exams, with practice questions that adapt to what you keep missing.
          </p>
        </div>
        <p className="text-xs text-bg/50">Unofficial study aid, not affiliated with Anthropic.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
