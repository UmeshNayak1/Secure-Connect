import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { MessageSquare, Lock, Shield, Users } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/discover');
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-secondary">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-primary blur-3xl opacity-40 rounded-full"></div>
                <div className="relative bg-gradient-primary rounded-3xl p-6 shadow-xl">
                  <MessageSquare className="w-16 h-16 text-primary-foreground" />
                </div>
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              SecureConnect
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Privacy-first social messaging platform. Connect securely, chat freely, control who reaches you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 my-12">
            <div className="bg-card p-6 rounded-2xl shadow-md border border-border/50">
              <Lock className="w-10 h-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Private by Default</h3>
              <p className="text-sm text-muted-foreground">
                Your account is private. Only accepted followers can message you.
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-md border border-border/50">
              <Shield className="w-10 h-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Secure Messaging</h3>
              <p className="text-sm text-muted-foreground">
                End-to-end encrypted conversations keep your chats private.
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-md border border-border/50">
              <Users className="w-10 h-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Discover People</h3>
              <p className="text-sm text-muted-foreground">
                Find and connect with people who share your interests.
              </p>
            </div>
          </div>

          <Button
            onClick={() => navigate('/auth')}
            size="lg"
            className="bg-gradient-primary hover:opacity-90 transition-opacity text-lg px-8 py-6"
          >
            Get Started
          </Button>
        </div>
        <footer className="mt-20 border-t border-border/40 py-6">
          <div className="container mx-auto px-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} SecureConnect. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              • Free to use • No ads • Privacy-first
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
