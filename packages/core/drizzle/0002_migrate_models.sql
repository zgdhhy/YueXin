-- 旧版每个服务商只有一个模型：为它们各建一条模型记录，沿用服务商 id，使旧的环节绑定（按服务商 id）仍然指向同一个模型
INSERT INTO `llm_models` (`id`, `provider_id`, `model_id`, `max_output_tokens`)
SELECT `id`, `id`, `model`, `max_tokens` FROM `llm_providers`;
--> statement-breakpoint
UPDATE `llm_models` SET `price_input` = 4, `price_output` = 20 WHERE `model_id` = 'claude-opus-5-5';
