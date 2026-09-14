import { REST, Routes } from "discord.js";
import type { Config } from "./config.js";
import { statusCommand } from "./command.js";
export async function registerCommand(c: Config) {
  // POST upserts this command only, preserving any other application commands.
  await new REST({ version: "10" })
    .setToken(c.token)
    .post(Routes.applicationGuildCommands(c.applicationId, c.guildId), {
      body: statusCommand,
    });
  console.log("Registered /status for configured guild.");
}
