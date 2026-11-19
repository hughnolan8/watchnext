import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account · WatchNext" };

export default async function Signup() {
  if (await currentUser()) redirect("/");
  return <AuthForm mode="signup" />;
}
