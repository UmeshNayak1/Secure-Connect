import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, UserPlus, Check, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/MainLayout';

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
}

interface FollowStatus {
  [key: string]: 'none' | 'pending' | 'accepted' | 'rejected';
}

const Discover = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [followStatus, setFollowStatus] = useState<FollowStatus>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfiles();
      fetchFollowStatus();
    }
  }, [user]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error: any) {
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id, status')
        .eq('follower_id', user?.id);

      if (error) throw error;

      const statusMap: FollowStatus = {};
      data?.forEach((follow) => {
        statusMap[follow.following_id] = follow.status as 'none' | 'pending' | 'accepted' | 'rejected';
      });
      setFollowStatus(statusMap);
    } catch (error: any) {
      console.error('Failed to fetch follow status:', error);
    }
  };

  const handleFollow = async (profileId: string) => {
    try {
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: user?.id,
          following_id: profileId,
          status: 'pending',
        });

      if (error) throw error;

      setFollowStatus({
        ...followStatus,
        [profileId]: 'pending',
      });
      toast.success('Follow request sent!');
    } catch (error: any) {
      toast.error('Failed to send follow request');
    }
  };

  const handleMessage = (profileId: string) => {
    navigate(`/chat/${profileId}`);
  };

  const filteredProfiles = profiles.filter(
    (profile) =>
      profile.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.bio?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Discover People</h1>
          <p className="text-muted-foreground">
            Find and connect with other users
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by name, username, or bio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading profiles...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProfiles.map((profile) => {
              const status = followStatus[profile.id] || 'none';
              const canMessage = status === 'accepted';

              return (
                <Card key={profile.id} className="p-6 space-y-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                        {profile.full_name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{profile.full_name}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        @{profile.username}
                      </p>
                    </div>
                  </div>

                  {profile.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {profile.bio}
                    </p>
                  )}

                  <div className="flex gap-2">
                    {status === 'none' && (
                      <Button
                        onClick={() => handleFollow(profile.id)}
                        className="flex-1"
                        variant="default"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Follow
                      </Button>
                    )}
                    {status === 'pending' && (
                      <Button className="flex-1" variant="secondary" disabled>
                        <Check className="w-4 h-4 mr-2" />
                        Request Sent
                      </Button>
                    )}
                    {status === 'accepted' && (
                      <Button className="flex-1" variant="secondary" disabled>
                        <Check className="w-4 h-4 mr-2" />
                        Following
                      </Button>
                    )}
                    <Button
                      onClick={() => handleMessage(profile.id)}
                      variant="outline"
                      disabled={!canMessage}
                      className="flex-1"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Message
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && filteredProfiles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No profiles found</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Discover;
