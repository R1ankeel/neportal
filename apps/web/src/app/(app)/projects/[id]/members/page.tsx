import { ProjectPageShell } from "@/components/projects/ProjectPageShell";
import { ProjectMembersPanel } from "@/components/projects/ProjectMembersPanel";
import { apiGet } from "@/lib/api";
import { resolveProjectActor } from "@/lib/resolve-project-actor";
import type { ApiProjectMember, ApiUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function canManageMembers(actor: ApiUser | undefined): boolean {
  if (!actor) return false;
  return actor.role === "OWNER" || actor.role === "MANAGER";
}

export default async function ProjectMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { actorUserId, users } = await resolveProjectActor(sp, `/projects/${id}/members`);

  if (!actorUserId) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-lg text-amber-900 dark:text-amber-100">
        Нет пользователей.
      </div>
    );
  }

  const actor = users.find((u) => u.id === actorUserId);

  let members: ApiProjectMember[] = [];
  let error: string | null = null;
  try {
    members = await apiGet<ApiProjectMember[]>(`/projects/${id}/members`, { actorUserId });
  } catch (e) {
    error = e instanceof Error ? e.message : "Ошибка";
  }

  return (
    <ProjectPageShell projectId={id} actorUserId={actorUserId} users={users}>
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Участники проекта</h2>
        {error ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-lg text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {error}
          </p>
        ) : (
          <ProjectMembersPanel
            projectId={id}
            actorUserId={actorUserId}
            members={members}
            users={users}
            canManage={canManageMembers(actor)}
          />
        )}
      </div>
    </ProjectPageShell>
  );
}
