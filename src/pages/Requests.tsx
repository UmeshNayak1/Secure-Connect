import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import MainLayout from '@/components/MainLayout';

interface FollowRequest {
  id: string;
  follower: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    bio: string | null;
  };
  created_at: string;
}

const Requests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('follows')
        .select(`
          id,
          created_at,
          follower:follower_id (
            id,
            username,
            full_name,
            avatar_url,
            bio
          )
        `)
        .eq('following_id', user?.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedRequests = (data || []).map((req: any) => ({
        id: req.id,
        follower: req.follower,
        created_at: req.created_at,
      }));

      setRequests(formattedRequests);
    } catch (error: any) {
      toast.error('Failed to load follow requests');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (requestId: string, followerId: string) => {
    try {
      // Update follow status
      const { error: followError } = await supabase
        .from('follows')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (followError) throw followError;

      // Create or get chat between users
      const sortedIds = [user?.id, followerId].sort();
      const { data: existingChat } = await supabase
        .from('chats')
        .select('id')
        .eq('user1_id', sortedIds[0])
        .eq('user2_id', sortedIds[1])
        .single();

      let chatId = existingChat?.id;

      if (!chatId) {
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            user1_id: sortedIds[0],
            user2_id: sortedIds[1],
          })
          .select('id')
          .single();

        if (chatError) throw chatError;
        chatId = newChat.id;
      }

      // Send system message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user?.id,
          content: '🎉 Your follow request has been accepted! You are now connected and can start chatting.',
        });

      if (messageError) throw messageError;

      setRequests(requests.filter((r) => r.id !== requestId));
      toast.success('Follow request accepted! You can now chat.');
    } catch (error: any) {
      console.error('Error accepting request:', error);
      toast.error('Failed to accept request');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('follows')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) throw error;

      setRequests(requests.filter((r) => r.id !== requestId));
      toast.success('Follow request rejected');
    } catch (error: any) {
      toast.error('Failed to reject request');
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Follow Requests</h1>
          <p className="text-muted-foreground">
            Review who wants to connect with you
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <Card className="p-12 text-center">
            <UserPlus className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No pending requests</h3>
            <p className="text-muted-foreground">
              You'll see follow requests here when people want to connect
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id} className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={request.follower.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                      {request.follower.full_name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{request.follower.full_name}</h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      @{request.follower.username}
                    </p>
                    {request.follower.bio && (
                      <p className="text-sm text-muted-foreground mb-4">
                        {request.follower.bio}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAccept(request.id, request.follower.id)}
                        className="bg-success hover:bg-success/90"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Accept
                      </Button>
                      <Button
                        onClick={() => handleReject(request.id)}
                        variant="outline"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
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

export default Requests;
