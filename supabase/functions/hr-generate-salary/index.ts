import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Use service role for data operations
    const db = createClient(supabaseUrl, serviceKey);

    // Check admin
    const { data: roleData } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { month, year } = await req.json();
    if (!month || !year) {
      return new Response(JSON.stringify({ error: "month and year required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all active staff
    const { data: staff } = await db
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true);

    if (!staff || staff.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_payroll: 0, staff_count: 0, message: "No active staff" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

    let totalPayroll = 0;
    let processedCount = 0;

    for (const member of staff) {
      // Get HR settings
      const { data: hrSettings } = await db
        .from("staff_hr_settings")
        .select("*")
        .eq("staff_id", member.id)
        .maybeSingle();

      if (!hrSettings) continue; // Skip staff without HR config

      const baseSalary = Number(hrSettings.base_salary) || 0;
      const workDays: string[] = hrSettings.work_days || ["mon", "tue", "wed", "thu", "fri", "sat"];
      const overtimeRate = Number(hrSettings.overtime_rate) || 1.5;

      // Count total working days in the month
      const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
      let totalWorkingDays = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (workDays.includes(dayMap[dow])) totalWorkingDays++;
      }

      // Get attendance records for the month
      const { data: attendance } = await db
        .from("attendance_records")
        .select("status, overtime_hours")
        .eq("staff_id", member.id)
        .gte("date", startDate)
        .lte("date", endDate);

      let daysPresent = 0;
      let daysAbsent = 0;
      let daysLeave = 0;
      let daysLwp = 0;
      let otHours = 0;

      if (attendance) {
        for (const rec of attendance) {
          if (rec.status === "present" || rec.status === "half_day") daysPresent++;
          else if (rec.status === "absent") daysAbsent++;
          else if (rec.status === "on_leave") daysLeave++;
          otHours += Number(rec.overtime_hours) || 0;
        }
      }

      // Count LWP from leave_requests (approved, unpaid types)
      const { data: lwpLeaves } = await db
        .from("leave_requests")
        .select("total_days")
        .eq("staff_id", member.id)
        .eq("status", "approved")
        .eq("leave_type", "lwp")
        .gte("start_date", startDate)
        .lte("end_date", endDate);

      if (lwpLeaves) {
        daysLwp = lwpLeaves.reduce((sum, l) => sum + (Number(l.total_days) || 0), 0);
      }

      // Days absent = working days not accounted for
      const unaccountedDays = totalWorkingDays - daysPresent - daysLeave - daysLwp;
      if (unaccountedDays > daysAbsent) daysAbsent = unaccountedDays;

      // Calculate pay
      const perDayPay = totalWorkingDays > 0 ? baseSalary / totalWorkingDays : 0;
      const absentDeduction = perDayPay * (daysAbsent + daysLwp);
      const hourlyRate = totalWorkingDays > 0 ? baseSalary / (totalWorkingDays * 8) : 0;
      const otPay = Math.round(otHours * hourlyRate * overtimeRate);
      const netSalary = Math.round(baseSalary - absentDeduction + otPay);

      // Check for existing record to preserve manual adjustments
      const { data: existing } = await db
        .from("salary_records")
        .select("id, manual_additions, manual_deductions, status")
        .eq("staff_id", member.id)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      // Don't overwrite finalized records
      if (existing?.status === "finalized") continue;

      const manualAdditions = existing?.manual_additions || [];
      const manualDeductions = existing?.manual_deductions || [];
      const additionsTotal = Array.isArray(manualAdditions)
        ? manualAdditions.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0)
        : 0;
      const deductionsTotal = Array.isArray(manualDeductions)
        ? manualDeductions.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0)
        : 0;

      const finalNet = netSalary + additionsTotal - deductionsTotal;

      const record = {
        staff_id: member.id,
        month,
        year,
        base_salary: baseSalary,
        overtime_pay: otPay,
        deductions: Math.round(absentDeduction) + deductionsTotal,
        bonuses: additionsTotal,
        net_salary: finalNet,
        total_working_days: totalWorkingDays,
        days_present: daysPresent,
        days_absent: daysAbsent,
        days_leave: daysLeave,
        days_lwp: daysLwp,
        generated_by: userId,
        generated_at: new Date().toISOString(),
        status: "draft",
        manual_additions: manualAdditions,
        manual_deductions: manualDeductions,
      };

      if (existing) {
        await db.from("salary_records").update(record).eq("id", existing.id);
      } else {
        await db.from("salary_records").insert(record);
      }

      totalPayroll += finalNet;
      processedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_payroll: totalPayroll,
        staff_count: processedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("hr-generate-salary error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
