import type { PermissionScope, PrismaClient } from '../generated/client/client.js';

export interface RoleDefaults {
  key: string;
  name: string;
  description: string;
  grants: Partial<Record<string, string>>;
}

/**
 * Writes the default grants of each system role once (while `seededAt` is
 * null), and creates any system role that does not exist yet. After that the
 * business owns the role: a deploy never overwrites an edit made in the admin.
 *
 * Takes the defaults as an argument (DEFAULT_ROLES from @avida/types) so this
 * package does not depend on the vocabulary at runtime. Shared by the API on
 * start-up and by the seed scripts.
 */
export async function ensureRoles(prisma: PrismaClient, defaults: readonly RoleDefaults[]): Promise<void> {
  for (const [i, def] of defaults.entries()) {
    const existing = await prisma.role.findUnique({ where: { key: def.key }, select: { id: true, seededAt: true } });
    if (existing?.seededAt) continue;
    await prisma.$transaction(async (tx) => {
      const role = existing
        ? await tx.role.update({ where: { id: existing.id }, data: { name: def.name, description: def.description, system: true, seededAt: new Date() } })
        : await tx.role.create({ data: { id: `role_${def.key.toLowerCase()}`, key: def.key, name: def.name, description: def.description, system: true, position: (i + 1) * 10, seededAt: new Date() } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      const rows = Object.entries(def.grants)
        .filter(([, scope]) => scope && scope !== 'NONE')
        .map(([permission, scope]) => ({ roleId: role.id, permission, scope: scope as PermissionScope }));
      if (rows.length) await tx.rolePermission.createMany({ data: rows });
    });
  }
}
