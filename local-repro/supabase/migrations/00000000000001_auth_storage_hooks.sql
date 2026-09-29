CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO storage.buckets (id,name,public) VALUES ('key-visuals','key-visuals',true),('customer-avatars','customer-avatars',true),('character-images','character-images',true),('blog-covers','blog-covers',true) ON CONFLICT DO NOTHING;
