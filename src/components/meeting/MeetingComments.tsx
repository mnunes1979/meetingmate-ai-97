import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

interface Comment {
  id: string;
  content: string;
  user_id: string;
  mentions: string[];
  created_at: string;
  user?: {
    name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

interface MeetingCommentsProps {
  meetingId: string;
  userId: string;
}

export const MeetingComments = ({ meetingId, userId }: MeetingCommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadComments();
    loadTeamMembers();

    // Subscribe to new comments
    const channel = supabase
      .channel(`comments:${meetingId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'meeting_comments',
        filter: `meeting_id=eq.${meetingId}`,
      }, async (payload) => {
        const newComment = payload.new as Comment;
        // Fetch user info
        const { data: userData } = await supabase
          .from('profiles')
          .select('name, email, avatar_url')
          .eq('id', newComment.user_id)
          .single();
        
        setComments(prev => [...prev, { ...newComment, user: userData || undefined }]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId]);

  const loadComments = async () => {
    const { data, error } = await supabase
      .from('meeting_comments')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Fetch user info for each comment
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: users } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url')
        .in('id', userIds);

      const usersMap = new Map(users?.map(u => [u.id, u]) || []);
      
      setComments(data.map(c => ({
        ...c,
        user: usersMap.get(c.user_id),
      })));
    }
  };

  const loadTeamMembers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url')
      .eq('active', true);

    if (data) setTeamMembers(data);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNewComment(value);
    setCursorPosition(cursorPos);

    // Check for @ mention
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1 && !textBeforeCursor.slice(lastAtIndex).includes(' ')) {
      const filter = textBeforeCursor.slice(lastAtIndex + 1).toLowerCase();
      setMentionFilter(filter);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (member: TeamMember) => {
    const textBeforeCursor = newComment.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = newComment.slice(cursorPosition);
    
    const displayName = member.name || member.email.split('@')[0];
    const newText = textBeforeCursor.slice(0, lastAtIndex) + `@${displayName} ` + textAfterCursor;
    
    setNewComment(newText);
    setShowMentions(false);

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionName = match[1].toLowerCase();
      const member = teamMembers.find(m => 
        (m.name?.toLowerCase().includes(mentionName)) ||
        (m.email.split('@')[0].toLowerCase().includes(mentionName))
      );
      if (member) mentions.push(member.id);
    }

    return [...new Set(mentions)];
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    const mentions = extractMentions(newComment);

    const { data, error } = await supabase
      .from('meeting_comments')
      .insert({
        meeting_id: meetingId,
        user_id: userId,
        content: newComment,
        mentions,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro", description: "Erro ao enviar comentário", variant: "destructive" });
      return;
    }

    // Create notifications for mentioned users
    if (mentions.length > 0) {
      const notifications = mentions
        .filter(id => id !== userId)
        .map(mentionedUserId => ({
          user_id: mentionedUserId,
          type: 'mention',
          title: 'Mencionado num comentário',
          message: newComment.slice(0, 100),
          reference_type: 'meeting',
          reference_id: meetingId,
        }));

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    }

    setNewComment("");
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase
      .from('meeting_comments')
      .delete()
      .eq('id', commentId);

    if (!error) {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return email.slice(0, 2).toUpperCase();
  };

  const filteredMembers = teamMembers.filter(m => 
    (m.name?.toLowerCase().includes(mentionFilter)) ||
    (m.email.toLowerCase().includes(mentionFilter))
  );

  const highlightMentions = (text: string) => {
    return text.replace(/@(\w+)/g, '<span class="text-primary font-medium">@$1</span>');
  };

  return (
    <Card className="p-4 sm:p-6 h-full flex flex-col">
      <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        Comentários
      </h3>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-[400px]">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Sem comentários. Seja o primeiro a comentar!
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 group">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={comment.user?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {getInitials(comment.user?.name || null, comment.user?.email || '')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {comment.user?.name || comment.user?.email || 'Utilizador'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), { 
                      addSuffix: true, 
                      locale: pt 
                    })}
                  </span>
                  {comment.user_id === userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(comment.id)}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-sentiment-negative" />
                    </Button>
                  )}
                </div>
                <p 
                  className="text-sm mt-1"
                  dangerouslySetInnerHTML={{ __html: highlightMentions(comment.content) }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="relative">
        {showMentions && filteredMembers.length > 0 && (
          <Card className="absolute bottom-full mb-2 left-0 right-0 p-2 max-h-[150px] overflow-y-auto z-10">
            {filteredMembers.slice(0, 5).map(member => (
              <button
                key={member.id}
                className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded text-sm text-left"
                onClick={() => insertMention(member)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(member.name, member.email)}
                  </AvatarFallback>
                </Avatar>
                <span>{member.name || member.email}</span>
              </button>
            ))}
          </Card>
        )}

        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleInputChange}
            placeholder="Escreva um comentário... Use @ para mencionar"
            className="resize-none min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button onClick={handleSubmit} size="icon" className="flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
