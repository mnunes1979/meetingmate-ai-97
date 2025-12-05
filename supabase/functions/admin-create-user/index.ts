import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPER_ADMIN_EMAIL = "mnunes.maciel@gmail.com";

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).trim(),
  department_id: z.string().uuid().nullable().optional(),
  role: z.enum(['admin', 'sales_rep']).default('sales_rep'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: isAdmin } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!isAdmin) {
      throw new Error('Only admins can create users');
    }

    // Check if user is super admin (for creating admin users)
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

    // Rate limiting check
    const { data: recentActions } = await supabaseAdmin
      .from('rate_limits')
      .select('id')
      .eq('user_id', user.id)
      .eq('action', 'admin_create_user')
      .gte('created_at', new Date(Date.now() - 60000).toISOString());

    if (recentActions && recentActions.length >= 10) {
      throw new Error('Rate limit exceeded. Maximum 10 user creations per minute.');
    }

    const requestData = await req.json();
    const { email, password, name, department_id, role } = createUserSchema.parse(requestData);

    // Only super admin can create admin users
    if (role === 'admin' && !isSuperAdmin) {
      throw new Error('Only super admin can create admin users');
    }

    // Log rate limit
    await supabaseAdmin.from('rate_limits').insert({
      user_id: user.id,
      action: 'admin_create_user',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || null,
    });

    // Create user with admin privileges
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createError) {
      throw createError;
    }

    if (!newUser.user) {
      throw new Error('Failed to create user');
    }

    // Update profile with department_id if provided
    if (department_id) {
      await supabaseAdmin
        .from('profiles')
        .update({ department_id })
        .eq('id', newUser.user.id);
    }

    // Create role entry
    await supabaseAdmin.from('user_roles').insert({
      user_id: newUser.user.id,
      role: role,
    });

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'create_user',
      resource_type: 'user',
      resource_id: newUser.user.id,
      metadata: {
        created_email: email,
        created_name: name,
        assigned_role: role,
        department_id: department_id || null,
      },
    });

    console.log(`User created: ${email} with role ${role} by ${user.email}`);

    return new Response(
      JSON.stringify({ user: newUser }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating user:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
