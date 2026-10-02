import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { getCert, getCerts } from "./content";
import type { Cert } from "./content-types";
import { getSettings, type UserSettings } from "./repo/settings";
import type { User } from "./repo/users";

export interface Viewer {
  user: User;
  settings: UserSettings;
  /** The cert the user is currently studying; undefined only when no content exists at all. */
  cert: Cert | undefined;
  certs: Cert[];
}

/** Signed-in, onboarded user plus their active cert. Redirects otherwise. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  if (!settings.onboarded) redirect("/onboarding");
  const certs = getCerts();
  const cert = getCert(settings.activeCert ?? settings.certIds[0] ?? "") ?? certs[0];
  return { user, settings, cert, certs };
});

export async function getAdminViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (v.user.role !== "admin") redirect("/today");
  return v;
}
