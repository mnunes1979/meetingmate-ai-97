import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AccessType = 'full' | 'renewals_only';

export const useUserAccess = () => {
  const [accessType, setAccessType] = useState<AccessType>('full');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAccessType = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('access_type')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching access type:', error);
          setAccessType('full');
        } else {
          setAccessType((data?.access_type as AccessType) || 'full');
        }
      } catch (error) {
        console.error('Error in useUserAccess:', error);
        setAccessType('full');
      } finally {
        setLoading(false);
      }
    };

    fetchAccessType();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchAccessType();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { accessType, loading };
};
