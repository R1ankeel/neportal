import type { ApiProject } from "./api";
import {
  capProjectsForSelection,
  resolveProjectByStrictHint,
  resolveProjectForAction,
} from "./project-resolution";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const projects: ApiProject[] = [
  { id: "p2", name: "Бета" },
  { id: "p1", name: "Альфа" },
  { id: "p3", name: "Гамма" },
];

export function devLogProjectResolutionChecks(): void {
  const empty = resolveProjectForAction(projects);
  assert(empty.kind === "selection_required", "multi project → selection");
  assert(
    empty.kind === "selection_required" && empty.projects[0]?.name === "Альфа",
    "alphabetical sort",
  );

  const single = resolveProjectForAction([{ id: "x", name: "Один" }]);
  assert(single.kind === "resolved" && single.autoSelected === true, "single auto-select");

  const strict = resolveProjectByStrictHint(projects, "альф");
  assert(strict.kind === "resolved" && strict.project.name === "Альфа", "strict hint");

  const capped = capProjectsForSelection(
    Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, name: `Проект ${String(i).padStart(2, "0")}` })),
  );
  assert(capped.projects.length === 20 && capped.truncated === true, "cap 20 projects");

  console.log("[bot] project-resolution dev checks OK");
}
