import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createServiceClient } from "../_shared/supabase.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  try {
    const body = await req.json();
    const societyCode = String(body?.societyCode ?? "").trim().toUpperCase();

    if (!societyCode) {
      return errorResponse("VALIDATION_ERROR", "Society code is required.");
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("societies")
      .select("id, society_code, name, status")
      .eq("society_code", societyCode)
      .maybeSingle();

    if (error) {
      console.error("validate-society-code query error");
      return errorResponse(
        "INTERNAL_ERROR",
        "Unable to validate society code.",
        500,
      );
    }

    if (!data || data.status !== "active") {
      return errorResponse("SOCIETY_NOT_FOUND", "Society code not found.", 404);
    }

    return jsonResponse({
      society: {
        societyId: data.id,
        societyCode: data.society_code,
        societyName: data.name,
      },
    });
  } catch (error) {
    console.error("validate-society-code unexpected error", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "Unable to validate society code.",
      500,
    );
  }
});
