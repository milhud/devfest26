import { FlowgladServer } from '@flowglad/nextjs/server';
import { createClient } from '@/lib/supabase/server';

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (customerExternalId) => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return {
        email: user?.email || `${customerExternalId}@gesturedj.live`,
        name: user?.user_metadata?.full_name || user?.email || 'Guest',
      };
    },
  });
};
