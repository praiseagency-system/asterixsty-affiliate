import { validateInviteToken } from "@/lib/invite-token";
import { auth } from "@/auth";
import { AcceptInviteClient } from "./AcceptInviteClient";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitePage({ searchParams }: Props) {
  const { token } = await searchParams;
  const session   = await auth();

  const validation = await validateInviteToken(token ?? "");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <AcceptInviteClient
        token={token ?? ""}
        validation={validation}
        currentUserEmail={session?.user?.email ?? null}
        currentUserId={session?.user?.id ?? null}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </div>
  );
}
