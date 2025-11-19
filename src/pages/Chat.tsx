import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Send, Loader2, Paperclip, Download, FileText, Film, Image as ImageIcon, Video, X, Smile } from 'lucide-react';
import { toast } from 'sonner';
import MainLayout from '@/components/MainLayout';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  media_url: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
}

const Chat = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canChat, setCanChat] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);

  useEffect(() => {
    if (user && userId) {
      initializeChat();
    }
  }, [user, userId]);

  useEffect(() => {
    if (chatId) {
      subscribeToMessages();
      loadReactions();
      subscribeToReactions();
    }
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeChat = async () => {
    try {
      // Get other user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setOtherUser(profile);

      // Check if users are connected (bidirectional follow check)
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('status')
        .or(`and(follower_id.eq.${user?.id},following_id.eq.${userId}),and(follower_id.eq.${userId},following_id.eq.${user?.id})`)
        .eq('status', 'accepted');

      if (followError && followError.code !== 'PGRST116') {
        console.error('Follow check error:', followError);
      }

      const isConnected = followData && followData.length > 0;
      setCanChat(isConnected);

      if (!isConnected) {
        toast.error('You need to be connected to chat with this user');
        setLoading(false);
        return;
      }

      // Find or create chat
      const sortedIds = [user?.id, userId].sort();
      const { data: existingChat, error: chatError } = await supabase
        .from('chats')
        .select('id')
        .eq('user1_id', sortedIds[0])
        .eq('user2_id', sortedIds[1])
        .single();

      if (chatError && chatError.code === 'PGRST116') {
        // Create new chat
        const { data: newChat, error: createError } = await supabase
          .from('chats')
          .insert({
            user1_id: sortedIds[0],
            user2_id: sortedIds[1],
          })
          .select('id')
          .single();

        if (createError) throw createError;
        setChatId(newChat.id);
      } else if (chatError) {
        throw chatError;
      } else {
        setChatId(existingChat.id);
      }
    } catch (error: any) {
      console.error('Error initializing chat:', error);
      toast.error('Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = async () => {
    // Load existing messages
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      setMessages(data || []);
    }

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((current) => [...current, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !chatId || sending) return;

    setSending(true);
    setUploading(selectedFile !== null);

    try {
      let mediaUrl = null;

      // Upload file if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${chatId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-files')
          .getPublicUrl(filePath);

        mediaUrl = publicUrl;
      }

      // Send message with or without media
      const { error } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user?.id,
        content: newMessage.trim() || (selectedFile ? selectedFile.name : ''),
        media_url: mediaUrl,
      });

      if (error) throw error;

      setNewMessage('');
      setSelectedFile(null);
      setFilePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const getFileIcon = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return ImageIcon;
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '')) return Film;
    return FileText;
  };

  const isImageFile = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const isVideoFile = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '');
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('File downloaded!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  const loadReactions = async () => {
    if (!chatId) return;

    // Get all message IDs for this chat
    const { data: messageIds } = await supabase
      .from('messages')
      .select('id')
      .eq('chat_id', chatId);

    if (!messageIds || messageIds.length === 0) return;

    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds.map(m => m.id));

    if (error) {
      console.error('Error loading reactions:', error);
      return;
    }

    const reactionsByMessage: Record<string, Reaction[]> = {};
    data?.forEach((reaction) => {
      if (!reactionsByMessage[reaction.message_id]) {
        reactionsByMessage[reaction.message_id] = [];
      }
      reactionsByMessage[reaction.message_id].push(reaction);
    });
    setReactions(reactionsByMessage);
  };

  const subscribeToReactions = () => {
    const channel = supabase
      .channel(`reactions:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const newReaction = payload.new as Reaction;
          setReactions((current) => ({
            ...current,
            [newReaction.message_id]: [
              ...(current[newReaction.message_id] || []),
              newReaction,
            ],
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const deletedReaction = payload.old as Reaction;
          setReactions((current) => ({
            ...current,
            [deletedReaction.message_id]: (current[deletedReaction.message_id] || []).filter(
              (r) => r.id !== deletedReaction.id
            ),
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const messageReactions = reactions[messageId] || [];
    const existingReaction = messageReactions.find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existingReaction.id);

      if (error) {
        console.error('Error removing reaction:', error);
        toast.error('Failed to remove reaction');
      }
    } else {
      // Add reaction
      const { error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });

      if (error) {
        console.error('Error adding reaction:', error);
        toast.error('Failed to add reaction');
      }
    }

    setShowReactionPicker(null);
  };

  const getReactionCounts = (messageId: string) => {
    const messageReactions = reactions[messageId] || [];
    const counts: Record<string, { count: number; userReacted: boolean }> = {};

    messageReactions.forEach((reaction) => {
      if (!counts[reaction.emoji]) {
        counts[reaction.emoji] = { count: 0, userReacted: false };
      }
      counts[reaction.emoji].count++;
      if (reaction.user_id === user?.id) {
        counts[reaction.emoji].userReacted = true;
      }
    });

    return counts;
  };

  const popularEmojis = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!canChat) {
    return (
      <MainLayout>
        <Card className="p-12 text-center max-w-md mx-auto">
          <h2 className="text-xl font-semibold mb-2">Cannot Start Chat</h2>
          <p className="text-muted-foreground mb-4">
            You need to be connected with this user to start chatting.
          </p>
          <Button onClick={() => navigate('/discover')}>
            Back to Discover
          </Button>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <Card className="flex flex-col h-[calc(100vh-12rem)]">
          {/* Chat Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/chats')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Avatar className="h-10 w-10">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                {otherUser?.full_name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate">{otherUser?.full_name}</h2>
              <p className="text-sm text-muted-foreground truncate">
                @{otherUser?.username}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message) => {
                const isOwn = message.sender_id === user?.id;
                const hasMedia = !!message.media_url;
                const FileIcon = hasMedia ? getFileIcon(message.media_url!) : null;
                const reactionCounts = getReactionCounts(message.id);
                
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div className="relative group">
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          isOwn
                            ? 'bg-gradient-primary text-primary-foreground rounded-br-sm'
                            : 'bg-secondary text-secondary-foreground rounded-bl-sm'
                        }`}
                      >
                        {hasMedia ? (
                          <div className="space-y-2">
                            {isImageFile(message.media_url!) ? (
                              <img
                                src={message.media_url!}
                                alt={message.content}
                                className="rounded-lg max-w-full h-auto max-h-64 object-cover"
                              />
                            ) : isVideoFile(message.media_url!) ? (
                              <video
                                src={message.media_url!}
                                controls
                                className="rounded-lg max-w-full h-auto max-h-64"
                              />
                            ) : (
                              <div className="flex items-center gap-2 p-2 bg-black/10 rounded-lg">
                                {FileIcon && <FileIcon className="w-8 h-8" />}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{message.content}</p>
                                </div>
                              </div>
                            )}
                            <a
                              href={message.media_url!}
                              download
                              className="flex items-center gap-2 text-xs hover:underline"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </a>
                          </div>
                        ) : (
                          <p className="break-words">{message.content}</p>
                        )}
                        <span
                          className={`text-xs mt-1 block ${
                            isOwn
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      
                      {/* Reaction button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background shadow-sm"
                        onClick={() => setShowReactionPicker(showReactionPicker === message.id ? null : message.id)}
                      >
                        <Smile className="w-3 h-3" />
                      </Button>
                      
                      {/* Reaction picker */}
                      {showReactionPicker === message.id && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-background border border-border rounded-lg p-2 shadow-lg flex gap-1 z-10">
                          {popularEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(message.id, emoji)}
                              className="hover:bg-accent rounded p-1 text-xl transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Display reactions */}
                    {Object.keys(reactionCounts).length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {Object.entries(reactionCounts).map(([emoji, { count, userReacted }]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(message.id, emoji)}
                            className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 transition-colors ${
                              userReacted
                                ? 'bg-primary/20 border border-primary'
                                : 'bg-secondary border border-border hover:bg-accent'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-border"
          >
            {/* File Preview */}
            {selectedFile && (
              <div className="mb-3 p-3 bg-secondary rounded-lg">
                <div className="flex items-start gap-3">
                  {filePreview ? (
                    <img
                      src={filePreview}
                      alt="Preview"
                      className="w-20 h-20 object-cover rounded"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                    className="shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !!selectedFile}
              >
                <Paperclip className="w-5 h-5" />
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                disabled={sending || uploading}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={(!newMessage.trim() && !selectedFile) || sending || uploading}
                className="bg-gradient-primary"
              >
                {sending || uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Chat;
