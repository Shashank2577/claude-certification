import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { getViewer } from "@/lib/viewer";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, settings, certs } = await getViewer();
  const allCerts = certs.map((c) => ({ id: c.id, name: c.name }));
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsForms
        profile={{
          name: user.name,
          email: user.email,
          dailyMinutes: settings.dailyMinutes,
          examDate: settings.examDate ?? "",
          background: settings.background,
          activeCert: settings.activeCert ?? settings.certIds[0] ?? allCerts[0]?.id ?? "",
        }}
        certs={allCerts}
      />
    </>
  );
}
