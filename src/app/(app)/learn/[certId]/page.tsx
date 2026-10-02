import { notFound, redirect } from "next/navigation";
import { getCert } from "@/lib/content";

/** /learn/{certId} has no page of its own: send valid certs to the domain list, 404 the rest. */
export default async function CertPage({ params }: PageProps<"/learn/[certId]">) {
  const { certId } = await params;
  if (!getCert(certId)) notFound();
  redirect(`/learn?cert=${encodeURIComponent(certId)}`);
}
