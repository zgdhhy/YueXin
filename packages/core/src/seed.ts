import { ensureDigestRevisions } from "./library";
import { ensureRequirementVersions } from "./requirements";
import { ensureSchedulePlans } from "./schedule-plan";
import { ensureStyles } from "./styles";
import { ensureTopics } from "./topics";

/** 启动时补齐默认数据：主题、定时计划、写作要求版本、解读修订与内置视频风格（都可重复调用） */
export function seedDefaults() {
  ensureTopics();
  ensureSchedulePlans();
  ensureRequirementVersions();
  ensureDigestRevisions();
  ensureStyles();
}
