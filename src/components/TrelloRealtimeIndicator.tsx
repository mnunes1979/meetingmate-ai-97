import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function TrelloRealtimeIndicator() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('trello-realtime-status')
      .on('system', {}, (payload) => {
        if (payload.status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
      })
      .subscribe();

    // Check connection status periodically
    const interval = setInterval(() => {
      const state = channel.state;
      setIsConnected(state === 'joined' || state === 'joining');
    }, 3000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Badge 
      variant="outline" 
      className={`gap-1 ${
        isConnected 
          ? 'bg-sentiment-positive/10 text-sentiment-positive border-sentiment-positive/20' 
          : 'bg-muted text-muted-foreground border-border'
      }`}
    >
      {isConnected ? (
        <>
          <Wifi className="w-3 h-3" />
          Tempo Real
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Desconectado
        </>
      )}
    </Badge>
  );
}
