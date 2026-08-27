import { CreateSessionForm } from "@/components/session/CreateSessionForm";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1>Unsaid</h1>
          <p className="max-w-[65ch] text-body text-text-secondary">
            The truth a group already has, returned to everyone at once. Write
            the question. Everyone answers privately.
          </p>
        </div>
        <CreateSessionForm />
      </div>
    </main>
  );
}
