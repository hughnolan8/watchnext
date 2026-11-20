import { redirect } from "next/navigation";
import { type SavedData, WatchNext } from "@/components/WatchNext";
import { getSubscriptions } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { getCatalogue } from "@/lib/catalogue";
import { getUserData } from "@/lib/userData";

// Read env and the session at request time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const subscriptions = await getSubscriptions(user.id, user.region);
  return (
    <WatchNext
      user={user}
      subscriptions={subscriptions}
      catalogue={await getCatalogue(user.region, subscriptions.map((s) => s.id))}
      saved={(await getUserData(user.id)) as SavedData}
      hasTmdb={!!process.env.TMDB_API_KEY?.trim()}
      hasOmdb={!!process.env.OMDB_API_KEY?.trim()}
      hasAi={!!process.env.ANTHROPIC_API_KEY?.trim()}
    />
  );
}
