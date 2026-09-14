import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { canUseCommands, commandPermissionDefaults } from "../src/access.js";
import { config } from "../src/config.js";
const guildId = "123456789012345678";
const roleId = "234567890123456789";
const env = {
  DISCORD_TOKEN: "test",
  DISCORD_APPLICATION_ID: guildId,
  DISCORD_GUILD_ID: guildId,
  WARDOGS_URL: "http://example.invalid",
  WARDOGS_PASSWORD: "test",
};
function interaction(roles: string[], permissions = 0n, cached = false) {
  return {
    guildId,
    member: {
      roles: cached ? { cache: new Map(roles.map((r) => [r, {}])) } : roles,
    },
    memberPermissions: new PermissionsBitField(permissions),
  } as unknown as Parameters<typeof canUseCommands>[0];
}
test("blank role preserves Manage Server including administrators", () => {
  const c = config(env);
  assert.equal(canUseCommands(interaction([]), c), false);
  assert.equal(
    canUseCommands(interaction([], PermissionFlagsBits.ManageGuild), c),
    true,
  );
  assert.equal(
    canUseCommands(interaction([], PermissionFlagsBits.Administrator), c),
    true,
  );
  assert.equal(
    commandPermissionDefaults(c),
    PermissionFlagsBits.ManageGuild.toString(),
  );
});
test("configured role permits ordinary members and denies non-holders including admins", () => {
  const c = config({ ...env, DISCORD_COMMAND_ROLE_ID: roleId });
  for (const cached of [false, true]) {
    assert.equal(canUseCommands(interaction([roleId], 0n, cached), c), true);
    assert.equal(
      canUseCommands(
        interaction([], PermissionFlagsBits.Administrator, cached),
        c,
      ),
      false,
    );
    assert.equal(
      canUseCommands(
        interaction([], PermissionFlagsBits.ManageGuild, cached),
        c,
      ),
      false,
    );
  }
  assert.equal(commandPermissionDefaults(c), null);
  assert.equal(
    canUseCommands({ ...interaction([roleId]), guildId: null }, c),
    false,
  );
  assert.equal(
    canUseCommands({ ...interaction([roleId]), guildId: "another" }, c),
    false,
  );
  assert.equal(
    canUseCommands({ ...interaction([roleId]), member: null }, c),
    false,
  );
});
test("role environment accepts blanks, trims IDs and rejects malformed IDs", () => {
  assert.equal(
    config({ ...env, DISCORD_COMMAND_ROLE_ID: "  " }).commandRoleId,
    undefined,
  );
  assert.equal(
    config({ ...env, DISCORD_COMMAND_ROLE_ID: ` ${roleId} ` }).commandRoleId,
    roleId,
  );
  assert.throws(
    () => config({ ...env, DISCORD_COMMAND_ROLE_ID: "@Staff" }),
    /DISCORD_COMMAND_ROLE_ID/,
  );
});
