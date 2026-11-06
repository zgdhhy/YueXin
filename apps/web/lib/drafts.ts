import type { RequirementDraft, TopicDraft } from "@paper/core/schema";

/** 助手消息附带的草稿类型（客户端组件用，不引入 core 的服务端代码） */
type Data = TopicDraft | RequirementDraft | null | undefined;
export const isTopicDraft = (d: Data): d is TopicDraft => !!d && "keywords" in d;
export const isRequirementDraft = (d: Data): d is RequirementDraft => !!d && "content" in d && "baseVersionId" in d;
