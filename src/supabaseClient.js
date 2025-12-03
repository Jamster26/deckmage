import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tiozvppiwowrkhodzgmx.supabase.co'
const supabaseAnonKey = 'sb_publishable_0Y_2cpi39bxveXZqQkpSSg_z5GbJrvK'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)