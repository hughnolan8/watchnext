import { redirect } from "next/navigation";
import { type SavedData, WatchNext } from "@/components/WatchNext";
import { getSubscriptions } from "@/lib/account";
import { currentUser } from "@/lib/auth";
import { getUserData } from "@/lib/userData";

// Read env and the session at request time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <WatchNext
      user={user}
      subscriptions={await getSubscriptions(user.id, user.region)}
      saved={(await getUserData(user.id)) as SavedData}
      hasTmdb={!!process.env.TMDB_API_KEY?.trim()}
      hasOmdb={!!process.env.OMDB_API_KEY?.trim()}
    />
  );
}
