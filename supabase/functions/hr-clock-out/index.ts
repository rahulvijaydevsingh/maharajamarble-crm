import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const staffId = user.id;

    const formData = await req.formData();
    const photo = formData.get("photo") as File | null;
    const latitude = parseFloat(formData.get("latitude") as string);
    const longitude = parseFloat(formData.get("longitude") as string);

    if (!photo) {
      return new Response(JSON.stringify({ error: "Photo is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const today = new Date().toISOString().split("T")[0];

    // Find today's record
    const { data: record, error: fetchError } = await adminClient
      .from("attendance_records")
      .select("*")
      .eq("staff_id", staffId)
      .eq("date", today)
      .maybeSingle();

    if (fetchError || !record) {
      return new Response(
        JSON.stringify({ error: "No clock-in record found for today" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (record.clock_out) {
      return new Response(
        JSON.stringify({ error: "Already clocked out today" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // GPS verification
    const { data: hrSettings } = await adminClient
      .from("staff_hr_settings")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();

    let clockOutVerified = true;
    let clockOutFlag: string | null = null;

    if (hrSettings && (hrSettings as any).gps_mode === "strict") {
      const officeLat = hrSettings.office_latitude;
      const officeLng = hrSettings.office_longitude;
      const radius = hrSettings.gps_radius_meters || 100;

      if (officeLat && officeLng && !isNaN(latitude) && !isNaN(longitude)) {
        const distance = haversineDistance(
          latitude,
          longitude,
          officeLat,
          officeLng
        );
        if (distance > radius) {
          clockOutFlag = "outside_radius";
          clockOutVerified = false;
        }
      }
    }

    // Upload photo
    const photoPath = `${staffId}/${today}/clock-out.jpg`;
    const photoBytes = await photo.arrayBuffer();
    const { error: uploadError } = await adminClient.storage
      .from("attendance-photos")
      .upload(photoPath, photoBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Photo upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload photo" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate hours
    const clockInTime = new Date(record.clock_in).getTime();
    const clockOutTime = Date.now();
    const totalHoursDecimal =
      (clockOutTime - clockInTime) / (1000 * 60 * 60);
    const totalHours = Math.round(totalHoursDecimal * 100) / 100;

    // Calculate overtime
    let overtimeHours = 0;
    if (hrSettings) {
      const shiftStart = hrSettings.shift_start || "09:00";
      const shiftEnd = hrSettings.shift_end || "18:00";
      const [sh, sm] = shiftStart.split(":").map(Number);
      const [eh, em] = shiftEnd.split(":").map(Number);
      const scheduledHours = eh + em / 60 - (sh + sm / 60);
      if (totalHoursDecimal > scheduledHours) {
        overtimeHours =
          Math.round((totalHoursDecimal - scheduledHours) * 100) / 100;
      }
    }

    const clockOutISO = new Date().toISOString();

    const { error: updateError } = await adminClient
      .from("attendance_records")
      .update({
        clock_out: clockOutISO,
        clock_out_latitude: isNaN(latitude) ? null : latitude,
        clock_out_longitude: isNaN(longitude) ? null : longitude,
        clock_out_photo_url: photoPath,
        clock_out_verified: clockOutVerified,
        clock_out_flag: clockOutFlag,
        total_hours: totalHours,
        overtime_hours: overtimeHours,
      } as any)
      .eq("id", record.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        time: clockOutISO,
        total_hours: totalHours,
        overtime_hours: overtimeHours,
        verified: clockOutVerified,
        flagged: !!clockOutFlag,
        flag_reason: clockOutFlag,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Clock-out error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
