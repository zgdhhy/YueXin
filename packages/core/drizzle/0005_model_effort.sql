ALTER TABLE `llm_models` ADD `effort` text;--> statement-breakpoint
-- 之前各环节默认 high，迁移到模型上保持不变
UPDATE `llm_models` SET `effort` = 'high' WHERE `model_id` LIKE 'claude-%';
