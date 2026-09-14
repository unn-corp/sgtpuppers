import { canUseCommands } from "./access.js";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { setTimeout as sleep } from "node:timers/promises";
import { prepareFactionEmojis } from "./faction-emojis.js";
import { registerCommand } from "./register.js";
import { config } from "./config.js";
import { Store } from "./store.js";
import { WardogsClient, Poller } from "./poller.js";
import { embeds, presence } from "./render.js";
import { Panels, messageFailure } from "./panels.js";
const c = config(),
  store = new Store(c.dataDir);
await store.load();
const poller = new Poller(new WardogsClient(c.url, c.password), store),
  panels = new Panels(store);
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
});
const serverKey = c.url;
let stopping = false;
let lastPresence = "";
function logError(event: string, e: unknown) {
  console.error(
    JSON.stringify({ event, code: (e as { code?: unknown })?.code }),
  );
}
client.on(Events.Error, (e) => logError("discord_client_error", e));
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (!canUseCommands(interaction, c)) {
      await interaction.reply({
        content: c.commandRoleId
          ? "Slash commands require Administrator permission or the configured command role in this Discord server."
          : "Slash commands require Manage Server in the configured Discord server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (interaction.commandName !== "status") return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await panels.exclusive(async () => {
      const channel = await client.channels.fetch(interaction.channelId);
      if (
        !channel?.isTextBased() ||
        !channel.isSendable() ||
        channel.isDMBased()
      )
        throw new Error("Unsupported channel");
      let existing = store.state.panels.find(
        (p) => p.channelId === channel.id && p.serverKey === serverKey,
      );
      if (existing) {
        try {
          await channel.messages.fetch(existing.messageId);
          panels.resume(existing.messageId);
        } catch (e) {
          if (messageFailure(e) !== "deleted") throw e;
          store.state.panels = store.state.panels.filter((p) => p !== existing);
          await store.save();
          existing = undefined;
        }
      }
      if (!existing) {
        const message = await channel.send({
          embeds: embeds(poller.snapshot, c),
          allowedMentions: { parse: [] },
        });
        existing = {
          guildId: c.guildId,
          channelId: channel.id,
          messageId: message.id,
          serverKey,
        };
        store.state.panels.push(existing);
        try {
          await store.save();
        } catch (e) {
          store.state.panels = store.state.panels.filter((p) => p !== existing);
          await message.delete().catch(() => {});
          throw e;
        }
      }
      await interaction.editReply(
        `Status panel: https://discord.com/channels/${c.guildId}/${channel.id}/${existing.messageId}`,
      );
    });
  } catch (e) {
    logError("status_command_failed", e);
    const content =
      "Unable to create or load the panel. Check bot channel permissions and container logs.";
    if (interaction.deferred || interaction.replied)
      await interaction.editReply(content).catch(() => {});
    else
      await interaction
        .reply({ content, flags: MessageFlags.Ephemeral })
        .catch(() => {});
  }
});
client.once(Events.ClientReady, (ready) => {
  console.log("Discord connected.");
  void prepareFactionEmojis(ready.application.emojis, c);
});
await registerCommand(c);
await client.login(c.token);
async function polling() {
  while (!stopping) {
    await poller.tick();
    await sleep(1000);
  }
}
async function publishing() {
  while (!stopping) {
    try {
      if (client.isReady()) {
        const p = presence(poller.snapshot, c);
        const key = JSON.stringify(p);
        if (key !== lastPresence) {
          client.user.setPresence(p);
          lastPresence = key;
        }
        const content = embeds(poller.snapshot, c);
        await panels.update(
          JSON.stringify(content),
          async (panel) => {
            const channel = await client.channels.fetch(panel.channelId);
            if (!channel?.isTextBased() || !channel.isSendable())
              throw { code: 10003 };
            await channel.messages.edit(panel.messageId, {
              embeds: content,
              allowedMentions: { parse: [] },
            });
          },
          (panel) =>
            panel.guildId === c.guildId && panel.serverKey === serverKey,
        );
      }
    } catch (e) {
      logError("publish_failed", e);
    }
    await sleep(1000);
  }
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    stopping = true;
    client.destroy();
    setTimeout(() => process.exit(0), 12_000).unref();
  });
await Promise.all([polling(), publishing()]);
await store.save();
