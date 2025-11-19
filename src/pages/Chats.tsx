import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Loader2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/MainLayout';
import { toast } from 'sonner';

interface ChatPreview {
  id: string;
  otherUser: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
  };
  lastMessage?: {
    content: string;
    created_at: string;
  };
}

const Chats = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchChats();
    }
  }, [user]);

  const fetchChats = async () => {
    try {
      // Get all chats where user is a participant
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .or(`user1_id.eq.${user?.id},user2_id.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      if (chatsError) throw chatsError;

      // For each chat, get the other user's profile and last message
      const chatPreviews = await Promise.all(
        (chatsData || []).map(async (chat) => {
          const otherUserId = chat.user1_id === user?.id ? chat.user2_id : chat.user1_id;

          // Get other user's profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single();

          // Get last message
          const { data: lastMessage } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            id: chat.id,
            otherUser: profile,
            lastMessage,
          };
        })
      );

      setChats(chatPreviews);
    } catch (error: any) {
      toast.error('Failed to load chats');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleChatClick = (otherUserId: string) => {
    navigate(`/chat/${otherUserId}`);
  };

  const filteredChats = chats.filter((chat) =>
    chat.otherUser.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.otherUser.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Chats</h1>
          <p className="text-muted-foreground">Your private conversations</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading chats...
          </div>
        ) : filteredChats.length === 0 ? (
          <Card className="p-12 text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              {chats.length === 0 ? 'No chats yet' : 'No chats found'}
            </h3>
            <p className="text-muted-foreground">
              {chats.length === 0
                ? 'Start a conversation by messaging someone from the Discover page'
                : 'Try adjusting your search'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredChats.map((chat) => (
              <Card
                key={chat.id}
                className="p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleChatClick(chat.otherUser.id)}
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={chat.otherUser.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                      {chat.otherUser.full_name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold truncate">
                        {chat.otherUser.full_name}
                      </h3>
                      {chat.lastMessage && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(chat.lastMessage.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {chat.lastMessage?.content || 'Start a conversation'}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Chats;
