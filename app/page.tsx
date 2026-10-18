import { auth } from "@clerk/nextjs/server";
import Workspace from "./workspace";

export default async function Home() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  return <Workspace />;
}
