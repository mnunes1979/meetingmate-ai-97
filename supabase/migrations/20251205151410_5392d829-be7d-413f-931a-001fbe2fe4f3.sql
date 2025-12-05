-- Add department_id to profiles to link users to departments
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);

-- Update RLS to allow admins to see department info
CREATE POLICY "Users can view departments they belong to" 
ON public.departments 
FOR SELECT 
USING (
  id IN (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);