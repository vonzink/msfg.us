export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-2xl font-extrabold text-ink">No access</h1>
      <p className="mt-3 text-muted">
        You&apos;re signed in but not authorized for this workspace. Ask an owner to grant you
        access.
      </p>
      <a
        href="/auth/logout"
        className="mt-6 inline-block font-semibold text-spring-2 hover:underline"
      >
        Sign out
      </a>
    </div>
  );
}
