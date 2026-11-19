import { WatchNext } from "@/components/WatchNext";

// Read env at request time so editing .env.local + restarting is all that's needed.
export const dynamic = "force-dynamic";

export default function Home() {
  const region = (process.env.DEFAULT_REGION ?? "GB").trim().toUpperCase();
  return (
    <WatchNext
      defaultRegion={/^[A-Z]{2}$/.test(region) ? region : "GB"}
      hasTmdb={!!process.env.TMDB_API_KEY?.trim()}
      hasOmdb={!!process.env.OMDB_API_KEY?.trim()}
    />
  );
}
