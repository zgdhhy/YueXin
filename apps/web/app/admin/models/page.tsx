import { requireAuth } from "@/lib/auth";
import { modelWorkspace } from "@/lib/model-workspace";
import { ModelWorkspace } from "./workspace";

export default async function ModelsPage() {
  await requireAuth();
  return <ModelWorkspace initial={modelWorkspace()} />;
}
