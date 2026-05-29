import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,          // Required for Railway / reverse-proxy deployments
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID  ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id         = user.id;
        token.globalRole = (user as { globalRole?: string }).globalRole ?? "MEMBER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id)   session.user.id         = token.id as string;
      if (token.globalRole) session.user.globalRole = token.globalRole as string;
      return session;
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (!user.id || !user.email) return;

      // ── Accept pending workspace invitations for this email ────────────────
      // Pending invites use userId = null. On Google sign-in we flip any
      // matching (non-expired, non-revoked) invite to active.
      const pendingInvites = await prisma.workspaceMember.findMany({
        where: { inviteEmail: user.email, status: "invited" },
      });
      for (const invite of pendingInvites) {
        try {
          // Skip expired invites (mark as expired instead of accepting)
          if (invite.inviteExpiresAt && invite.inviteExpiresAt < new Date()) {
            await prisma.workspaceMember.update({
              where: { id: invite.id },
              data:  { status: "expired" },
            });
            continue;
          }
          // Check if user is already an active member of this workspace
          const existing = await prisma.workspaceMember.findFirst({
            where: { workspaceId: invite.workspaceId, userId: user.id },
          });
          if (existing) {
            // Already a member — delete the stale pending invite
            await prisma.workspaceMember.delete({ where: { id: invite.id } });
          } else {
            await prisma.workspaceMember.update({
              where: { id: invite.id },
              data:  { userId: user.id, status: "active", inviteToken: null },
            });
            // Notify all ADMIN+ of this workspace that the invite was accepted
            void createNotification({
              workspaceId:   invite.workspaceId,
              type:          "invite_accepted",
              title:         "Undangan tim diterima",
              body:          `${user.name ?? user.email} telah bergabung ke workspace ini.`,
              href:          `/workspace/team`,
              excludeUserId: user.id,
            });
          }
        } catch (err) {
          console.error("[signIn] Failed to accept invite id=%d:", invite.id, err);
        }
      }

      if (!isNewUser) return;

      // ── First-ever user: create default Agency + Workspace + make OWNER ────
      const userCount = await prisma.user.count();
      if (userCount === 1) {
        await prisma.user.update({ where: { id: user.id }, data: { globalRole: "OWNER" } });

        const agency = await prisma.agency.create({
          data: {
            name:    "Praise Agency",
            ownerId: user.id,
          },
        });

        await prisma.workspace.create({
          data: {
            agencyId: agency.id,
            name:     "Asterixsty",
            slug:     "asterixsty",
            members: {
              create: {
                userId: user.id,
                role:   "OWNER",
                status: "active",
              },
            },
          },
        });
      } else {
        // Non-first user: look for agency owned by the first OWNER and assign to its workspace
        const agency = await prisma.agency.findFirst({ orderBy: { id: "asc" } });
        if (agency) {
          const workspace = await prisma.workspace.findFirst({
            where: { agencyId: agency.id },
            orderBy: { id: "asc" },
          });
          if (workspace) {
            // Only add if not already a member
            await prisma.workspaceMember.upsert({
              where: {
                workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
              },
              create: {
                workspaceId: workspace.id,
                userId:      user.id,
                role:        "VIEWER",
                status:      "active",
              },
              update: {},
            });
          }
        }
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
