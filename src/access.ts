import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Config } from "./config.js";

export function commandPermissionDefaults(c: Pick<Config, "commandRoleId">) {
  // Role membership is checked at runtime; a ManageGuild default would hide
  // commands from role holders who are not server managers.
  return c.commandRoleId ? null : PermissionFlagsBits.ManageGuild.toString();
}

export function canUseCommands(
  interaction: Pick<
    ChatInputCommandInteraction,
    "guildId" | "member" | "memberPermissions"
  >,
  c: Pick<Config, "guildId" | "commandRoleId">,
) {
  if (interaction.guildId !== c.guildId || !interaction.member) return false;
  if (!c.commandRoleId)
    return (
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
      false
    );
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return true;
  const roles = interaction.member.roles;
  return Array.isArray(roles)
    ? roles.includes(c.commandRoleId)
    : roles.cache.has(c.commandRoleId);
}
