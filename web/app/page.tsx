import Autopsy from "./autopsy";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-20">
      <header className="mb-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fail">Rektopsy</p>
        <h1 className="mt-3 font-serif text-5xl leading-[1.05] sm:text-6xl">
          Why did my Solana transaction fail?
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Paste a transaction signature. We read it from the chain and tell you what went wrong, the
          exact setting to change, and whether your funds are safe, with every claim traced to the
          chain data.
        </p>
      </header>

      <Autopsy />

      <footer className="mt-auto pt-16 text-xs text-muted">
        Read-only: no wallet connection, no signing, no keys. We only read public transaction data.
      </footer>
    </main>
  );
}
