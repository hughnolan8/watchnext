import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { getSubscriptions } from "@/lib/account";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · WatchNext" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  const { welcome } = await searchParams;
  return (
    <AccountSettings
      user={user}
      initialSubscriptions={await getSubscriptions(user.id, user.region)}
      welcome={welcome === "1"}
      hasTmdb={!!process.env.TMDB_API_KEY?.trim()}
    />
  );
}
