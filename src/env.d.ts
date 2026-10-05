declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    // Set by the middleware for every request: the correlation id and a logger that already carries it.
    requestId: string;
    log: import("./lib/logger").Logger;
  }
}
