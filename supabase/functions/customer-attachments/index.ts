import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, createUserClient } from "../_shared/authz.ts";
import { handleRequest } from "./handler.ts";

// All logic is in handler.ts (so that it can be tested). This file only connects the real services.
serve((req) =>
  handleRequest(req, {
    createUserClient,
    createAdminClient,
    getEnv: (name) => Deno.env.get(name),
    newId: () => crypto.randomUUID(),
  })
);
