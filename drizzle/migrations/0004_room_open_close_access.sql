ALTER TABLE public.rooms ADD COLUMN is_open boolean NOT NULL DEFAULT true;
ALTER TABLE public.rooms ADD COLUMN signaling_key uuid NOT NULL DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION public.rotate_room_signaling_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_open IS DISTINCT FROM OLD.is_open THEN
    NEW.signaling_key := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER rooms_rotate_signaling_key BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.rotate_room_signaling_key();

CREATE OR REPLACE FUNCTION public.get_room_access(_room_id uuid)
RETURNS TABLE(is_open boolean, is_owner boolean, signaling_key uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.is_open, r.owner_id = auth.uid(),
    CASE WHEN r.is_open THEN r.signaling_key ELSE NULL END
  FROM public.rooms r
  WHERE r.id = _room_id AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_room_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_access(uuid) TO authenticated, service_role;