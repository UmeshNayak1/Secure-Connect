-- Create storage bucket for chat media and files
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat files
CREATE POLICY "Chat files are accessible to chat participants"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-files' AND
  EXISTS (
    SELECT 1 FROM chats c
    WHERE (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    AND (storage.foldername(name))[1] = c.id::text
  )
);

CREATE POLICY "Users can upload files to their chats"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-files' AND
  EXISTS (
    SELECT 1 FROM chats c
    WHERE (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    AND (storage.foldername(name))[1] = c.id::text
  )
);

CREATE POLICY "Users can delete files from their chats"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-files' AND
  EXISTS (
    SELECT 1 FROM chats c
    WHERE (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    AND (storage.foldername(name))[1] = c.id::text
  )
);