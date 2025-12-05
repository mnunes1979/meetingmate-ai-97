import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface TrelloCard {
  id: string;
  user_id: string;
  note_id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  error_message: string | null;
  labels: any;
  created_at: string;
  updated_at: string;
}

interface UseTrelloRealtimeOptions {
  onInsert?: (card: TrelloCard) => void;
  onUpdate?: (card: TrelloCard) => void;
  onDelete?: (id: string) => void;
  showNotifications?: boolean;
}

export function useTrelloRealtime(options: UseTrelloRealtimeOptions = {}) {
  const { 
    onInsert, 
    onUpdate, 
    onDelete, 
    showNotifications = true 
  } = options;
  const { toast } = useToast();

  const handleInsert = useCallback(
    async (payload: RealtimePostgresChangesPayload<TrelloCard>) => {
      const newCard = payload.new as TrelloCard;
      
      if (showNotifications) {
        // Fetch user info for the notification
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', newCard.user_id)
          .single();

        const userName = profile?.name || 'Um utilizador';
        
        toast({
          title: "🎯 Nova Tarefa Trello",
          description: `${userName} criou: "${newCard.title}"`,
          duration: 5000,
        });
      }

      if (onInsert) {
        onInsert(newCard);
      }
    },
    [onInsert, showNotifications, toast]
  );

  const handleUpdate = useCallback(
    async (payload: RealtimePostgresChangesPayload<TrelloCard>) => {
      const updatedCard = payload.new as TrelloCard;
      const oldCard = payload.old as TrelloCard;

      // Only show notification if status changed
      if (showNotifications && oldCard.status !== updatedCard.status) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', updatedCard.user_id)
          .single();

        const userName = profile?.name || 'Um utilizador';
        const statusMessages = {
          created: "✅ completou",
          failed: "❌ encontrou erro em",
          draft: "📝 atualizou",
        };

        const statusMessage = statusMessages[updatedCard.status as keyof typeof statusMessages] || "atualizou";
        
        toast({
          title: "Tarefa Atualizada",
          description: `${userName} ${statusMessage}: "${updatedCard.title}"`,
          duration: 4000,
        });
      }

      if (onUpdate) {
        onUpdate(updatedCard);
      }
    },
    [onUpdate, showNotifications, toast]
  );

  const handleDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<TrelloCard>) => {
      const deletedCard = payload.old as TrelloCard;
      
      if (showNotifications) {
        toast({
          title: "Tarefa Removida",
          description: `"${deletedCard.title}" foi removida`,
          duration: 3000,
        });
      }

      if (onDelete) {
        onDelete(deletedCard.id);
      }
    },
    [onDelete, showNotifications, toast]
  );

  useEffect(() => {
    const channel = supabase
      .channel('trello-cards-changes')
      .on<TrelloCard>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trello_cards',
        },
        handleInsert
      )
      .on<TrelloCard>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trello_cards',
        },
        handleUpdate
      )
      .on<TrelloCard>(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'trello_cards',
        },
        handleDelete
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleInsert, handleUpdate, handleDelete]);
}
