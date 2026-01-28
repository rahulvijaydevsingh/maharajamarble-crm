import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Demo users matching the TEAM_MEMBERS in the codebase
const DEMO_USERS = [
  { 
    email: 'superadmin@demo.com', 
    password: 'SuperAdmin@2024', 
    fullName: 'Super Admin', 
    phone: '9876543200',
    role: 'super_admin' 
  },
  { 
    email: 'admin@demo.com', 
    password: 'Admin@2024', 
    fullName: 'Admin User', 
    phone: '9876543201',
    role: 'admin' 
  },
  // Staff members matching the TEAM_MEMBERS constant
  { 
    email: 'vijay@maharajacrm.com', 
    password: 'Vijay@2024', 
    fullName: 'Vijay Kumar', 
    phone: '9876543210',
    role: 'manager' 
  },
  { 
    email: 'ankit@maharajacrm.com', 
    password: 'Ankit@2024', 
    fullName: 'Ankit Sharma', 
    phone: '9876543211',
    role: 'sales_user' 
  },
  { 
    email: 'sanjay@maharajacrm.com', 
    password: 'Sanjay@2024', 
    fullName: 'Sanjay Patel', 
    phone: '9876543212',
    role: 'sales_user' 
  },
  { 
    email: 'meera@maharajacrm.com', 
    password: 'Meera@2024', 
    fullName: 'Meera Singh', 
    phone: '9876543213',
    role: 'field_agent' 
  },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const results = []

    for (const user of DEMO_USERS) {
      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find((u: { email?: string }) => u.email === user.email)
      
      if (existingUser) {
        // Update password, role, and profile for existing user
        await supabase.auth.admin.updateUserById(existingUser.id, {
          password: user.password,
          user_metadata: { full_name: user.fullName }
        })
        
        // Update profile with phone number
        await supabase
          .from('profiles')
          .upsert({
            id: existingUser.id,
            email: user.email,
            full_name: user.fullName,
            phone: user.phone,
            is_active: true
          }, { onConflict: 'id' })
        
        await supabase
          .from('user_roles')
          .upsert({ user_id: existingUser.id, role: user.role }, { onConflict: 'user_id' })
        
        results.push({ email: user.email, status: 'updated', message: 'Password, profile and role updated' })
        continue
      }

      // Create new user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { full_name: user.fullName }
      })

      if (authError) {
        results.push({ email: user.email, status: 'error', message: authError.message })
        continue
      }

      // Create profile with all details
      await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: user.email,
          full_name: user.fullName,
          phone: user.phone,
          is_active: true
        }, { onConflict: 'id' })

      // Assign role (override default)
      await supabase
        .from('user_roles')
        .upsert({ user_id: authData.user.id, role: user.role }, { onConflict: 'user_id' })

      results.push({ email: user.email, status: 'created', role: user.role })
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        credentials: DEMO_USERS.map(u => ({ 
          email: u.email, 
          password: u.password, 
          role: u.role,
          name: u.fullName 
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
