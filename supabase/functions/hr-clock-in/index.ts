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

    // Verify JWT
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

    // Parse FormData
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

    // Check for existing clock-in today
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await adminClient
      .from("attendance_records")
      .select("id")
      .eq("staff_id", staffId)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Already clocked in today" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch HR settings for GPS verification
    const { data: hrSettings } = await adminClient
      .from("staff_hr_settings")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();

    let clockInVerified = true;
    let clockInFlag: string | null = null;

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
          clockInFlag = "outside_radius";
          clockInVerified = false;
        }
      }
    }

    // Upload photo to storage
    const photoPath = `${staffId}/${today}/clock-in.jpg`;
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

    // Get the storage path (not a public URL since bucket is private)
    const clockInPhotoUrl = photoPath;

    // Insert attendance record using server time
    const { data: record, error: insertError } = await adminClient
      .from("attendance_records")
      .insert({
        staff_id: staffId,
        date: today,
        clock_in: new Date().toISOString(),
        clock_in_latitude: isNaN(latitude) ? null : latitude,
        clock_in_longitude: isNaN(longitude) ? null : longitude,
        clock_in_photo_url: clockInPhotoUrl,
        clock_in_verified: clockInVerified,
        clock_in_flag: clockInFlag,
        status: "present",
      } as any)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        time: (record as any).clock_in,
        verified: clockInVerified,
        flagged: !!clockInFlag,
        flag_reason: clockInFlag,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Clock-in error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
