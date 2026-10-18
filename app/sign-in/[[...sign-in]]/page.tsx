import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in — MCParrot" };

export default function SignInPage() {
  return (
    <main className="sign-in-page">
      <div>
        <h1>Sign in to MCParrot</h1>
        <p>Your apps, tools, and ChatGPT links belong to your account.</p>
      </div>
      <SignIn withSignUp />
    </main>
  );
}
