/**
 * notifications.ts
 * Server-side helper for creating in-app notifications.
 * Notifications are broadcast to all ADMIN+ members of the workspace,
 * or to a specific user when userId is passed.
 */

import { prisma } from "@/lib/prisma";

export type NotificationType =
  | "affiliate_new"
  | "campaign_status"
  | "invite_accepted"
  | "sample_update"
  | "broadcast_done";

interface CreateNotificationOptions {
  workspaceId: number;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  /** Target a specific user. If omitted, notifies all ADMIN+ of the workspace. */
  userId?: string;
  /** Exclude this userId (e.g. the actor who triggered the event). */
  excludeUserId?: string;
}

const ADMIN_ROLES = ["OWNER", "ADMIN", "OPERATIONS"];

/**
 * Create notification(s) and write to DB.
 * Fire-and-forget safe — errors are swallowed so callers don't break.
 */
export async function createNotification(opts: CreateNotificationOptions) {
  try {
    const { workspaceId, type, title, body = "", href = "", userId, excludeUserId } = opts;

    let targets: string[];

    if (userId) {
      targets = [userId];
    } else {
      // Notify all active ADMIN+ members of the workspace
      const members = await prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          status: "active",
          role: { in: ADMIN_ROLES },
          userId: { not: null },
        },
        select: { userId: true },
      });
      targets = members
        .map((m) => m.userId!)
        .filter((uid) => uid !== excludeUserId);
    }

    if (targets.length === 0) return;

    await prisma.notification.createMany({
      data: targets.map((uid) => ({
        workspaceId,
        userId: uid,
        type,
        title,
        body,
        href,
      })),
    });
  } catch (err) {
    // Notifications are non-critical — never break the caller
    console.error("[createNotification] failed:", err);
  }
}
