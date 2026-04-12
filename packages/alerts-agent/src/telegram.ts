import { type Config } from "./config.js";
import { logger } from "./logger.js";

export type TelegramClient = {
  post: (content: string) => Promise<string | null>;
};

export function createTelegramClient(config: Config): TelegramClient {
  if (config.alertsDryRun) {
    return {
      async post(content: string) {
        logger.info("[DRY_RUN] would post", { content });
        return null;
      },
    };
  }

  const token = config.telegramBotToken!;
  const chatId = config.telegramChatId!;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  return {
    async post(content: string) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: content,
          disable_web_page_preview: false,
          parse_mode: "HTML",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Telegram sendMessage failed: ${res.status} ${res.statusText} — ${body}`);
      }

      const data = (await res.json()) as { ok: boolean; result?: { message_id: number } };
      if (!data.ok || !data.result) {
        throw new Error(`Telegram sendMessage returned not-ok: ${JSON.stringify(data)}`);
      }

      const messageId = data.result.message_id.toString();
      logger.info("Message posted", { messageId });
      return messageId;
    },
  };
}
