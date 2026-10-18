import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="sign-in-page">
      <div>
        <h1>Sign in to MCParrot</h1>
        <p>Your apps, tasks, and ChatGPT links belong to your account.</p>
      </div>
      <SignIn withSignUp />
    </main>
  );
}
