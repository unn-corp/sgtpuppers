import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
export const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Create or find this channel’s live Wardogs status panel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .toJSON();
