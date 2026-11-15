// Test bootstrap. Runs before any app module is imported.
//
// The app has ONE production database and developers sometimes point local
// dev at it (see ONBOARDING.md). Tests create and delete rows, so they must
// never inherit DATABASE_URL from a .env file. Integration tests only run
// against TEST_DATABASE_URL, and only when it points at this machine.
const url = process.env.TEST_DATABASE_URL;

function isLocal(u: string): boolean {
  try {
    const host = new URL(u).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

if (url && !isLocal(url) && process.env.TEST_DATABASE_ALLOW_REMOTE !== "yes-this-is-a-throwaway-database") {
  throw new Error(
    "TEST_DATABASE_URL is not a local database. Integration tests write and delete rows. " +
      "Point it at a throwaway Postgres on localhost."
  );
}

// Unit tests import modules that construct a Prisma client but never query
// it; give that client an address that cannot be the production database.
process.env.DATABASE_URL = url ?? "postgresql://unused@127.0.0.1:1/unit-tests-do-not-connect";
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.SESSION_SECRET ??= "test-session-secret";
